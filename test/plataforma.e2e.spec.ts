import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { argon2id, hash } from 'argon2';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { REMETENTE_DE_EMAIL } from '../src/modules/identidade/domain/ports/remetente-de-email.port';

const SEIS = ['Google Places', 'TikTok', 'YouTube', 'Pixabay', 'Unsplash', 'Pexels'];

describe('Plataforma: fonte, fila, ajuste e expiração (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  let admin: { Authorization: string };
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    process.env.RATE_LIMIT_LIMITE = '1000';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao, enviarConvite: vi.fn() })
      .compile();
    app = modulo.createNestApplication();
    prepararAplicacao(app);
    await app.init();
    dados = modulo.get(DataSource);
    const conta = await criarAdmin(dados);
    const entrada = await request(app.getHttpServer()).post('/v1/admin/sign-in').send(conta);
    expect(entrada.status).toBe(200);
    admin = { Authorization: `Bearer ${entrada.body.accessToken}` };
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('grava a fonte inativa, o staging e recusa o arquivo', async () => {
    const fontes = await request(app.getHttpServer()).get('/v1/admin/ingestion/sources').set(admin);
    expect(fontes.status).toBe(200);
    expect(fontes.body.map((fonte: { name: string }) => fonte.name).sort()).toEqual([...SEIS].sort());
    expect(fontes.body.every((fonte: { canStore: boolean; canRepublish: boolean; licenseLabel: string }) => !fonte.canStore && !fonte.canRepublish && fonte.licenseLabel === 'unknown')).toBe(true);
    const google = fontes.body.find((fonte: { name: string }) => fonte.name === 'Google Places') as { id: string };
    expect((await request(app.getHttpServer()).post(`/v1/admin/ingestion/sources/${google.id}/active`).set(admin).send({ isActive: false })).status).toBe(201);
    const externo = `ext-${randomUUID()}`;
    const recusada = await request(app.getHttpServer()).post('/v1/admin/ingestion/jobs').set(admin).send(coleta(google.id, externo));
    expect(recusada.status).toBe(409);

    expect((await request(app.getHttpServer()).post(`/v1/admin/ingestion/sources/${google.id}/active`).set(admin).send({ isActive: true })).status).toBe(201);
    const politica = await request(app.getHttpServer()).patch(`/v1/admin/ingestion/sources/${google.id}/policy`).set(admin).send({ rateLimitPerMinute: 12, notes: 'sem arquivo' });
    expect(politica.body.canStore).toBe(false);
    const chave = `coleta-${randomUUID()}`;
    const primeira = await request(app.getHttpServer()).post('/v1/admin/ingestion/jobs').set(admin).set('Idempotency-Key', chave).send(coleta(google.id, externo));
    expect(primeira.status).toBe(201);
    const segunda = await request(app.getHttpServer()).post('/v1/admin/ingestion/jobs').set(admin).set('Idempotency-Key', chave).send(coleta(google.id, externo));
    expect(segunda.body).toMatchObject({ jobId: primeira.body.jobId, itemId: primeira.body.itemId, eventId: primeira.body.eventId, reused: true });
    const repetidos = await dados.query<{ total: string }[]>(`SELECT count(*)::text AS total FROM ingestion.ingestion_items WHERE external_id = $1`, [externo]);
    expect(repetidos[0].total).toBe('1');

    const item = primeira.body.itemId as string;
    const midia = await dados.query<{ storage_key: string | null; original_url: string; license_label: string }[]>(
      `SELECT storage_key, original_url, license_label FROM ingestion.ingestion_item_media WHERE ingestion_item_id = $1`,
      [item],
    );
    expect(midia[0]).toMatchObject({ storage_key: null, original_url: 'https://exemplo.com/foto', license_label: 'unknown' });
    const meta = await dados.query(`SELECT metadata_key FROM ingestion.ingestion_item_metadata WHERE ingestion_item_id = $1`, [item]);
    expect(meta).toHaveLength(1);
    const licenca = await dados.query<{ license_name: string; license_label: string }[]>(
      `SELECT license_name, license_label FROM ingestion.content_licenses WHERE ingestion_item_id = $1`,
      [item],
    );
    expect(licenca[0]).toEqual({ license_name: 'texto livre', license_label: 'unknown' });
    expect(await dados.query(`SELECT 1 FROM ingestion.content_ai_validations WHERE ingestion_item_id = $1 AND model = 'manual'`, [item])).toHaveLength(1);
    expect(await dados.query(`SELECT 1 FROM ingestion.content_provenance WHERE ingestion_item_id = $1 AND source_name = 'Google Places'`, [item])).toHaveLength(1);
    expect(await dados.query(`SELECT 1 FROM ingestion.ingestion_job_items WHERE job_id = $1 AND status = 'discovered'`, [primeira.body.jobId])).toHaveLength(1);
    expect(await dados.query(`SELECT 1 FROM platform.outbox_events WHERE id = $1 AND event_type = 'ingestion_job_requested' AND published_at IS NULL`, [primeira.body.eventId])).toHaveLength(1);
    expect(await dados.query(`SELECT 1 FROM platform.idempotency_keys WHERE idempotency_key = $1 AND scope = 'ingestion.collect'`, [chave])).toHaveLength(1);
    const bloqueio = await request(app.getHttpServer()).post(`/v1/admin/ingestion/items/${item}/media`).set(admin).send({ mediaType: 'image', storageKey: 'arquivo.bin' });
    expect(bloqueio.status).toBe(409);
    expect(await dados.query(`SELECT 1 FROM ingestion.ingestion_item_media WHERE ingestion_item_id = $1 AND storage_key IS NOT NULL`, [item])).toHaveLength(0);

    expect((await request(app.getHttpServer()).patch(`/v1/admin/ingestion/items/${item}/status`).set(admin).send({ status: 'processing' })).status).toBe(200);
    const validado = await request(app.getHttpServer()).patch(`/v1/admin/ingestion/items/${item}/status`).set(admin).send({ status: 'ai_validated', relevanceScore: 0.8, qualityScore: 0.7, duplicateScore: 0.1 });
    expect(validado.status).toBe(200);
    const nota = await dados.query<{ relevance_score: string }[]>(`SELECT relevance_score::text FROM ingestion.content_ai_validations WHERE ingestion_item_id = $1`, [item]);
    expect(Number(nota[0].relevance_score)).toBeCloseTo(0.8);
    expect((await request(app.getHttpServer()).post(`/v1/admin/ingestion/jobs/${primeira.body.jobId}/run`).set(admin).send({})).status).toBe(201);
    expect((await request(app.getHttpServer()).post(`/v1/admin/ingestion/jobs/${primeira.body.jobId}/finish`).set(admin).send({})).status).toBe(201);
    const job = await dados.query<{ status: string }[]>(`SELECT status::text AS status FROM ingestion.ingestion_jobs WHERE id = $1`, [primeira.body.jobId]);
    expect(job[0].status).toBe('completed');

    const confirmado = await request(app.getHttpServer()).post(`/v1/admin/platform/events/${primeira.body.eventId}/processed`).set(admin).send({ consumer: 'ingestao' });
    expect(confirmado.body).toEqual({ eventId: primeira.body.eventId, duplicated: false });
    const deNovo = await request(app.getHttpServer()).post(`/v1/admin/platform/events/${primeira.body.eventId}/processed`).set(admin).send({ consumer: 'ingestao' });
    expect(deNovo.body.duplicated).toBe(true);
    const processados = await dados.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM platform.processed_events WHERE consumer_name = 'ingestao' AND event_id = $1`,
      [primeira.body.eventId],
    );
    expect(processados[0].total).toBe('1');
    expect((await request(app.getHttpServer()).post(`/v1/admin/ingestion/sources/${google.id}/active`).set(admin).send({ isActive: false })).status).toBe(201);
  });

  it('associa o lugar, julga e reavalia a licença em texto livre', async () => {
    const fontes = await request(app.getHttpServer()).get('/v1/admin/ingestion/sources').set(admin);
    const youtube = fontes.body.find((fonte: { name: string }) => fonte.name === 'YouTube') as { id: string };
    expect((await request(app.getHttpServer()).post(`/v1/admin/ingestion/sources/${youtube.id}/active`).set(admin).send({ isActive: true })).status).toBe(201);
    const lugarId = await lugar(dados);
    const publicado = await abrirItem(app, admin, youtube.id);
    expect((await request(app.getHttpServer()).post(`/v1/admin/ingestion/items/${publicado}/place`).set(admin).send({ placeId: lugarId })).status).toBe(201);
    expect((await request(app.getHttpServer()).patch(`/v1/admin/ingestion/items/${publicado}/status`).set(admin).send({ status: 'pending_review' })).status).toBe(200);
    const tarefa = await request(app.getHttpServer()).post('/v1/admin/content-reviews').set(admin).send({ ingestionItemId: publicado });
    const aprovado = await request(app.getHttpServer()).post(`/v1/admin/content-reviews/${tarefa.body.id}/decisions`).set(admin).send({ decision: 'approved', reason: 'ok' });
    expect(aprovado.body.decision).toBe('approved');
    const publicacao = await dados.query<{ place_id: string }[]>(`SELECT place_id FROM moderation.content_publications WHERE ingestion_item_id = $1`, [publicado]);
    expect(publicacao[0].place_id).toBe(lugarId);

    const rejeitado = await abrirItem(app, admin, youtube.id);
    const tarefaRejeitada = await request(app.getHttpServer()).post('/v1/admin/content-reviews').set(admin).send({ ingestionItemId: rejeitado });
    expect((await request(app.getHttpServer()).post(`/v1/admin/content-reviews/${tarefaRejeitada.body.id}/decisions`).set(admin).send({ decision: 'rejected' })).body.decision).toBe('rejected');
    const corrigido = await abrirItem(app, admin, youtube.id);
    const tarefaCorrigida = await request(app.getHttpServer()).post('/v1/admin/content-reviews').set(admin).send({ ingestionItemId: corrigido });
    expect((await request(app.getHttpServer()).post(`/v1/admin/content-reviews/${tarefaCorrigida.body.id}/decisions`).set(admin).send({ decision: 'edited', reason: 'corrigir' })).body.status).toBe('edited');
    const encaminhado = await abrirItem(app, admin, youtube.id);
    const tarefaEncaminhada = await request(app.getHttpServer()).post('/v1/admin/content-reviews').set(admin).send({ ingestionItemId: encaminhado });
    expect((await request(app.getHttpServer()).post(`/v1/admin/content-reviews/${tarefaEncaminhada.body.id}/decisions`).set(admin).send({ decision: 'escalated' })).body.status).toBe('escalated');

    const licenca = await request(app.getHttpServer()).post(`/v1/admin/ingestion/items/${publicado}/license`).set(admin).send({ licenseName: 'cortesia do autor', attribution: 'Autor' });
    expect(licenca.body.licenseLabel).toBe('unknown');
    const linhas = await dados.query<{ total: string }[]>(`SELECT count(*)::text AS total FROM ingestion.content_licenses WHERE ingestion_item_id = $1`, [publicado]);
    expect(Number(linhas[0].total)).toBeGreaterThanOrEqual(2);
    const remocao = await request(app.getHttpServer()).post(`/v1/admin/ingestion/items/${encaminhado}/removal-requests`).set(admin).send({ requesterEmail: 'pessoa@exemplo.com', reason: 'tirar' });
    expect(remocao.status).toBe(201);
    const pedido = await dados.query<{ status: string }[]>(`SELECT status FROM moderation.content_removal_requests WHERE id = $1`, [remocao.body.id]);
    expect(pedido[0].status).toBe('pending');
    const item = await dados.query<{ status: string }[]>(`SELECT status::text AS status FROM ingestion.ingestion_items WHERE id = $1`, [encaminhado]);
    expect(item[0].status).toBe('removal_requested');
    expect((await request(app.getHttpServer()).post(`/v1/admin/ingestion/sources/${youtube.id}/active`).set(admin).send({ isActive: false })).status).toBe(201);
  });

  it('aplica o teto, o handoff, a sessão, a bandeira e não duplica a geração', async () => {
    const ajustes = await request(app.getHttpServer()).get('/v1/admin/platform/settings').set(admin);
    expect(ajustes.status).toBe(200);
    const original = Object.fromEntries((ajustes.body as { key: string; value: number }[]).map((ajuste) => [ajuste.key, ajuste.value]));
    const viajante = await entrar(app, enviarCodigoDeVerificacao);
    try {
      expect((await request(app.getHttpServer()).patch('/v1/admin/platform/settings').set(admin).send({ key: 'trip_flexible_max_days', value: 2 })).status).toBe(200);
      const cidadeId = await cidade(dados);
      const longa = await request(app.getHttpServer()).post('/v1/trips').set(auth(viajante)).send({ title: 'Teto', durationDays: 3, startMode: 'from_scratch', destinations: [{ cityId: cidadeId }] });
      expect(longa.status).toBe(400);
      expect((await request(app.getHttpServer()).patch('/v1/admin/platform/settings').set(admin).send({ key: 'handoff_ttl_seconds', value: 90 })).status).toBe(200);
      expect((await request(app.getHttpServer()).post('/v1/auth/handoff').set(auth(viajante)).send({})).status).toBe(201);
      const handoff = await dados.query<{ segundos: number }[]>(
        `SELECT EXTRACT(EPOCH FROM (expires_at - clock_timestamp()))::int AS segundos
         FROM identity.user_handoff_codes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [viajante.userId],
      );
      expect(handoff[0].segundos).toBeGreaterThan(70);
      expect(handoff[0].segundos).toBeLessThanOrEqual(90);
      expect((await request(app.getHttpServer()).patch('/v1/admin/platform/settings').set(admin).send({ key: 'refresh_session_days', value: 2 })).status).toBe(200);
      const deNovo = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email: viajante.email, senha: 'umaSenhaForte123', manterConectado: false });
      expect(deNovo.status).toBe(200);
      const sessao = await dados.query<{ segundos: number }[]>(
        `SELECT EXTRACT(EPOCH FROM (expires_at - clock_timestamp()))::int AS segundos
         FROM identity.user_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [viajante.userId],
      );
      expect(sessao[0].segundos).toBeGreaterThan(1.5 * 24 * 60 * 60);
      expect(sessao[0].segundos).toBeLessThanOrEqual(2 * 24 * 60 * 60);

      const viagem = await request(app.getHttpServer()).post('/v1/trips').set(auth(viajante)).send({ title: 'Curta', durationDays: 2, startMode: 'from_scratch', destinations: [{ cityId: cidadeId }] });
      expect(viagem.status).toBe(201);
      const chave = `gerar-${randomUUID()}`;
      const geracao = await request(app.getHttpServer()).post(`/v1/trips/${viagem.body.id}/itinerary/generate`).set(auth(viajante)).set('Idempotency-Key', chave).send({});
      expect(geracao.status).toBe(202);
      const repetida = await request(app.getHttpServer()).post(`/v1/trips/${viagem.body.id}/itinerary/generate`).set(auth(viajante)).set('Idempotency-Key', chave).send({});
      expect(repetida.body.jobId).toBe(geracao.body.jobId);
      const jobs = await dados.query<{ total: string }[]>(`SELECT count(*)::text AS total FROM itinerary.itinerary_generation_jobs WHERE trip_id = $1`, [viagem.body.id]);
      expect(jobs[0].total).toBe('1');
      const eventos = await dados.query<{ total: string }[]>(
        `SELECT count(*)::text AS total FROM platform.outbox_events WHERE aggregate_id = $1 AND event_type = 'itinerary_generation_requested'`,
        [geracao.body.jobId],
      );
      expect(eventos[0].total).toBe('1');
    } finally {
      for (const [key, value] of Object.entries(original)) {
        await request(app.getHttpServer()).patch('/v1/admin/platform/settings').set(admin).send({ key, value });
      }
    }
    const bandeira = await request(app.getHttpServer()).post('/v1/admin/platform/flags').set(admin).send({ flagKey: `teste.${randomUUID()}`, description: 'sem provedor' });
    expect(bandeira.status).toBe(201);
    expect(bandeira.body.isEnabled).toBe(false);
    const ligada = await request(app.getHttpServer()).post(`/v1/admin/platform/flags/${bandeira.body.id}/toggle`).set(admin).send({});
    expect(ligada.body.isEnabled).toBe(true);
    const gravada = await dados.query<{ is_enabled: boolean }[]>(`SELECT is_enabled FROM platform.feature_flags WHERE id = $1`, [bandeira.body.id]);
    expect(gravada[0].is_enabled).toBe(true);
    expect((await request(app.getHttpServer()).post(`/v1/admin/platform/flags/${bandeira.body.id}/toggle`).set(admin).send({})).body.isEnabled).toBe(false);
  });

  it('expira quem venceu e preserva cupom, promo e renovação paga', async () => {
    const viajante = await entrar(app, enviarCodigoDeVerificacao);
    const plano = await planoPago(app, admin.Authorization);
    const vencida = await assinatura(dados, viajante.userId, plano, { fim: `clock_timestamp() - interval '1 day'` });
    const renovada = await assinatura(dados, viajante.userId, plano, { fim: `clock_timestamp() - interval '2 days'`, pagaDepois: true });
    const futura = await assinatura(dados, viajante.userId, plano, { fim: `clock_timestamp() + interval '10 days'` });
    const cupom = await dados.query<{ id: string }[]>(
      `INSERT INTO subscription.coupons (code, free_days) VALUES ($1, 10) RETURNING id`,
      [`cupom-${randomUUID().slice(0, 8)}`],
    );
    const comCupom = await assinatura(dados, viajante.userId, plano, { fim: `clock_timestamp() - interval '1 hour'`, couponId: cupom[0].id, inicio: `clock_timestamp() - interval '1 day'` });
    const promo = await dados.query<{ id: string }[]>(
      `INSERT INTO subscription.promo_grants (user_id, starts_at, ends_at)
       SELECT $1, inicio, inicio + interval '30 days' FROM (SELECT clock_timestamp() - interval '1 day' AS inicio) marca
       RETURNING id`,
      [viajante.userId],
    );
    const comPromo = await assinatura(dados, viajante.userId, plano, { fim: `clock_timestamp() - interval '1 hour'`, promoId: promo[0].id });
    const corrida = await request(app.getHttpServer()).post('/v1/admin/platform/subscription-expiry').set(admin).send({});
    expect(corrida.status).toBe(201);
    const estados = await dados.query<{ id: string; status: string }[]>(
      `SELECT id, status::text AS status FROM subscription.user_subscriptions WHERE id = ANY($1::uuid[])`,
      [[vencida, renovada, futura, comCupom, comPromo]],
    );
    const mapa = Object.fromEntries(estados.map((linha) => [linha.id, linha.status]));
    expect(mapa[vencida]).toBe('expired');
    expect(mapa[renovada]).toBe('active');
    expect(mapa[futura]).toBe('active');
    expect(mapa[comCupom]).toBe('active');
    expect(mapa[comPromo]).toBe('active');
    const gravada = await dados.query<{ job_name: string; status: string }[]>(
      `SELECT job_name, status::text AS status FROM platform.scheduled_job_runs WHERE id = $1`,
      [corrida.body.runId],
    );
    expect(gravada[0]).toEqual({ job_name: 'subscription.expiry', status: 'completed' });
    const pagamentos = await dados.query<{ total: string }[]>(`SELECT count(*)::text AS total FROM subscription.subscription_payments WHERE subscription_id = ANY($1::uuid[])`, [[vencida, renovada, futura, comCupom, comPromo]]);
    expect(pagamentos[0].total).toBe('1');
  });

  it('muda a fila sem apagar a viagem nem a notificação', async () => {
    const viajante = await entrar(app, enviarCodigoDeVerificacao);
    const cidadeId = await cidade(dados);
    const viagem = await request(app.getHttpServer()).post('/v1/trips').set(auth(viajante)).send({ title: 'Fila', durationDays: 2, startMode: 'from_scratch', destinations: [{ cityId: cidadeId }] });
    const job = await dados.query<{ id: string }[]>(
      `INSERT INTO itinerary.itinerary_generation_jobs (trip_id, requested_by_user_id, status) VALUES ($1, $2, 'pending') RETURNING id`,
      [viagem.body.id, viajante.userId],
    );
    const falha = await request(app.getHttpServer()).post(`/v1/admin/platform/queues/itinerary/jobs/${job[0].id}/fail`).set(admin).send({});
    expect(falha.body.tripId).toBe(viagem.body.id);
    expect(await dados.query(`SELECT 1 FROM travel.trips WHERE id = $1 AND deleted_at IS NULL`, [viagem.body.id])).toHaveLength(1);
    const recolocado = await request(app.getHttpServer()).post(`/v1/admin/platform/queues/itinerary/jobs/${job[0].id}/requeue`).set(admin).send({});
    expect(recolocado.body.updated).toBe(1);
    const deNovo = await request(app.getHttpServer()).post(`/v1/admin/platform/queues/itinerary/jobs/${job[0].id}/fail`).set(admin).send({});
    expect(deNovo.status).toBe(201);
    expect((await request(app.getHttpServer()).post(`/v1/admin/platform/queues/itinerary/jobs/${job[0].id}/requeue`).set(admin).send({})).body.updated).toBe(1);
    expect((await request(app.getHttpServer()).post(`/v1/admin/platform/queues/itinerary/jobs/${job[0].id}/requeue`).set(admin).send({})).body.kept).toBe(true);
    const total = await dados.query<{ total: string }[]>(`SELECT count(*)::text AS total FROM itinerary.itinerary_generation_jobs WHERE id = $1`, [job[0].id]);
    expect(total[0].total).toBe('1');
    expect((await request(app.getHttpServer()).post(`/v1/admin/platform/queues/itinerary/jobs/${job[0].id}/fail`).set(admin).send({})).status).toBe(201);
    expect((await request(app.getHttpServer()).post(`/v1/admin/platform/queues/itinerary/jobs/${job[0].id}/delete`).set(admin).send({})).body.deleted).toBe(1);
    expect(await dados.query(`SELECT 1 FROM travel.trips WHERE id = $1`, [viagem.body.id])).toHaveLength(1);

    const aviso = await dados.query<{ id: string }[]>(
      `INSERT INTO notification.notifications (user_id, event_type, title, message) VALUES ($1, 'comment.created', 'Oi', 'Texto') RETURNING id`,
      [viajante.userId],
    );
    const entrega = await dados.query<{ id: string }[]>(
      `INSERT INTO notification.notification_deliveries (notification_id, channel, status) VALUES ($1, 'push', 'failed') RETURNING id`,
      [aviso[0].id],
    );
    expect((await request(app.getHttpServer()).post(`/v1/admin/platform/queues/notification/jobs/${entrega[0].id}/delete`).set(admin).send({})).body.deleted).toBe(1);
    expect(await dados.query(`SELECT 1 FROM notification.notifications WHERE id = $1`, [aviso[0].id])).toHaveLength(1);
    expect(await dados.query(`SELECT 1 FROM notification.notification_deliveries WHERE id = $1`, [entrega[0].id])).toHaveLength(0);
  });

  it('conta o painel, a receita e a saúde sem inventar métrica', async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const painel = await request(app.getHttpServer()).get('/v1/admin/platform/dashboard').set(admin).query({ from: hoje, to: hoje, year: 2026 });
    expect(painel.status).toBe(200);
    const viagens = await dados.query<{ total: number }[]>(`SELECT count(*)::int AS total FROM travel.trips WHERE deleted_at IS NULL`);
    expect(painel.body.totals.trips).toBe(viagens[0].total);
    expect(painel.body.workers.itinerary).toBe('parado');
    expect(typeof painel.body.acquisitions.free).toBe('number');
    expect(typeof painel.body.activePro).toBe('number');
    const financeiro = await request(app.getHttpServer()).get('/v1/admin/platform/finance').set(admin).query({ year: 2026 });
    expect(financeiro.status).toBe(200);
    for (const moeda of financeiro.body.currencies as { paid: number; refunded: number; net: number }[]) {
      expect(moeda.net).toBe(moeda.paid - moeda.refunded);
    }
    expect(financeiro.body.months.length % 12).toBe(0);
    const saude = await request(app.getHttpServer()).get('/v1/admin/platform/health').set(admin);
    expect(saude.body.services.find((servico: { name: string }) => servico.name === 'postgres').status).toBe('saudavel');
    expect(saude.body.services.find((servico: { name: string }) => servico.name === 'kafka').status).toBe('degradado');
    expect(saude.body.host.cpu).toBeNull();
    expect(saude.body.apiErrors).toEqual([]);
  });
});

function coleta(sourceId: string, externalId: string) {
  return {
    sourceId,
    externalId,
    title: 'Um lugar',
    originalUrl: 'https://exemplo.com/foto',
    mediaType: 'image',
    mediaUrl: 'https://exemplo.com/foto',
    metadataKey: 'origem',
    metadataValue: 'painel',
    licenseName: 'texto livre',
  };
}

async function abrirItem(app: INestApplication, admin: { Authorization: string }, sourceId: string): Promise<string> {
  const criado = await request(app.getHttpServer()).post('/v1/admin/ingestion/jobs').set(admin).send(coleta(sourceId, `ext-${randomUUID()}`));
  expect(criado.status).toBe(201);
  return criado.body.itemId as string;
}

async function entrar(app: INestApplication, enviar: ReturnType<typeof vi.fn>): Promise<{ access: string; userId: string; email: string }> {
  const email = `plataforma-${randomUUID()}@exemplo.com`;
  expect((await request(app.getHttpServer()).post('/v1/auth/sign-up').send({ nome: 'Pessoa E2E', email, senha: 'umaSenhaForte123', aceitouTermos: true })).status).toBe(202);
  const codigo = enviar.mock.calls.at(-1)?.[0].codigo as string;
  expect((await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo })).status).toBe(200);
  const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
  const dados = app.get(DataSource);
  const usuarios = await dados.query<{ id: string }[]>(`SELECT id FROM identity.users WHERE email = $1`, [email]);
  return { access: login.body.accessToken as string, userId: usuarios[0].id, email };
}

async function criarAdmin(dados: DataSource): Promise<{ email: string; senha: string }> {
  const email = `plataforma-admin-${randomUUID()}@exemplo.com`;
  const senha = 'painel-teste-1';
  await dados.query(`INSERT INTO admin.admin_users (name, email, password_hash) VALUES ('Operador', $1, $2)`, [email, await hash(senha, { type: argon2id })]);
  return { email, senha };
}

async function cidade(dados: DataSource): Promise<string> {
  const id = randomUUID();
  const pais = randomUUID();
  await dados.query(`INSERT INTO geography.countries (id, name) VALUES ($1, $2)`, [pais, `Pais ${id.slice(0, 8)}`]);
  await dados.query(`INSERT INTO geography.cities (id, country_id, name) VALUES ($1, $2, $3)`, [id, pais, `Cidade ${id.slice(0, 8)}`]);
  return id;
}

async function lugar(dados: DataSource): Promise<string> {
  const id = randomUUID();
  const cidadeId = await cidade(dados);
  await dados.query(`INSERT INTO catalog.places (id, city_id, slug, name) VALUES ($1, $2, $3, $4)`, [id, cidadeId, `lugar-${id.slice(0, 8)}`, `Lugar ${id.slice(0, 8)}`]);
  return id;
}

async function planoPago(app: INestApplication, authorization: string): Promise<string> {
  const code = `pro-${randomUUID().slice(0, 8)}`;
  const criado = await request(app.getHttpServer()).post('/v1/admin/plans').set({ Authorization: authorization }).send({
    code,
    name: code,
    isFree: false,
    currency: 'BRL',
    billingPeriod: 'monthly',
    amount: 20,
    durationDays: 30,
    features: [],
  });
  expect(criado.status).toBe(201);
  expect((await request(app.getHttpServer()).post(`/v1/admin/plans/${criado.body.id}/activate`).set({ Authorization: authorization })).status).toBe(200);
  return criado.body.id as string;
}

async function assinatura(
  dados: DataSource,
  userId: string,
  planId: string,
  opcoes: { fim: string; inicio?: string; couponId?: string; promoId?: string; pagaDepois?: boolean },
): Promise<string> {
  const inicio = opcoes.inicio ?? `clock_timestamp() - interval '40 days'`;
  const criadas = await dados.query<{ id: string }[]>(
    `INSERT INTO subscription.user_subscriptions
       (user_id, plan_id, coupon_id, promo_grant_id, status, started_at, current_period_start, current_period_end)
     VALUES ($1, $2, $3, $4, 'active', ${inicio}, ${inicio}, ${opcoes.fim})
     RETURNING id`,
    [userId, planId, opcoes.couponId ?? null, opcoes.promoId ?? null],
  );
  if (opcoes.pagaDepois) {
    await dados.query(
      `INSERT INTO subscription.subscription_payments (subscription_id, amount, currency, status, paid_at)
       VALUES ($1, 20, 'BRL', 'paid', clock_timestamp())`,
      [criadas[0].id],
    );
  }
  return criadas[0].id;
}

function auth(pessoa: { access: string }): { Authorization: string } {
  return { Authorization: `Bearer ${pessoa.access}` };
}
