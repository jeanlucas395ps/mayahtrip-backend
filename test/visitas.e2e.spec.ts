import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { VisitasUseCase } from '../src/modules/identidade/application/use-cases/visitas.use-case';
import { REMETENTE_DE_EMAIL } from '../src/modules/identidade/domain/ports/remetente-de-email.port';

describe('Visitas (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  let visitas: VisitasUseCase;
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
    visitas = modulo.get(VisitasUseCase);
  });

  afterAll(async () => {
    await app.close();
  });

  async function entrar(): Promise<{ email: string; access: string; userId: string }> {
    const email = `visita-${randomUUID()}@exemplo.com`;
    const cadastro = await request(app.getHttpServer())
      .post('/v1/auth/sign-up')
      .send({ nome: 'Pessoa E2E', usuario: email.split('@')[0].replace(/[^a-zA-Z0-9._$#&-]+/g, '').slice(0, 60) || 'viajante', email, senha: 'umaSenhaForte123', aceitouTermos: true });
    expect(cadastro.status).toBe(202);
    const codigo = enviarCodigoDeVerificacao.mock.calls.at(-1)?.[0].codigo as string;
    expect((await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo })).status).toBe(200);
    const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
    const userId = await dados.query<{ id: string }[]>(`SELECT id FROM identity.users WHERE lower(email) = lower($1)`, [email]);
    return { email, access: login.body.accessToken as string, userId: userId[0].id };
  }

  it('grava marca manual e a viagem passada, e não deixa apagar o que veio da viagem', async () => {
    const dono = await entrar();
    const outro = await entrar();
    const paris = await criarLugar(dados, 'Paris');
    const lisboa = await criarLugar(dados, 'Lisboa');
    const tokyo = await criarLugar(dados, 'Tóquio');

    const semToken = await request(app.getHttpServer()).get('/v1/me/visits');
    expect(semToken.status).toBe(401);

    const manual = await request(app.getHttpServer())
      .post('/v1/me/visits/countries')
      .set('Authorization', `Bearer ${dono.access}`)
      .send({ paisId: paris.paisId, quando: '2024-05-01' });
    expect(manual.status).toBe(200);
    expect(manual.body.paises).toEqual([
      expect.objectContaining({ paisId: paris.paisId, nome: paris.nomePais, origem: 'manual', quando: '2024-05-01', viagemId: null }),
    ]);
    expect(manual.body.percentualMundo).toBe(1);
    expect(await lerVisita(dados, dono.userId, 'identity.user_visited_countries', 'country_id', paris.paisId)).toMatchObject({
      visit_source: 'manual',
      trip_id: null,
      visited_at: '2024-05-01',
    });

    const cidade = await request(app.getHttpServer())
      .post('/v1/me/visits/cities')
      .set('Authorization', `Bearer ${dono.access}`)
      .send({ cidadeId: lisboa.cidadeId });
    expect(cidade.status).toBe(200);
    expect(cidade.body.cidades).toEqual([expect.objectContaining({ cidadeId: lisboa.cidadeId, origem: 'manual' })]);
    expect(cidade.body.paises.map((pais: { paisId: string }) => pais.paisId).sort()).toEqual([lisboa.paisId, paris.paisId].sort());
    expect(await lerVisita(dados, dono.userId, 'identity.user_visited_cities', 'city_id', lisboa.cidadeId)).toMatchObject({
      visit_source: 'manual',
    });

    const dataRuim = await request(app.getHttpServer())
      .post('/v1/me/visits/countries')
      .set('Authorization', `Bearer ${dono.access}`)
      .send({ paisId: paris.paisId, quando: '2024-13-40' });
    expect(dataRuim.status).toBe(400);

    const viagemPassada = await criarViagem(dados, dono.userId, paris.cidadeId, -10, -1);
    await visitas.registrarDaViagem(viagemPassada);
    expect(await lerVisita(dados, dono.userId, 'identity.user_visited_countries', 'country_id', paris.paisId)).toMatchObject({
      visit_source: 'trip',
      trip_id: viagemPassada,
    });
    expect(await lerVisita(dados, dono.userId, 'identity.user_visited_cities', 'city_id', paris.cidadeId)).toMatchObject({
      visit_source: 'trip',
      trip_id: viagemPassada,
    });

    const presa = await request(app.getHttpServer())
      .delete(`/v1/me/visits/countries/${paris.paisId}`)
      .set('Authorization', `Bearer ${dono.access}`)
      .query({ idioma: 'en' });
    expect(presa.status).toBe(409);
    expect(presa.body.message).toContain('trip');

    const viagemFutura = await criarViagem(dados, dono.userId, tokyo.cidadeId, 3, 8);
    await visitas.registrarDaViagem(viagemFutura);
    expect(await lerVisita(dados, dono.userId, 'identity.user_visited_countries', 'country_id', tokyo.paisId)).toBeNull();
    const mapa = await request(app.getHttpServer()).get('/v1/me/visits').set('Authorization', `Bearer ${dono.access}`);
    expect(mapa.body.paisesPlanejados).toBe(1);
    expect(mapa.body.percentualComPlanejados).toBeGreaterThan(mapa.body.percentualMundo);

    const alheio = await request(app.getHttpServer()).get('/v1/me/visits').set('Authorization', `Bearer ${outro.access}`);
    expect(alheio.body.paises).toEqual([]);

    const remocao = await request(app.getHttpServer())
      .delete(`/v1/me/visits/cities/${lisboa.cidadeId}`)
      .set('Authorization', `Bearer ${dono.access}`);
    expect(remocao.status).toBe(204);
    expect(await lerVisita(dados, dono.userId, 'identity.user_visited_cities', 'city_id', lisboa.cidadeId)).toBeNull();
  });
});

