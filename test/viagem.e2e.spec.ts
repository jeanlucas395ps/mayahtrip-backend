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

describe('Viagem (e2e, Postgres real)', () => {
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

  it('grava a viagem, a carteira, a capa e o orçamento, e calcula o status pelas datas', async () => {
    const dono = await entrar(app, enviarCodigoDeVerificacao);
    const outro = await entrar(app, enviarCodigoDeVerificacao);
    const auth = { Authorization: `Bearer ${dono.access}` };
    const marca = randomUUID().slice(0, 8);
    const paisId = randomUUID();
    const cidadeId = randomUUID();
    const outraCidade = randomUUID();
    await dados.query(`INSERT INTO geography.countries (id, name) VALUES ($1, $2)`, [paisId, `Pais ${marca}`]);
    await dados.query(`INSERT INTO geography.cities (id, country_id, name) VALUES ($1, $2, $3), ($4, $2, $5)`, [
      cidadeId,
      paisId,
      `Lisboa ${marca}`,
      outraCidade,
      `Porto ${marca}`,
    ]);
    const hoje = String((await dados.query<{ hoje: string }[]>(`SELECT CURRENT_DATE::text AS hoje`))[0].hoje).slice(0, 10);
    const teto = Number(
      (await dados.query<{ setting_value: number }[]>(`SELECT setting_value FROM platform.system_settings WHERE setting_key = 'trip_calendar_max_days'`))[0]
        .setting_value,
    );

    const semToken = await request(app.getHttpServer()).get('/v1/trips');
    expect(semToken.status).toBe(401);

    const criada = await request(app.getHttpServer())
      .post('/v1/trips')
      .set(auth)
      .send({
        startDate: somar(hoje, 10),
        endDate: somar(hoje, 14),
        startMode: 'suggested',
        adultCount: 2,
        childCount: 1,
        budgetAmount: 1200,
        budgetCurrency: 'brl',
        destinations: [
          { cityId: cidadeId },
          { cityId: outraCidade },
        ],
      });
    expect(criada.status).toBe(201);
    expect(criada.body).toMatchObject({
      title: `Lisboa ${marca} e Porto ${marca}`,
      status: 'upcoming',
      daysUntil: 10,
      dayCount: 5,
      durationDays: null,
      budgetAmount: 1200,
      budgetCurrency: 'BRL',
      adultCount: 2,
      childCount: 1,
      hasCover: false,
      visibility: 'private',
      destinationCount: 2,
    });
    expect(JSON.stringify(criada.body)).not.toContain('storage');
    expect(criada.body.destinations.map((item: { name: string; sortOrder: number }) => [item.sortOrder, item.name])).toEqual([
      [0, `Lisboa ${marca}`],
      [1, `Porto ${marca}`],
    ]);
    expect(criada.body.view).toEqual({ itinerary: true, edit: true, expenses: true, documents: true });
    expect(criada.body.participants.map((item: { displayName: string; partyKind: string; role: string | null; userId: string | null; joined: boolean }) => [item.displayName, item.partyKind, item.role, item.userId, item.joined])).toEqual([
      ['Pessoa E2E', 'adult', 'owner', dono.userId, true],
      ['Viajante 1', 'adult', 'supreme_traveler', null, false],
      ['Viajante 2', 'child', null, null, false],
    ]);

    const tarde = await request(app.getHttpServer())
      .post('/v1/trips')
      .set(auth)
      .send({
        title: `Tarde ${marca}`,
        startDate: somar(hoje, 20),
        endDate: somar(hoje, 22),
        startMode: 'from_scratch',
        destinations: [{ cityId: cidadeId }],
      });
    expect(tarde.status).toBe(201);

    const rascunho = await request(app.getHttpServer())
      .post('/v1/trips')
      .set(auth)
      .send({
        durationDays: 4,
        startMode: 'from_scratch',
        destinations: [{ customName: `Praia ${marca}` }],
      });
    expect(rascunho.status).toBe(201);
    expect(rascunho.body).toMatchObject({ title: `Praia ${marca}`, status: 'draft', startDate: null, dayCount: 4 });

    const longa = await request(app.getHttpServer())
      .post('/v1/trips')
      .set(auth)
      .send({
        startDate: somar(hoje, 40),
        endDate: somar(hoje, 54),
        startMode: 'from_scratch',
        destinations: [{ cityId: cidadeId }],
      });
    expect(longa.status).toBe(201);
    expect(longa.body.dayCount).toBe(15);

    expect(
      (await request(app.getHttpServer()).post('/v1/trips').set(auth).send({ durationDays: 15, startMode: 'suggested', destinations: [{ customName: 'Longe' }] })).body.message,
    ).toBe('Viagens com mais de 14 dias começam do zero.');
    expect(
      (
        await request(app.getHttpServer())
          .post('/v1/trips')
          .set(auth)
          .send({ startDate: somar(hoje, 1), endDate: somar(hoje, teto + 1), startMode: 'from_scratch', destinations: [{ cityId: cidadeId }] })
      ).status,
    ).toBe(400);
    expect((await request(app.getHttpServer()).post('/v1/trips').set(auth).send({ startDate: '2000-01-01', endDate: '2000-01-03', startMode: 'from_scratch', destinations: [{ cityId: cidadeId }] })).status).toBe(400);
    expect((await request(app.getHttpServer()).post('/v1/trips').set(auth).send({ startDate: somar(hoje, 2), endDate: somar(hoje, 4), startMode: 'from_scratch', budgetAmount: 10, destinations: [{ cityId: cidadeId }] })).body.message).toBe('Informe o valor e a moeda do orçamento.');
    expect((await request(app.getHttpServer()).post('/v1/trips').set(auth).send({ durationDays: 2, startMode: 'from_scratch', budgetAmount: 10, budgetCurrency: 'ZZZ', destinations: [{ customName: 'Lugar' }] })).body.message).toBe('Escolha uma moeda ativa.');
    expect((await request(app.getHttpServer()).post('/v1/trips').set(auth).send({ durationDays: 2, startMode: 'from_scratch', destinations: [] })).body.message).toBe('Escolha ao menos um destino.');
    expect((await request(app.getHttpServer()).post('/v1/trips').set(auth).send({ durationDays: 2, startMode: 'from_scratch', destinations: [{ cityId: randomUUID() }] })).body.message).toBe('Cidade não encontrada.');

    const foto = Buffer.from('bytes-da-capa');
    const capa = await request(app.getHttpServer()).post(`/v1/trips/${criada.body.id}/cover`).set(auth).attach('arquivo', foto, { filename: 'capa.jpg', contentType: 'image/jpeg' });
    expect(capa.status).toBe(201);
    expect(capa.body.hasCover).toBe(true);
    expect(JSON.stringify(capa.body)).not.toContain('viagens/');
    const baixada = await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}/cover`).set(auth);
    expect(baixada.status).toBe(200);
    expect(baixada.body).toEqual(foto);
    expect((await request(app.getHttpServer()).post(`/v1/trips/${criada.body.id}/cover`).set(auth).attach('arquivo', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' })).status).toBe(400);

    const carteira = await request(app.getHttpServer()).get('/v1/trips').set(auth);
    expect(carteira.body.counts).toEqual({ all: 4, upcoming: 3, drafts: 1 });
    expect(carteira.body.trips.map((item: { title: string }) => item.title)).toEqual([
      `Lisboa ${marca} e Porto ${marca}`,
      `Tarde ${marca}`,
      longa.body.title,
      `Praia ${marca}`,
    ]);
    const proximas = await request(app.getHttpServer()).get('/v1/trips').query({ filtro: 'proximas' }).set(auth);
    expect(proximas.body.trips).toHaveLength(3);
    expect(proximas.body.trips.every((item: { status: string }) => item.status === 'upcoming' || item.status === 'happening')).toBe(true);
    const rascunhos = await request(app.getHttpServer()).get('/v1/trips').query({ filtro: 'rascunhos' }).set(auth);
    expect(rascunhos.body.trips.map((item: { id: string }) => item.id)).toEqual([rascunho.body.id]);
    expect((await request(app.getHttpServer()).get('/v1/trips').query({ filtro: 'concluidas' }).set(auth)).status).toBe(400);

    expect((await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}`).set('Authorization', `Bearer ${outro.access}`)).status).toBe(404);

    const linhas = await dados.query<{ title: string; budget_amount: string; budget_currency: string; cover_storage_key: string }[]>(
      `SELECT title, budget_amount::text, budget_currency, cover_storage_key FROM travel.trips WHERE id = $1`,
      [criada.body.id],
    );
    expect(linhas[0].title).toBe(`Lisboa ${marca} e Porto ${marca}`);
    expect(Number(linhas[0].budget_amount)).toBe(1200);
    expect(linhas[0].budget_currency.trim()).toBe('BRL');
    expect(linhas[0].cover_storage_key.startsWith(`viagens/${criada.body.id}/`)).toBe(true);
    const destinos = await dados.query<{ sort_order: number; city_id: string }[]>(
      `SELECT sort_order, city_id FROM travel.trip_destinations WHERE trip_id = $1 ORDER BY sort_order`,
      [criada.body.id],
    );
    expect(destinos.map((item) => item.city_id)).toEqual([cidadeId, outraCidade]);

    const visita = await dados.query<{ id: string }[]>(
      `SELECT id FROM identity.user_visited_countries WHERE user_id = $1 AND country_id = $2`,
      [dono.userId, paisId],
    );
    expect(visita).toEqual([]);
    const mapa = await request(app.getHttpServer()).get('/v1/me/visits').set(auth);
    expect(mapa.body.paisesPlanejados).toBe(1);
  });

  it('grava Viajante N, devolve a visão de cada papel e esconde quem saiu', async () => {
    const dono = await entrar(app, enviarCodigoDeVerificacao);
    const supremo = await entrar(app, enviarCodigoDeVerificacao);
    const experiente = await entrar(app, enviarCodigoDeVerificacao);
    const junior = await entrar(app, enviarCodigoDeVerificacao);
    const fora = await entrar(app, enviarCodigoDeVerificacao);
    const auth = { Authorization: `Bearer ${dono.access}` };
    const marca = randomUUID().slice(0, 8);
    const paisId = randomUUID();
    const cidadeId = randomUUID();
    await dados.query(`INSERT INTO geography.countries (id, name) VALUES ($1, $2)`, [paisId, `Pais ${marca}`]);
    await dados.query(`INSERT INTO geography.cities (id, country_id, name) VALUES ($1, $2, $3)`, [cidadeId, paisId, `Cidade ${marca}`]);
    const hoje = String((await dados.query<{ hoje: string }[]>(`SELECT CURRENT_DATE::text AS hoje`))[0].hoje).slice(0, 10);

    const criada = await request(app.getHttpServer())
      .post('/v1/trips')
      .set(auth)
      .send({
        title: `Grupo ${marca}`,
        startDate: somar(hoje, 3),
        endDate: somar(hoje, 5),
        startMode: 'from_scratch',
        adultCount: 2,
        childCount: 1,
        destinations: [{ cityId: cidadeId }],
      });
    expect(criada.status).toBe(201);
    const linhas = await dados.query<{ display_name: string; party_kind: string; role: string | null; user_id: string | null; joined_at: Date | null }[]>(
      `SELECT display_name, party_kind::text, role::text, user_id, joined_at
       FROM travel.trip_participants WHERE trip_id = $1 ORDER BY created_at`,
      [criada.body.id],
    );
    expect(linhas).toEqual([
      expect.objectContaining({ display_name: 'Pessoa E2E', party_kind: 'adult', role: 'owner', user_id: dono.userId }),
      expect.objectContaining({ display_name: 'Viajante 1', party_kind: 'adult', role: 'supreme_traveler', user_id: null, joined_at: null }),
      expect.objectContaining({ display_name: 'Viajante 2', party_kind: 'child', role: null, user_id: null, joined_at: null }),
    ]);
    expect(linhas[0].joined_at).not.toBeNull();

    const viajante = criada.body.participants.find((item: { displayName: string }) => item.displayName === 'Viajante 1');
    const renomeado = await request(app.getHttpServer()).patch(`/v1/trips/${criada.body.id}/participants/${viajante.id}`).set(auth).send({ displayName: 'Ana' });
    expect(renomeado.status).toBe(200);
    expect(renomeado.body.participants.map((item: { displayName: string }) => item.displayName)).toContain('Ana');
    expect((await request(app.getHttpServer()).patch(`/v1/trips/${criada.body.id}/participants/${viajante.id}`).set(auth).send({ displayName: 'pessoa e2e' })).status).toBe(409);
    expect((await request(app.getHttpServer()).patch(`/v1/trips/${criada.body.id}/participants/${viajante.id}`).set(auth).send({ displayName: '   ' })).status).toBe(400);

    await dados.query(
      `INSERT INTO travel.trip_participants (trip_id, user_id, display_name, party_kind, role, joined_at)
       VALUES ($1, $2, 'Supremo', 'adult'::travel.party_kind, 'supreme_traveler'::travel.participant_role, now()),
              ($1, $3, 'Experiente', 'adult'::travel.party_kind, 'experienced_traveler'::travel.participant_role, now()),
              ($1, $4, 'Junior', 'adult'::travel.party_kind, 'junior_assistant'::travel.participant_role, now())`,
      [criada.body.id, supremo.userId, experiente.userId, junior.userId],
    );

    const vistaSupremo = await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}`).set('Authorization', `Bearer ${supremo.access}`);
    expect(vistaSupremo.status).toBe(200);
    expect(vistaSupremo.body.view).toEqual({ itinerary: true, edit: true, expenses: true, documents: true });

    const vistaExperiente = await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}`).set('Authorization', `Bearer ${experiente.access}`);
    expect(vistaExperiente.status).toBe(200);
    expect(vistaExperiente.body.view).toEqual({ itinerary: true, edit: true, expenses: true, documents: false });
    const carteiraExperiente = await request(app.getHttpServer()).get('/v1/trips').set('Authorization', `Bearer ${experiente.access}`);
    expect(carteiraExperiente.body.trips.map((item: { id: string }) => item.id)).toContain(criada.body.id);
    expect(carteiraExperiente.body.counts.all).toBe(1);

    const vistaJunior = await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}`).set('Authorization', `Bearer ${junior.access}`);
    expect(vistaJunior.body.view).toEqual({ itinerary: true, edit: false, expenses: false, documents: false });
    const foto = Buffer.from('capa-do-junior');
    const capaJunior = await request(app.getHttpServer())
      .post(`/v1/trips/${criada.body.id}/cover`)
      .set('Authorization', `Bearer ${junior.access}`)
      .attach('arquivo', foto, { filename: 'capa.jpg', contentType: 'image/jpeg' });
    expect(capaJunior.status).toBe(403);
    expect(capaJunior.body.message).toBe('Você não pode editar esta viagem.');
    expect((await request(app.getHttpServer()).patch(`/v1/trips/${criada.body.id}/participants/${viajante.id}`).set('Authorization', `Bearer ${junior.access}`).send({ displayName: 'Outro' })).status).toBe(403);

    await dados.query(`UPDATE travel.trip_participants SET removed_at = now() WHERE trip_id = $1 AND user_id = $2`, [criada.body.id, junior.userId]);
    expect((await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}`).set('Authorization', `Bearer ${junior.access}`)).status).toBe(404);
    const carteiraJunior = await request(app.getHttpServer()).get('/v1/trips').set('Authorization', `Bearer ${junior.access}`);
    expect(carteiraJunior.body.trips).toEqual([]);
    expect(carteiraJunior.body.counts).toEqual({ all: 0, upcoming: 0, drafts: 0 });
    expect((await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}`).set('Authorization', `Bearer ${fora.access}`)).status).toBe(404);
    expect((await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}`).set(auth)).status).toBe(200);
  });
});

async function entrar(app: INestApplication, enviar: ReturnType<typeof vi.fn>): Promise<{ access: string; userId: string; email: string }> {
  const email = `viagem-${randomUUID()}@exemplo.com`;
  expect((await request(app.getHttpServer()).post('/v1/auth/sign-up').send({ nome: 'Pessoa E2E', email, senha: 'umaSenhaForte123', aceitouTermos: true })).status).toBe(202);
  const codigo = enviar.mock.calls.at(-1)?.[0].codigo as string;
  expect((await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo })).status).toBe(200);
  const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
  const dados = app.get(DataSource);
  const usuarios = await dados.query<{ id: string }[]>(`SELECT id FROM identity.users WHERE email = $1`, [email]);
  return { access: login.body.accessToken as string, userId: usuarios[0].id, email };
}

function somar(iso: string, dias: number): string {
  const data = new Date(`${iso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}
