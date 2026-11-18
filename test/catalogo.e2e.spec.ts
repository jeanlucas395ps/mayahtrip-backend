import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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

describe('Catálogo (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  const armazenamento = new MemoriaArmazenamento();
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue(undefined);

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

  it('lê a busca e a página do lugar no idioma pedido', async () => {
    const access = await entrar(app, enviarCodigoDeVerificacao);
    const auth = { Authorization: `Bearer ${access}` };
    const lugar = await semear(dados);

    const semToken = await request(app.getHttpServer()).get('/v1/catalog/places').query({ q: lugar.marca });
    expect(semToken.status).toBe(401);
    const vazio = await request(app.getHttpServer()).get('/v1/catalog/places').set(auth);
    expect(vazio.body).toEqual([]);

    const porCategoria = await request(app.getHttpServer())
      .get('/v1/catalog/places')
      .query({ q: `Trattoria ${lugar.marca}`.toUpperCase(), idioma: 'es' })
      .set(auth);
    expect(porCategoria.status).toBe(200);
    expect(porCategoria.body).toEqual([
      {
        id: lugar.lugarId,
        slug: `lugar-${lugar.marca}`,
        name: `Lugar ${lugar.marca}`,
        cityId: lugar.cidadeId,
        cityName: `Ciudad ${lugar.marca}`,
        categories: [
          {
            id: lugar.categoriaId,
            slug: `trattoria-${lugar.marca}`,
            name: `Trattoria ${lugar.marca}`,
            parentId: lugar.paiId,
          },
        ],
        averageRating: null,
        totalReviews: 0,
      },
    ]);

    const porCidade = await request(app.getHttpServer())
      .get('/v1/catalog/places')
      .query({ q: `Seed City ${lugar.marca}`, idioma: 'en' })
      .set(auth);
    expect(porCidade.body).toEqual([expect.objectContaining({ id: lugar.lugarId, name: `Place ${lugar.marca}`, cityName: `Seed City ${lugar.marca}` })]);

    const porNomeBase = await request(app.getHttpServer())
      .get('/v1/catalog/places')
      .query({ q: `Lugar ${lugar.marca}`, idioma: 'en' })
      .set(auth);
    expect(porNomeBase.body).toEqual([expect.objectContaining({ id: lugar.lugarId, name: `Place ${lugar.marca}` })]);

    const porPai = await request(app.getHttpServer()).get('/v1/catalog/places').query({ q: `Comer ${lugar.marca}` }).set(auth);
    expect(porPai.body).toEqual([]);
    const arquivado = await request(app.getHttpServer()).get('/v1/catalog/places').query({ q: `Arquivado ${lugar.marca}` }).set(auth);
    expect(arquivado.body).toEqual([]);

    const ficha = await request(app.getHttpServer()).get(`/v1/catalog/places/${lugar.lugarId}`).query({ idioma: 'pt-PT' }).set(auth);
    expect(ficha.status).toBe(200);
    expect(ficha.body).toMatchObject({
      name: `Lugar ${lugar.marca}`,
      description: `Descrição ${lugar.marca}`,
      cityName: `Cidade ${lugar.marca}`,
      latitude: -23.5,
      longitude: -46.6,
      websiteUrl: `https://exemplo.test/${lugar.marca}`,
      phone: '+5511999990000',
      categories: [expect.objectContaining({ id: lugar.categoriaId, name: `Trattoria ${lugar.marca}`, parentId: lugar.paiId })],
    });

    const fallback = await request(app.getHttpServer()).get(`/v1/catalog/places/${lugar.lugarId}`).query({ idioma: 'fr' }).set(auth);
    expect(fallback.body.name).toBe(`Lugar pt ${lugar.marca}`);
    expect(await request(app.getHttpServer()).get(`/v1/catalog/places/${randomUUID()}`).set(auth)).toMatchObject({ status: 404 });
    expect(await request(app.getHttpServer()).get(`/v1/catalog/places/${lugar.arquivadoId}`).set(auth)).toMatchObject({ status: 404 });

    const traducao = await dados.query<{ name: string }[]>(
      `SELECT name FROM catalog.place_translations WHERE place_id = $1 AND locale = 'en'`,
      [lugar.lugarId],
    );
    const categoria = await dados.query<{ slug: string; parent_id: string }[]>(
      `SELECT slug, parent_id FROM catalog.place_categories WHERE id = $1`,
      [lugar.categoriaId],
    );
    const nomeCategoria = await dados.query<{ name: string }[]>(
      `SELECT name FROM catalog.place_category_translations WHERE category_id = $1 AND locale = 'es'`,
      [lugar.categoriaId],
    );
    const vinculo = await dados.query<{ place_id: string }[]>(
      `SELECT place_id FROM catalog.place_category_relations WHERE place_id = $1 AND category_id = $2`,
      [lugar.lugarId, lugar.categoriaId],
    );
    expect(traducao[0]?.name).toBe(`Place ${lugar.marca}`);
    expect(categoria[0]).toMatchObject({ slug: `trattoria-${lugar.marca}`, parent_id: lugar.paiId });
    expect(nomeCategoria[0]?.name).toBe(`Trattoria ${lugar.marca}`);
    expect(vinculo).toHaveLength(1);
  });

  it('lê endereço, horário, preço, visita, mídia guardada e referência', async () => {
    const access = await entrar(app, enviarCodigoDeVerificacao);
    const auth = { Authorization: `Bearer ${access}` };
    const lugar = await semear(dados);
    const ficha = await semearFicha(dados, lugar, armazenamento);

    const porBairro = await request(app.getHttpServer()).get('/v1/catalog/places').query({ q: `Trastevere ${lugar.marca}` }).set(auth);
    expect(porBairro.body).toEqual([expect.objectContaining({ id: lugar.lugarId })]);
    const bairroArquivado = await request(app.getHttpServer()).get('/v1/catalog/places').query({ q: `Sumido ${lugar.marca}` }).set(auth);
    expect(bairroArquivado.body).toEqual([]);

    const pagina = await request(app.getHttpServer()).get(`/v1/catalog/places/${lugar.lugarId}`).set(auth);
    expect(pagina.status).toBe(200);
    expect(pagina.body.addresses).toEqual([
      {
        id: ficha.enderecoId,
        line1: `Rua ${lugar.marca}`,
        neighborhood: `Trastevere ${lugar.marca}`,
        postalCode: '00100',
        cityId: lugar.cidadeId,
      },
    ]);
    expect(pagina.body.openingHours).toEqual([
      { id: ficha.fechadoId, weekday: 0, openingTime: null, closingTime: null, isClosed: true },
      { id: ficha.abertoId, weekday: 2, openingTime: '09:00:00', closingTime: '18:30:00', isClosed: false },
    ]);
    expect(pagina.body.prices).toEqual([{ id: ficha.precoId, currency: 'BRL', priceLevel: 2, minimumPrice: 10, maximumPrice: 40 }]);
    expect(pagina.body.visitInformation).toEqual([
      {
        id: ficha.visitaId,
        recommendedDurationMinutes: 90,
        bestTimeToVisit: `Manhã ${lugar.marca}`,
        accessibilityInformation: `Rampa ${lugar.marca}`,
      },
    ]);
    expect(pagina.body.media).toEqual([{ id: ficha.midiaId, mediaType: 'photo', attribution: `Autor ${lugar.marca}`, sortOrder: 1 }]);
    expect(JSON.stringify(pagina.body)).not.toContain(ficha.urlExterna);
    expect(JSON.stringify(pagina.body)).not.toContain(ficha.chave);
    expect(pagina.body.externalReferences).toEqual([
      {
        id: ficha.referenciaId,
        provider: 'google-places',
        externalId: `ext-${lugar.marca}`,
        externalUrl: `https://maps.example/${lugar.marca}`,
        providerMetadata: { fonte: lugar.marca },
        lastSyncedAt: '2026-11-18T12:00:00.000Z',
      },
    ]);

    const arquivo = await request(app.getHttpServer()).get(`/v1/catalog/places/${lugar.lugarId}/media/${ficha.midiaId}`).set(auth);
    expect(arquivo.status).toBe(200);
    expect(arquivo.headers['content-type']).toContain('image/jpeg');
    expect(arquivo.body.toString()).toBe(`foto-${lugar.marca}`);
    expect(await request(app.getHttpServer()).get(`/v1/catalog/places/${lugar.lugarId}/media/${ficha.quarentenaId}`).set(auth)).toMatchObject({ status: 404 });

    const endereco = await dados.query<{ neighborhood: string }[]>(`SELECT neighborhood FROM catalog.place_addresses WHERE id = $1`, [ficha.enderecoId]);
    const horario = await dados.query<{ weekday: number }[]>(`SELECT weekday FROM catalog.place_opening_hours WHERE id = $1`, [ficha.abertoId]);
    const preco = await dados.query<{ currency: string }[]>(`SELECT currency FROM catalog.place_price_information WHERE id = $1`, [ficha.precoId]);
    const visita = await dados.query<{ recommended_duration_minutes: number }[]>(
      `SELECT recommended_duration_minutes FROM catalog.place_visit_information WHERE id = $1`,
      [ficha.visitaId],
    );
    const midia = await dados.query<{ external_url: string }[]>(`SELECT external_url FROM catalog.place_media WHERE id = $1`, [ficha.quarentenaId]);
    const referencia = await dados.query<{ provider: string }[]>(`SELECT provider FROM catalog.place_external_references WHERE id = $1`, [ficha.referenciaId]);
    expect(endereco[0]?.neighborhood).toBe(`Trastevere ${lugar.marca}`);
    expect(Number(horario[0]?.weekday)).toBe(2);
    expect(preco[0]?.currency.trim()).toBe('BRL');
    expect(Number(visita[0]?.recommended_duration_minutes)).toBe(90);
    expect(midia[0]?.external_url).toBe(ficha.urlExterna);
    expect(referencia[0]?.provider).toBe('google-places');
  });

  it('recalcula a nota pelas avaliações publicadas e lê as dicas', async () => {
    const access = await entrar(app, enviarCodigoDeVerificacao);
    const auth = { Authorization: `Bearer ${access}` };
    const lugar = await semear(dados);
    const contaId = JSON.parse(Buffer.from(access.split('.')[1] ?? '', 'base64url').toString()).sub as string;
    const antigaId = randomUUID();
    const novaId = randomUUID();
    await dados.query(
      `INSERT INTO community.place_reviews (place_id, user_id, rating, status) VALUES
       ($1, $2, 4, 'published'), ($1, $2, 5, 'published'), ($1, $2, 1, 'hidden')`,
      [lugar.lugarId, contaId],
    );
    await dados.query(
      `INSERT INTO catalog.place_community_tips (id, place_id, user_id, content, created_at) VALUES
       ($1, $2, $3, $4, '2026-11-01T00:00:00.000Z'),
       ($5, $2, $3, $6, '2026-11-02T00:00:00.000Z')`,
      [antigaId, lugar.lugarId, contaId, `Dica antiga ${lugar.marca}`, novaId, `Dica nova ${lugar.marca}`],
    );

    const pagina = await request(app.getHttpServer()).get(`/v1/catalog/places/${lugar.lugarId}`).set(auth);
    expect(pagina.status).toBe(200);
    expect(pagina.body.averageRating).toBe(4.5);
    expect(pagina.body.totalReviews).toBe(2);
    expect(pagina.body.communityTips).toEqual([
      expect.objectContaining({ id: novaId, userId: contaId, displayName: 'Pessoa E2E', content: `Dica nova ${lugar.marca}` }),
      expect.objectContaining({ id: antigaId, content: `Dica antiga ${lugar.marca}` }),
    ]);

    const busca = await request(app.getHttpServer()).get('/v1/catalog/places').query({ q: `Lugar ${lugar.marca}` }).set(auth);
    expect(busca.body).toEqual([expect.objectContaining({ id: lugar.lugarId, averageRating: 4.5, totalReviews: 2 })]);

    const resumo = await dados.query<{ average_rating: string; total_reviews: number }[]>(
      `SELECT average_rating, total_reviews FROM catalog.place_ratings_summary WHERE place_id = $1`,
      [lugar.lugarId],
    );
    const dicas = await dados.query<{ content: string }[]>(
      `SELECT content FROM catalog.place_community_tips WHERE place_id = $1 ORDER BY created_at`,
      [lugar.lugarId],
    );
    expect(Number(resumo[0]?.average_rating)).toBe(4.5);
    expect(Number(resumo[0]?.total_reviews)).toBe(2);
    expect(dicas.map((dica) => dica.content)).toEqual([`Dica antiga ${lugar.marca}`, `Dica nova ${lugar.marca}`]);
  });
});

