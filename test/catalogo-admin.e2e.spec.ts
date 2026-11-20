import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { argon2id, hash } from 'argon2';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { ARMAZENAMENTO, ArmazenamentoDeArquivo } from '../src/modules/identidade/domain/ports/armazenamento.port';
import { REMETENTE_DE_EMAIL } from '../src/modules/identidade/domain/ports/remetente-de-email.port';

class MemoriaArmazenamento implements ArmazenamentoDeArquivo {
  readonly objetos = new Map<string, { bytes: Buffer; mime: string }>();
  async guardar(chave: string, bytes: Buffer, mime: string): Promise<void> {
    this.objetos.set(chave, { bytes: Buffer.from(bytes), mime });
  }
  async ler(chave: string): Promise<{ bytes: Buffer; mime: string } | null> {
    return this.objetos.get(chave) ?? null;
  }
  async apagar(chave: string): Promise<void> {
    this.objetos.delete(chave);
  }
}

describe('Catálogo no painel (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  const armazenamento = new MemoriaArmazenamento();
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue({ entregue: true });

  beforeAll(async () => {
    process.env.RATE_LIMIT_LIMITE = '1000';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao })
      .overrideProvider(ARMAZENAMENTO)
      .useValue(armazenamento)
      .compile();
    app = modulo.createNestApplication();
    prepararAplicacao(app);
    await app.init();
    dados = modulo.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('grava a ficha, a mídia autorizada, unifica a duplicata e arquiva', async () => {
    const operador = await criarAdmin(dados);
    const entrada = await request(app.getHttpServer()).post('/v1/admin/sign-in').send({ email: operador.email, senha: operador.senha });
    const auth = { Authorization: `Bearer ${entrada.body.accessToken}` };
    const viajante = await entrar(app, enviarCodigoDeVerificacao);
    const marca = randomUUID().slice(0, 8);
    const cidadeId = randomUUID();
    const paisId = randomUUID();
    await dados.query(`INSERT INTO geography.countries (id, name) VALUES ($1, $2)`, [paisId, `Pais ${marca}`]);
    await dados.query(`INSERT INTO geography.cities (id, country_id, name) VALUES ($1, $2, $3)`, [cidadeId, paisId, `Cidade ${marca}`]);

    expect((await request(app.getHttpServer()).get('/v1/admin/places')).status).toBe(401);

    const categoria = await request(app.getHttpServer())
      .post('/v1/admin/place-categories')
      .set(auth)
      .send({ slug: `comer-${marca}`, translations: [{ locale: 'pt-BR', name: `Comer ${marca}` }, { locale: 'en', name: `Eat ${marca}` }] });
    expect(categoria.status).toBe(201);
    const solta = await request(app.getHttpServer())
      .post('/v1/admin/place-categories')
      .set(auth)
      .send({ slug: `solta-${marca}`, parentId: categoria.body.id, translations: [{ locale: 'pt-BR', name: `Solta ${marca}` }] });
    expect(solta.status).toBe(201);

    const criado = await request(app.getHttpServer()).post('/v1/admin/places').set(auth).send(corpo(marca, cidadeId, categoria.body.id));
    expect(criado.status).toBe(201);
    const lugarId = criado.body.id as string;
    expect(criado.body).toMatchObject({
      slug: `lugar-${marca}`,
      status: 'active',
      translations: [expect.objectContaining({ locale: 'en', name: `Place ${marca}` })],
      categoryIds: [categoria.body.id],
      addresses: [expect.objectContaining({ neighborhood: `Trastevere ${marca}`, cityId: cidadeId })],
      openingHours: [expect.objectContaining({ weekday: 2, openingTime: '09:00:00', isClosed: false })],
      prices: [expect.objectContaining({ currency: 'BRL', minimumPrice: 10, maximumPrice: 40 })],
      visitInformation: [expect.objectContaining({ recommendedDurationMinutes: 90 })],
      externalReferences: [expect.objectContaining({ provider: 'google-places', externalId: `ext-${marca}`, providerMetadata: { fonte: marca } })],
    });

    const midia = await request(app.getHttpServer())
      .post(`/v1/admin/places/${lugarId}/media`)
      .set(auth)
      .query({ atribuicao: `Autor ${marca}`, ordem: '1' })
      .attach('arquivo', Buffer.from(`foto-${marca}`), { filename: 'foto.jpg', contentType: 'image/jpeg' });
    expect(midia.status).toBe(201);
    const publica = await request(app.getHttpServer()).get(`/v1/catalog/places/${lugarId}`).set({ Authorization: `Bearer ${viajante}` });
    expect(publica.body.media).toEqual([expect.objectContaining({ id: midia.body.id, mediaType: 'photo' })]);
    const arquivo = await request(app.getHttpServer()).get(`/v1/catalog/places/${lugarId}/media/${midia.body.id}`).set({ Authorization: `Bearer ${viajante}` });
    expect(arquivo.status).toBe(200);
    expect(arquivo.body.toString()).toBe(`foto-${marca}`);

    const duplicata = await request(app.getHttpServer())
      .post('/v1/admin/places')
      .set(auth)
      .send({
        ...corpo(`dup-${marca}`, cidadeId, categoria.body.id),
        slug: `dup-${marca}`,
        name: `Duplicata ${marca}`,
        translations: [{ locale: 'pt-PT', name: `Duplicado ${marca}`, description: null }],
        addresses: [{ line1: null, neighborhood: `Monti ${marca}`, postalCode: null, cityId: cidadeId }],
        externalReferences: [],
      });
    expect(duplicata.status).toBe(201);
    await dados.query(
      `INSERT INTO community.place_reviews (place_id, user_id, rating, status) VALUES ($1, $2, 5, 'published'), ($1, $2, 1, 'hidden')`,
      [duplicata.body.id, viajanteId(viajante)],
    );
    const unido = await request(app.getHttpServer()).post(`/v1/admin/places/${lugarId}/merge`).set(auth).send({ origemId: duplicata.body.id });
    expect(unido.status).toBe(201);
    expect(unido.body.addresses.map((item: { neighborhood: string }) => item.neighborhood).sort()).toEqual([`Monti ${marca}`, `Trastevere ${marca}`]);
    expect(unido.body.translations).toEqual(expect.arrayContaining([expect.objectContaining({ locale: 'pt-PT', name: `Duplicado ${marca}` })]));
    expect(unido.body.totalReviews).toBe(1);
    expect(unido.body.averageRating).toBe(5);
    expect((await request(app.getHttpServer()).get(`/v1/catalog/places/${duplicata.body.id}`).set({ Authorization: `Bearer ${viajante}` })).status).toBe(404);
    expect((await request(app.getHttpServer()).post(`/v1/admin/places/${lugarId}/merge`).set(auth).send({ origemId: lugarId })).status).toBe(409);

    const arquivado = await request(app.getHttpServer()).post(`/v1/admin/places/${lugarId}/archive`).set(auth);
    expect(arquivado.body.status).toBe('archived');
    expect((await request(app.getHttpServer()).get(`/v1/catalog/places/${lugarId}`).set({ Authorization: `Bearer ${viajante}` })).status).toBe(404);
    const lista = await request(app.getHttpServer()).get('/v1/admin/places').query({ q: marca, status: 'archived', page: '1' }).set(auth);
    expect(lista.body).toMatchObject({ page: 1, pageSize: 10, total: expect.any(Number) });
    expect(lista.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: lugarId, status: 'archived' })]));

    expect((await request(app.getHttpServer()).delete(`/v1/admin/place-categories/${categoria.body.id}`).set(auth)).status).toBe(409);
    expect((await request(app.getHttpServer()).delete(`/v1/admin/place-categories/${solta.body.id}`).set(auth)).status).toBe(204);

    const endereco = await dados.query<{ neighborhood: string }[]>(`SELECT neighborhood FROM catalog.place_addresses WHERE place_id = $1`, [lugarId]);
    const horario = await dados.query<{ weekday: number }[]>(`SELECT weekday FROM catalog.place_opening_hours WHERE place_id = $1`, [lugarId]);
    const preco = await dados.query<{ currency: string }[]>(`SELECT currency FROM catalog.place_price_information WHERE place_id = $1`, [lugarId]);
    const visita = await dados.query<{ recommended_duration_minutes: number }[]>(
      `SELECT recommended_duration_minutes FROM catalog.place_visit_information WHERE place_id = $1`,
      [lugarId],
    );
    const referencia = await dados.query<{ external_id: string }[]>(`SELECT external_id FROM catalog.place_external_references WHERE place_id = $1`, [lugarId]);
    const traducao = await dados.query<{ locale: string }[]>(`SELECT locale FROM catalog.place_translations WHERE place_id = $1`, [lugarId]);
    const vinculo = await dados.query<{ category_id: string }[]>(`SELECT category_id FROM catalog.place_category_relations WHERE place_id = $1`, [lugarId]);
    const nomeCategoria = await dados.query<{ name: string }[]>(
      `SELECT name FROM catalog.place_category_translations WHERE category_id = $1 AND locale = 'en'`,
      [categoria.body.id],
    );
    const resumo = await dados.query<{ total_reviews: number }[]>(`SELECT total_reviews FROM catalog.place_ratings_summary WHERE place_id = $1`, [lugarId]);
    expect(endereco.map((item) => item.neighborhood).sort()).toEqual([`Monti ${marca}`, `Trastevere ${marca}`]);
    expect(Number(horario[0]?.weekday)).toBe(2);
    expect(preco[0]?.currency.trim()).toBe('BRL');
    expect(Number(visita[0]?.recommended_duration_minutes)).toBe(90);
    expect(referencia[0]?.external_id).toBe(`ext-${marca}`);
    expect(traducao.map((item) => item.locale).sort()).toEqual(['en', 'pt-PT']);
    expect(vinculo[0]?.category_id).toBe(categoria.body.id);
    expect(nomeCategoria[0]?.name).toBe(`Eat ${marca}`);
    expect(Number(resumo[0]?.total_reviews)).toBe(1);

    const auditoria = JSON.stringify(await dados.query(`SELECT action, new_values FROM admin.admin_audit_logs WHERE entity_id = $1`, [lugarId]));
    expect(auditoria).toContain('place.merge');
    expect(auditoria).toContain('place.archive');
    expect(auditoria).not.toContain(`foto-${marca}`);
  });
});