async function criarLugar(dados: DataSource, nome: string): Promise<{ paisId: string; cidadeId: string; nomePais: string }> {
  const sufixo = randomUUID().slice(0, 8);
  const paises = await dados.query<{ id: string }[]>(
    `INSERT INTO geography.countries (name) VALUES ($1) RETURNING id`,
    [`${nome} ${sufixo}`],
  );
  const cidades = await dados.query<{ id: string }[]>(
    `INSERT INTO geography.cities (country_id, name) VALUES ($1, $2) RETURNING id`,
    [paises[0].id, `${nome} cidade ${sufixo}`],
  );
  return { paisId: paises[0].id, cidadeId: cidades[0].id, nomePais: `${nome} ${sufixo}` };
}

async function criarViagem(dados: DataSource, userId: string, cidadeId: string, inicio: number, fim: number): Promise<string> {
  const viagens = await dados.query<{ id: string }[]>(
    `INSERT INTO travel.trips (owner_user_id, title, start_date, end_date, start_mode)
     VALUES ($1, $2, CURRENT_DATE + $3::int, CURRENT_DATE + $4::int, 'from_scratch')
     RETURNING id`,
    [userId, `Viagem ${randomUUID().slice(0, 8)}`, inicio, fim],
  );
  await dados.query(
    `INSERT INTO travel.trip_destinations (trip_id, city_id, sort_order) VALUES ($1, $2, 0)`,
    [viagens[0].id, cidadeId],
  );
  return viagens[0].id;
}

interface VisitaLida {
  visit_source: string;
  trip_id: string | null;
  visited_at: string | null;
}

async function lerVisita(
  dados: DataSource,
  userId: string,
  tabela: 'identity.user_visited_countries' | 'identity.user_visited_cities',
  coluna: 'country_id' | 'city_id',
  lugarId: string,
): Promise<VisitaLida | null> {
  const linhas = await dados.query<VisitaLida[]>(
    `SELECT visit_source::text, trip_id, visited_at::text
     FROM ${tabela}
     WHERE user_id = $1 AND ${coluna} = $2`,
    [userId, lugarId],
  );
  return linhas[0] ?? null;
}