async function entrar(app: INestApplication, enviar: ReturnType<typeof vi.fn>): Promise<string> {
  const email = `cat-${randomUUID()}@exemplo.com`;
  expect((await request(app.getHttpServer()).post('/v1/auth/sign-up').send({ nome: 'Pessoa E2E', email, senha: 'umaSenhaForte123', aceitouTermos: true })).status).toBe(202);
  const codigo = enviar.mock.calls.at(-1)?.[0].codigo as string;
  expect((await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo })).status).toBe(200);
  const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
  return login.body.accessToken as string;
}

async function semear(dados: DataSource): Promise<{
  marca: string;
  cidadeId: string;
  paiId: string;
  categoriaId: string;
  lugarId: string;
  arquivadoId: string;
}> {
  const marca = randomUUID().slice(0, 8);
  const paisId = randomUUID();
  const cidadeId = randomUUID();
  const paiId = randomUUID();
  const categoriaId = randomUUID();
  const lugarId = randomUUID();
  const arquivadoId = randomUUID();
  await dados.query(`INSERT INTO geography.countries (id, name) VALUES ($1, $2)`, [paisId, `Pais ${marca}`]);
  await dados.query(`INSERT INTO geography.cities (id, country_id, name) VALUES ($1, $2, $3)`, [cidadeId, paisId, `Cidade ${marca}`]);
  const cidades: Record<string, string> = {
    'pt-BR': `Cidade ${marca}`,
    'pt-PT': `Cidade ${marca}`,
    en: `Seed City ${marca}`,
    es: `Ciudad ${marca}`,
  };
  for (const [locale, nome] of Object.entries(cidades)) {
    await dados.query(
      `INSERT INTO geography.geographic_translations (entity_type, entity_id, locale, translated_name) VALUES ('city', $1, $2, $3)`,
      [cidadeId, locale, nome],
    );
  }
  await dados.query(`INSERT INTO catalog.place_categories (id, slug) VALUES ($1, $2)`, [paiId, `comer-${marca}`]);
  await dados.query(`INSERT INTO catalog.place_categories (id, parent_id, slug) VALUES ($1, $2, $3)`, [categoriaId, paiId, `trattoria-${marca}`]);
  const categorias: Record<string, [string, string]> = {
    'pt-BR': [`Comer ${marca}`, `Trattoria ${marca}`],
    'pt-PT': [`Comer ${marca}`, `Trattoria ${marca}`],
    en: [`Eat ${marca}`, `Trattoria ${marca}`],
    es: [`Comer ${marca}`, `Trattoria ${marca}`],
  };
  for (const [locale, [pai, filha]] of Object.entries(categorias)) {
    await dados.query(
      `INSERT INTO catalog.place_category_translations (category_id, locale, name) VALUES ($1, $3, $4), ($2, $3, $5)`,
      [paiId, categoriaId, locale, pai, filha],
    );
  }
  await dados.query(
    `INSERT INTO catalog.places (id, city_id, slug, name, description, latitude, longitude, website_url, phone, status)
     VALUES ($1, $2, $3, $4, $5, -23.5, -46.6, $6, '+5511999990000', 'active')`,
    [lugarId, cidadeId, `lugar-${marca}`, `Lugar ${marca}`, `Base ${marca}`, `https://exemplo.test/${marca}`],
  );
  await dados.query(
    `INSERT INTO catalog.places (id, city_id, slug, name, status) VALUES ($1, $2, $3, $4, 'archived')`,
    [arquivadoId, cidadeId, `arquivado-${marca}`, `Arquivado ${marca}`],
  );
  const lugares: Record<string, [string, string]> = {
    'pt-BR': [`Lugar pt ${marca}`, `Texto ${marca}`],
    'pt-PT': [`Lugar ${marca}`, `Descrição ${marca}`],
    en: [`Place ${marca}`, `Description ${marca}`],
    es: [`Lugar ${marca}`, `Descripción ${marca}`],
  };
  for (const [locale, [nome, descricao]] of Object.entries(lugares)) {
    await dados.query(
      `INSERT INTO catalog.place_translations (place_id, locale, name, description) VALUES ($1, $2, $3, $4)`,
      [lugarId, locale, nome, descricao],
    );
  }
  await dados.query(`INSERT INTO catalog.place_category_relations (place_id, category_id) VALUES ($1, $2)`, [lugarId, categoriaId]);
  return { marca, cidadeId, paiId, categoriaId, lugarId, arquivadoId };
}