function corpo(marca: string, cidadeId: string, categoriaId: string) {
  return {
    slug: `lugar-${marca}`,
    name: `Lugar ${marca}`,
    description: `Base ${marca}`,
    cityId: cidadeId,
    latitude: -23.5,
    longitude: -46.6,
    websiteUrl: `https://exemplo.test/${marca}`,
    phone: '+5511999990000',
    status: 'active',
    translations: [{ locale: 'en', name: `Place ${marca}`, description: `Description ${marca}` }],
    categoryIds: [categoriaId],
    addresses: [{ line1: `Rua ${marca}`, neighborhood: `Trastevere ${marca}`, postalCode: '00100', cityId: cidadeId }],
    openingHours: [{ weekday: 2, openingTime: '09:00', closingTime: '18:30', isClosed: false }],
    prices: [{ currency: 'BRL', priceLevel: 2, minimumPrice: 10, maximumPrice: 40 }],
    visitInformation: [{ recommendedDurationMinutes: 90, bestTimeToVisit: `Manhã ${marca}`, accessibilityInformation: `Rampa ${marca}` }],
    externalReferences: [{ provider: 'google-places', externalId: `ext-${marca}`, externalUrl: `https://maps.example/${marca}`, providerMetadata: { fonte: marca } }],
  };
}

