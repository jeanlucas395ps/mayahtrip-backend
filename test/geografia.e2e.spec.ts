import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { REMETENTE_DE_EMAIL } from '../src/modules/identidade/domain/ports/remetente-de-email.port';

describe('Geografia (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue({ entregue: true });

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

  it('lê destino, cidade e mapa no idioma pedido', async () => {
    const access = await entrar(app, enviarCodigoDeVerificacao);
    const auth = { Authorization: `Bearer ${access}` };
    const lugar = await semear(dados);

    const semToken = await request(app.getHttpServer()).get('/v1/geography/destinations').query({ q: lugar.marca });
    expect(semToken.status).toBe(401);
    const vazio = await request(app.getHttpServer()).get('/v1/geography/destinations').set(auth);
    expect(vazio.body).toEqual([]);

    const porApelido = await request(app.getHttpServer()).get('/v1/geography/destinations').query({ q: lugar.apelido, idioma: 'es' }).set(auth);
    expect(porApelido.status).toBe(200);
    expect(porApelido.body).toEqual([
      expect.objectContaining({
        cityId: lugar.cidadeId,
        cityName: `Ciudad ${lugar.marca}`,
        countryName: `País ${lugar.marca}`,
        continentName: `Continente ${lugar.marca}`,
        regionName: `Región ${lugar.marca}`,
      }),
    ]);

    const porPais = await request(app.getHttpServer()).get('/v1/geography/destinations').query({ q: `Seed Country ${lugar.marca}`, idioma: 'en' }).set(auth);
    expect(porPais.body).toEqual([expect.objectContaining({ cityId: lugar.cidadeId, cityName: `Seed City ${lugar.marca}`, countryName: `Seed Country ${lugar.marca}` })]);

    const ficha = await request(app.getHttpServer()).get(`/v1/geography/cities/${lugar.cidadeId}`).query({ idioma: 'pt-PT' }).set(auth);
    expect(ficha.status).toBe(200);
    expect(ficha.body).toMatchObject({
      cityName: `Cidade ${lugar.marca}`,
      regionName: `Região ${lugar.marca}`,
      countryName: `País ${lugar.marca}`,
      continentName: `Continente ${lugar.marca}`,
      latitude: -23.5,
      longitude: -46.6,
      timezone: 'America/Sao_Paulo',
    });
    expect(await request(app.getHttpServer()).get(`/v1/geography/cities/${randomUUID()}`).set(auth)).toMatchObject({ status: 404 });

    const paises = await request(app.getHttpServer()).get('/v1/geography/countries').query({ idioma: 'pt-BR' }).set(auth);
    expect(paises.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: lugar.paisId, name: `País ${lugar.marca}`, continentName: `Continente ${lugar.marca}` })]));
    const continentes = await request(app.getHttpServer()).get('/v1/geography/continents').query({ idioma: 'pt-BR' }).set(auth);
    expect(continentes.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: lugar.continenteId, name: `Continente ${lugar.marca}`, countryCount: 1 })]),
    );

    const lido = await dados.query<{ translated_name: string }[]>(
      `SELECT translated_name FROM geography.geographic_translations WHERE entity_id = $1 AND locale = 'en'`,
      [lugar.cidadeId],
    );
    expect(lido[0]?.translated_name).toBe(`Seed City ${lugar.marca}`);
  });
});

async function entrar(app: INestApplication, enviar: ReturnType<typeof vi.fn>): Promise<string> {
  const email = `geo-${randomUUID()}@exemplo.com`;
  expect((await request(app.getHttpServer()).post('/v1/auth/sign-up').send({ nome: 'Pessoa E2E', usuario: email.split('@')[0].replace(/[^a-zA-Z0-9._$#&-]+/g, '').slice(0, 60) || 'viajante', email, senha: 'umaSenhaForte123', aceitouTermos: true })).status).toBe(202);
  const codigo = enviar.mock.calls.at(-1)?.[0].codigo as string;
  expect((await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo })).status).toBe(200);
  const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
  return login.body.accessToken as string;
}

async function semear(dados: DataSource): Promise<{ marca: string; apelido: string; continenteId: string; paisId: string; cidadeId: string }> {
  const marca = randomUUID().slice(0, 8);
  const continenteId = randomUUID();
  const paisId = randomUUID();
  const regiaoId = randomUUID();
  const cidadeId = randomUUID();
  const apelido = `apelido-${marca}`;
  await dados.query(`INSERT INTO geography.continents (id, name, code) VALUES ($1, $2, $3)`, [continenteId, `Continente ${marca}`, marca.slice(0, 8)]);
  await dados.query(`INSERT INTO geography.countries (id, continent_id, name) VALUES ($1, $2, $3)`, [paisId, continenteId, `Pais ${marca}`]);
  await dados.query(`INSERT INTO geography.regions (id, country_id, name, region_type) VALUES ($1, $2, $3, 'state')`, [regiaoId, paisId, `Regiao ${marca}`]);
  await dados.query(
    `INSERT INTO geography.cities (id, country_id, region_id, name, latitude, longitude, timezone) VALUES ($1, $2, $3, $4, -23.5, -46.6, 'America/Sao_Paulo')`,
    [cidadeId, paisId, regiaoId, `Cidade ${marca}`],
  );
  const nomes: Record<string, [string, string, string, string]> = {
    'pt-BR': [`Continente ${marca}`, `País ${marca}`, `Região ${marca}`, `Cidade ${marca}`],
    'pt-PT': [`Continente ${marca}`, `País ${marca}`, `Região ${marca}`, `Cidade ${marca}`],
    en: [`Seed Continent ${marca}`, `Seed Country ${marca}`, `Seed Region ${marca}`, `Seed City ${marca}`],
    es: [`Continente ${marca}`, `País ${marca}`, `Región ${marca}`, `Ciudad ${marca}`],
  };
  for (const [locale, [continente, pais, regiao, cidade]] of Object.entries(nomes)) {
    await dados.query(
      `INSERT INTO geography.geographic_translations (entity_type, entity_id, locale, translated_name) VALUES
       ('continent', $1, $5, $6), ('country', $2, $5, $7), ('region', $3, $5, $8), ('city', $4, $5, $9)`,
      [continenteId, paisId, regiaoId, cidadeId, locale, continente, pais, regiao, cidade],
    );
  }
  await dados.query(
    `INSERT INTO geography.geographic_aliases (entity_type, entity_id, alias, locale) VALUES ('city', $1, $2, 'es')`,
    [cidadeId, apelido],
  );
  return { marca, apelido, continenteId, paisId, cidadeId };
}