async function semearFicha(
  dados: DataSource,
  lugar: { marca: string; cidadeId: string; lugarId: string; arquivadoId: string },
  armazenamento: MemoriaArmazenamento,
): Promise<{
  enderecoId: string;
  abertoId: string;
  fechadoId: string;
  precoId: string;
  visitaId: string;
  midiaId: string;
  quarentenaId: string;
  referenciaId: string;
  chave: string;
  urlExterna: string;
}> {
  const enderecoId = randomUUID();
  const abertoId = randomUUID();
  const fechadoId = randomUUID();
  const precoId = randomUUID();
  const visitaId = randomUUID();
  const midiaId = randomUUID();
  const quarentenaId = randomUUID();
  const referenciaId = randomUUID();
  const chave = `catalogo/${lugar.marca}/foto`;
  const urlExterna = `https://fonte.example/${lugar.marca}/video`;
  await dados.query(
    `INSERT INTO catalog.place_addresses (id, place_id, line1, neighborhood, postal_code, city_id) VALUES ($1, $2, $3, $4, '00100', $5)`,
    [enderecoId, lugar.lugarId, `Rua ${lugar.marca}`, `Trastevere ${lugar.marca}`, lugar.cidadeId],
  );
  await dados.query(
    `INSERT INTO catalog.place_addresses (place_id, neighborhood) VALUES ($1, $2)`,
    [lugar.arquivadoId, `Sumido ${lugar.marca}`],
  );
  await dados.query(
    `INSERT INTO catalog.place_opening_hours (id, place_id, weekday, is_closed) VALUES ($1, $2, 0, true)`,
    [fechadoId, lugar.lugarId],
  );
  await dados.query(
    `INSERT INTO catalog.place_opening_hours (id, place_id, weekday, opening_time, closing_time, is_closed) VALUES ($1, $2, 2, '09:00', '18:30', false)`,
    [abertoId, lugar.lugarId],
  );
  await dados.query(
    `INSERT INTO catalog.place_price_information (id, place_id, currency, price_level, minimum_price, maximum_price) VALUES ($1, $2, 'BRL', 2, 10, 40)`,
    [precoId, lugar.lugarId],
  );
  await dados.query(
    `INSERT INTO catalog.place_visit_information (id, place_id, recommended_duration_minutes, best_time_to_visit, accessibility_information)
     VALUES ($1, $2, 90, $3, $4)`,
    [visitaId, lugar.lugarId, `Manhã ${lugar.marca}`, `Rampa ${lugar.marca}`],
  );
  await armazenamento.guardar(chave, Buffer.from(`foto-${lugar.marca}`), 'image/jpeg');
  await dados.query(
    `INSERT INTO catalog.place_media (id, place_id, media_type, storage_key, attribution, sort_order) VALUES ($1, $2, 'photo', $3, $4, 1)`,
    [midiaId, lugar.lugarId, chave, `Autor ${lugar.marca}`],
  );
  await dados.query(
    `INSERT INTO catalog.place_media (id, place_id, media_type, external_url, sort_order) VALUES ($1, $2, 'video', $3, 0)`,
    [quarentenaId, lugar.lugarId, urlExterna],
  );
  await dados.query(
    `INSERT INTO catalog.place_external_references (id, place_id, provider, external_id, external_url, provider_metadata, last_synced_at)
     VALUES ($1, $2, 'google-places', $3, $4, $5::jsonb, '2026-11-18T12:00:00.000Z')`,
    [referenciaId, lugar.lugarId, `ext-${lugar.marca}`, `https://maps.example/${lugar.marca}`, JSON.stringify({ fonte: lugar.marca })],
  );
  return { enderecoId, abertoId, fechadoId, precoId, visitaId, midiaId, quarentenaId, referenciaId, chave, urlExterna };
}