async function criarAdmin(dados: DataSource): Promise<{ email: string; senha: string }> {
  const email = `operador-${randomUUID()}@exemplo.com`;
  const senha = 'painel-teste-1';
  const senhaHash = await hash(senha, { type: argon2id });
  await dados.query(`INSERT INTO admin.admin_users (name, email, password_hash) VALUES ('Operador', $1, $2)`, [email, senhaHash]);
  return { email, senha };
}

async function entrar(app: INestApplication, enviar: ReturnType<typeof vi.fn>): Promise<string> {
  const email = `cat-admin-${randomUUID()}@exemplo.com`;
  expect((await request(app.getHttpServer()).post('/v1/auth/sign-up').send({ nome: 'Pessoa E2E', usuario: email.split('@')[0].replace(/[^a-zA-Z0-9._$#&-]+/g, '').slice(0, 60) || 'viajante', email, senha: 'umaSenhaForte123', aceitouTermos: true })).status).toBe(202);
  const codigo = enviar.mock.calls.at(-1)?.[0].codigo as string;
  expect((await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo })).status).toBe(200);
  const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
  return login.body.accessToken as string;
}

function viajanteId(access: string): string {
  return (JSON.parse(Buffer.from(access.split('.')[1] ?? '', 'base64url').toString()) as { sub: string }).sub;
}
