import { createHash, randomUUID } from 'node:crypto';
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
  const enviarConvite = vi.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    process.env.RATE_LIMIT_LIMITE = '1000';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao, enviarConvite })
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

  it('envia o convite no e-mail de quem entra, aceita uma vez e recusa o outro', async () => {
    const dono = await entrar(app, enviarCodigoDeVerificacao);
    const convidado = await entrar(app, enviarCodigoDeVerificacao);
    const fora = await entrar(app, enviarCodigoDeVerificacao);
    const auth = { Authorization: `Bearer ${dono.access}` };
    await dados.query(`UPDATE identity.user_preferences SET locale = 'pt-PT', follow_device_locale = false WHERE user_id = $1`, [dono.userId]);
    await dados.query(`UPDATE identity.user_preferences SET locale = 'en', follow_device_locale = false WHERE user_id = $1`, [convidado.userId]);
    const marca = randomUUID().slice(0, 8);
    const emailNovo = `novo-${marca}@exemplo.com`;
    const paisId = randomUUID();
    const cidadeId = randomUUID();
    await dados.query(`INSERT INTO geography.countries (id, name) VALUES ($1, $2)`, [paisId, `Pais ${marca}`]);
    await dados.query(`INSERT INTO geography.cities (id, country_id, name) VALUES ($1, $2, $3)`, [cidadeId, paisId, `Cidade ${marca}`]);
    const hoje = String((await dados.query<{ hoje: string }[]>(`SELECT CURRENT_DATE::text AS hoje`))[0].hoje).slice(0, 10);
    const chamadas = enviarConvite.mock.calls.length;

    const criada = await request(app.getHttpServer())
      .post('/v1/trips')
      .set(auth)
      .send({
        title: `Convite ${marca}`,
        startDate: somar(hoje, 4),
        endDate: somar(hoje, 6),
        startMode: 'from_scratch',
        destinations: [{ cityId: cidadeId }],
        invites: [
          { email: convidado.email, role: 'experienced_traveler' },
          { email: emailNovo, role: 'junior_assistant' },
        ],
      });
    expect(criada.status).toBe(201);
    const envios = enviarConvite.mock.calls.slice(chamadas).map((chamada) => chamada[0] as { paraEmail: string; token: string; idioma: { valor: string } });
    expect(envios.map((item) => [item.paraEmail, item.idioma.valor])).toEqual([
      [convidado.email, 'en'],
      [emailNovo, 'pt-PT'],
    ]);
    expect(JSON.stringify(criada.body)).not.toContain(envios[0].token);
    expect(criada.body.participants.map((item: { displayName: string; role: string | null; joined: boolean }) => [item.displayName, item.role, item.joined])).toEqual(
      expect.arrayContaining([
        ['Pessoa E2E', 'owner', true],
        [convidado.email.slice(0, convidado.email.indexOf('@')), 'experienced_traveler', false],
        [`novo-${marca}`, 'junior_assistant', false],
      ]),
    );

    const linhas = await dados.query<{ invited_email: string; role: string; status: string; invited_user_id: string | null; token_hash: string; opened_at: Date | null; channel: string }[]>(
      `SELECT i.invited_email, i.role::text, i.status::text, i.invited_user_id, i.channel::text, tok.token_hash, tok.opened_at
       FROM travel.trip_invitations i
       JOIN travel.trip_invitation_tokens tok ON tok.invitation_id = i.id
       WHERE i.trip_id = $1
       ORDER BY i.invited_email`,
      [criada.body.id],
    );
    const doConvidado = envios.find((item) => item.paraEmail === convidado.email);
    const doNovo = envios.find((item) => item.paraEmail === emailNovo);
    expect(linhas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          invited_email: convidado.email,
          role: 'experienced_traveler',
          status: 'pending',
          invited_user_id: convidado.userId,
          channel: 'email',
          token_hash: createHash('sha256').update(doConvidado?.token ?? '').digest('hex'),
          opened_at: null,
        }),
        expect.objectContaining({
          invited_email: emailNovo,
          role: 'junior_assistant',
          status: 'pending',
          invited_user_id: null,
          channel: 'email',
          token_hash: createHash('sha256').update(doNovo?.token ?? '').digest('hex'),
          opened_at: null,
        }),
      ]),
    );
    expect(linhas).toHaveLength(2);

    expect((await request(app.getHttpServer()).post('/v1/invitations/open').set('Authorization', `Bearer ${fora.access}`).send({ token: doConvidado?.token })).body.message).toBe('Este convite é de outra pessoa.');
    const aberto = await request(app.getHttpServer()).post('/v1/invitations/open').set('Authorization', `Bearer ${convidado.access}`).send({ token: doConvidado?.token });
    expect(aberto.body).toEqual({ tripId: criada.body.id, tripTitle: `Convite ${marca}`, role: 'experienced_traveler', status: 'pending' });
    const depois = await dados.query<{ opened_at: Date | null }[]>(
      `SELECT opened_at FROM travel.trip_invitation_tokens WHERE token_hash = $1`,
      [createHash('sha256').update(doConvidado?.token ?? '').digest('hex')],
    );
    expect(depois[0].opened_at).not.toBeNull();
    expect((await request(app.getHttpServer()).post('/v1/invitations/open').set('Authorization', `Bearer ${fora.access}`).send({ token: doConvidado?.token })).status).toBe(403);

    const aceita = await request(app.getHttpServer()).post('/v1/invitations/accept').set('Authorization', `Bearer ${convidado.access}`).send({ token: doConvidado?.token });
    expect(aceita.status).toBe(201);
    expect(aceita.body.view).toEqual({ itinerary: true, edit: true, expenses: true, documents: false });
    expect((await request(app.getHttpServer()).post('/v1/invitations/accept').set('Authorization', `Bearer ${convidado.access}`).send({ token: doConvidado?.token })).body.message).toBe('Este convite já foi usado.');

    const novo = await entrar(app, enviarCodigoDeVerificacao, emailNovo);
    const recusa = await request(app.getHttpServer()).post('/v1/invitations/decline').set('Authorization', `Bearer ${novo.access}`).send({ token: doNovo?.token });
    expect(recusa.body).toEqual({ status: 'declined' });
    expect((await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}`).set('Authorization', `Bearer ${novo.access}`)).status).toBe(404);
    const recusada = await dados.query<{ status: string; removed_at: Date | null }[]>(
      `SELECT i.status::text, p.removed_at
       FROM travel.trip_invitations i
       JOIN travel.trip_participants p ON p.id = i.participant_id
       WHERE i.trip_id = $1 AND i.invited_email = $2`,
      [criada.body.id, emailNovo],
    );
    expect(recusada[0].status).toBe('declined');
    expect(recusada[0].removed_at).not.toBeNull();

    const emailJunior = `junior-${marca}@exemplo.com`;
    const conviteJunior = await request(app.getHttpServer()).post(`/v1/trips/${criada.body.id}/invitations`).set('Authorization', `Bearer ${convidado.access}`).send({ email: emailJunior, role: 'junior_assistant' });
    expect(conviteJunior.status).toBe(201);
    const tokenJunior = enviarConvite.mock.calls.at(-1)?.[0].token as string;
    const junior = await entrar(app, enviarCodigoDeVerificacao, emailJunior);
    expect((await request(app.getHttpServer()).post('/v1/invitations/accept').set('Authorization', `Bearer ${junior.access}`).send({ token: tokenJunior })).status).toBe(201);
    expect((await request(app.getHttpServer()).post(`/v1/trips/${criada.body.id}/invitations`).set('Authorization', `Bearer ${junior.access}`).send({ email: `outro-${marca}@exemplo.com`, role: 'experienced_traveler' })).body.message).toBe('Você não pode convidar para esta viagem.');
    expect((await request(app.getHttpServer()).post('/v1/trips').set(auth).send({ durationDays: 2, startMode: 'from_scratch', destinations: [{ customName: 'Lugar' }], invites: [{ email: 'sem-arroba', role: 'experienced_traveler' }] })).body.message).toBe('Digite um e-mail válido.');
  });

  it('só o dono muda papel e passa a posse; dono e supremo removem', async () => {
    const dono = await entrar(app, enviarCodigoDeVerificacao);
    const experiente = await entrar(app, enviarCodigoDeVerificacao);
    const supremo = await entrar(app, enviarCodigoDeVerificacao);
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
      .send({ title: `Posse ${marca}`, startDate: somar(hoje, 2), endDate: somar(hoje, 4), startMode: 'from_scratch', childCount: 1, destinations: [{ cityId: cidadeId }], invites: [{ email: experiente.email, role: 'experienced_traveler' }, { email: supremo.email, role: 'supreme_traveler' }] });
    expect(criada.status).toBe(201);
    const tokens = enviarConvite.mock.calls.slice(-2).map((chamada) => chamada[0] as { paraEmail: string; token: string });
    for (const pessoa of [experiente, supremo]) {
      const token = tokens.find((item) => item.paraEmail === pessoa.email)?.token;
      expect((await request(app.getHttpServer()).post('/v1/invitations/accept').set('Authorization', `Bearer ${pessoa.access}`).send({ token })).status).toBe(201);
    }
    const ficha = await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}`).set(auth);
    const crianca = ficha.body.participants.find((item: { partyKind: string }) => item.partyKind === 'child');
    const linhaExperiente = ficha.body.participants.find((item: { userId: string | null }) => item.userId === experiente.userId);
    const linhaSupremo = ficha.body.participants.find((item: { userId: string | null }) => item.userId === supremo.userId);
    expect((await request(app.getHttpServer()).patch(`/v1/trips/${criada.body.id}/participants/${crianca.id}/role`).set(auth).send({ role: 'junior_assistant' })).body.message).toBe('O papel da criança sem conta não foi nomeado.');
    expect((await request(app.getHttpServer()).patch(`/v1/trips/${criada.body.id}/participants/${linhaSupremo.id}/role`).set('Authorization', `Bearer ${experiente.access}`).send({ role: 'junior_assistant' })).body.message).toBe('Só o dono altera o papel.');
    expect((await request(app.getHttpServer()).post(`/v1/trips/${criada.body.id}/ownership`).set('Authorization', `Bearer ${experiente.access}`).send({ participantId: linhaSupremo.id })).body.message).toBe('Só o dono passa a posse.');
    const rebaixado = await request(app.getHttpServer()).patch(`/v1/trips/${criada.body.id}/participants/${linhaExperiente.id}/role`).set(auth).send({ role: 'junior_assistant' });
    expect(rebaixado.status).toBe(200);
    const vista = await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}`).set('Authorization', `Bearer ${experiente.access}`);
    expect(vista.body.view).toEqual({ itinerary: true, edit: false, expenses: false, documents: false });
    expect((await request(app.getHttpServer()).patch(`/v1/trips/${criada.body.id}/participants/${linhaExperiente.id}/role`).set(auth).send({ role: 'experienced_traveler' })).status).toBe(200);
    expect((await request(app.getHttpServer()).delete(`/v1/trips/${criada.body.id}/participants/${linhaSupremo.id}`).set('Authorization', `Bearer ${experiente.access}`)).body.message).toBe('Você não pode remover esta pessoa.');
    expect((await request(app.getHttpServer()).delete(`/v1/trips/${criada.body.id}/participants/${linhaExperiente.id}`).set('Authorization', `Bearer ${supremo.access}`)).status).toBe(200);
    expect((await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}`).set('Authorization', `Bearer ${experiente.access}`)).status).toBe(404);
    expect((await request(app.getHttpServer()).post(`/v1/trips/${criada.body.id}/leave`).set(auth)).body.message).toBe('O dono não sai da viagem. Passe a posse antes.');
    const posse = await request(app.getHttpServer()).post(`/v1/trips/${criada.body.id}/ownership`).set(auth).send({ participantId: linhaSupremo.id });
    expect(posse.status).toBe(201);
    expect(posse.body.participants.find((item: { userId: string }) => item.userId === dono.userId).role).toBe('supreme_traveler');
    expect(posse.body.participants.find((item: { userId: string }) => item.userId === supremo.userId).role).toBe('owner');
    const transferencia = await dados.query<{ from_user_id: string; to_user_id: string; owner_user_id: string }[]>(
      `SELECT t.from_user_id, t.to_user_id, v.owner_user_id
       FROM travel.trip_ownership_transfers t
       JOIN travel.trips v ON v.id = t.trip_id
       WHERE t.trip_id = $1`,
      [criada.body.id],
    );
    expect(transferencia).toEqual([expect.objectContaining({ from_user_id: dono.userId, to_user_id: supremo.userId, owner_user_id: supremo.userId })]);
    expect((await request(app.getHttpServer()).post(`/v1/trips/${criada.body.id}/leave`).set(auth)).body).toEqual({ status: 'left' });
    expect((await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}`).set(auth)).status).toBe(404);
    expect((await request(app.getHttpServer()).post(`/v1/trips/${criada.body.id}/leave`).set('Authorization', `Bearer ${supremo.access}`)).body.message).toBe('O dono não sai da viagem. Passe a posse antes.');
  });
});

async function entrar(app: INestApplication, enviar: ReturnType<typeof vi.fn>, emailInformado?: string): Promise<{ access: string; userId: string; email: string }> {
  const email = emailInformado ?? `viagem-${randomUUID()}@exemplo.com`;
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
