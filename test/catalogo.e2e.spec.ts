import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { REMETENTE_DE_EMAIL } from '../src/modules/identidade/domain/ports/remetente-de-email.port';

describe('Catálogo (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    process.env.RATE_LIMIT_LIMITE = '1000';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao })
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
