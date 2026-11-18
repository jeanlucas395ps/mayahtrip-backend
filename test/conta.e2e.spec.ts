import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { argon2id, hash } from 'argon2';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { COBRANCA, Cobranca } from '../src/modules/assinatura/domain/cobranca.port';
import { AsaasCobranca } from '../src/modules/assinatura/infrastructure/asaas-cobranca';
import { REMETENTE_DE_EMAIL } from '../src/modules/identidade/domain/ports/remetente-de-email.port';

class CobrancaFalsa implements Cobranca {
  estado: 'pago' | 'aguardando' | 'falhou' = 'pago';
  estorno: 'estornado' | 'falhou' = 'estornado';
  private n = 0;

  cobrar() {
    this.n += 1;
    return Promise.resolve({ estado: this.estado, providerPaymentId: `pay_${this.n}`, providerSubscriptionId: `sub_${this.n}` });
  }

  estornar() {
    return Promise.resolve({ estado: this.estorno, providerRefundId: this.estorno === 'estornado' ? `ref_${this.n}` : null });
  }
}

const cobranca = new CobrancaFalsa();

describe('Conta: aviso, Maya, assinatura e integração (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    process.env.RATE_LIMIT_LIMITE = '1000';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao, enviarConvite: vi.fn() })
      .overrideProvider(COBRANCA)
      .useValue(cobranca)
      .compile();
    app = modulo.createNestApplication();
    prepararAplicacao(app);
    await app.init();
    dados = modulo.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('grava o aviso nos quatro canais do modelo e o token do aparelho', async () => {
    const autor = await entrar(app, enviarCodigoDeVerificacao);
    const leitor = await entrar(app, enviarCodigoDeVerificacao);
    const lugarId = await lugar(dados);
    const post = await request(app.getHttpServer()).post('/v1/posts').set(auth(autor)).send({ visibility: 'public', placeIds: [lugarId], content: 'Aviso' });
    expect((await request(app.getHttpServer()).post(`/v1/posts/${post.body.id}/comments`).set(auth(leitor)).send({ content: 'Olha' })).status).toBe(201);
    const avisos = await request(app.getHttpServer()).get('/v1/notifications').set(auth(autor));
    expect(avisos.body[0].message).toBe('Pessoa E2E comentou na sua publicação.');
    const entrega = await dados.query<{ channel: string; status: string }[]>(
      `SELECT channel, status::text AS status
       FROM notification.notification_deliveries
       WHERE notification_id = $1
       ORDER BY channel`,
      [avisos.body[0].id],
    );
    expect(entrega).toEqual([
      { channel: 'in_app', status: 'sent' },
      { channel: 'push', status: 'pending' },
    ]);
    const push = await dados.query<{ error_message: string }[]>(
      `SELECT error_message FROM notification.notification_deliveries WHERE notification_id = $1 AND channel = 'push'`,
      [avisos.body[0].id],
    );
    expect(push[0].error_message).toBe('A credencial do Firebase FCM ainda não está no ambiente.');
    const evento = await dados.query(`SELECT 1 FROM notification.notification_events WHERE notification_id = $1 AND event_type = 'created'`, [avisos.body[0].id]);
    expect(evento).toHaveLength(1);
    const modelos = await dados.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM notification.notification_templates WHERE locale IN ('pt-BR', 'pt-PT', 'en', 'es') AND channel IN ('in_app', 'push')`,
    );
    expect(Number(modelos[0].total)).toBeGreaterThanOrEqual(88);
    const token = await request(app.getHttpServer()).post('/v1/devices/push-token').set(auth(autor)).send({ platform: 'ios', pushToken: 'token-do-aparelho-1', deviceId: 'iphone' });
    expect(token.status).toBe(201);
    expect(JSON.stringify(token.body)).not.toContain('token-do-aparelho-1');
    const gravado = await dados.query<{ platform: string }[]>(`SELECT platform FROM notification.device_push_tokens WHERE id = $1`, [token.body.id]);
    expect(gravado[0].platform).toBe('ios');
    expect((await request(app.getHttpServer()).post('/v1/notifications/read').set(auth(autor))).status).toBe(204);
    expect((await request(app.getHttpServer()).get('/v1/notifications').set(auth(autor))).body[0].read).toBe(true);
  });

  it('conversa no idioma da pessoa e o teste do agente não grava nada', async () => {
    const pessoa = await entrar(app, enviarCodigoDeVerificacao);
    const operador = await criarAdmin(dados);
    const entrada = await request(app.getHttpServer()).post('/v1/admin/sign-in').send(operador);
    const admin = { Authorization: `Bearer ${entrada.body.accessToken}` };
    await dados.query(`UPDATE maya.maya_model_configs SET is_active = false`);
    const antes = await dados.query<{ total: string }[]>(`SELECT count(*)::text AS total FROM maya.maya_messages`);
    const viagens = await dados.query<{ total: string }[]>(`SELECT count(*)::text AS total FROM travel.trips`);
    const padrao = await request(app.getHttpServer()).post('/v1/admin/maya/models/defaults').set(admin);
    expect(padrao.status).toBe(201);
    const agente = [...padrao.body].reverse().find((item: { name: string }) => item.name === 'Maya');
    expect((await request(app.getHttpServer()).post(`/v1/admin/maya/models/${agente.id}/sandbox`).set(admin).send({ question: 'Oi' })).body.answer).toContain('não crio viagem');
    expect((await dados.query<{ total: string }[]>(`SELECT count(*)::text AS total FROM maya.maya_messages`))[0].total).toBe(antes[0].total);
    expect((await request(app.getHttpServer()).post('/v1/maya/conversations').set(auth(pessoa)).send({ content: 'Como crio uma viagem?' })).status).toBe(409);
    expect((await request(app.getHttpServer()).post(`/v1/admin/maya/models/${agente.id}/activate`).set(admin)).status).toBe(201);
    await dados.query(`UPDATE identity.user_preferences SET locale = 'en' WHERE user_id = $1`, [pessoa.userId]);
    const conversa = await request(app.getHttpServer()).post('/v1/maya/conversations').set(auth(pessoa)).send({ content: 'How do I create a trip?' });
    expect(conversa.status).toBe(201);
    expect(conversa.body.plan).toBe('free');
    expect(conversa.body.answer).toContain('do not create a trip');
    expect((await dados.query<{ total: string }[]>(`SELECT count(*)::text AS total FROM travel.trips`))[0].total).toBe(viagens[0].total);
    const uso = await dados.query(`SELECT 1 FROM maya.maya_usage WHERE conversation_id = $1`, [conversa.body.conversationId]);
    expect(uso).toHaveLength(1);
    const opiniao = await request(app.getHttpServer()).post(`/v1/maya/messages/${conversa.body.messageId}/feedback`).set(auth(pessoa)).send({ rating: 5, feedbackText: 'Clara' });
    expect(opiniao.status).toBe(201);
    const feedback = await dados.query<{ rating: number }[]>(`SELECT rating FROM maya.maya_feedback WHERE id = $1`, [opiniao.body.id]);
    expect(feedback[0].rating).toBe(5);
    const editado = await request(app.getHttpServer()).patch(`/v1/admin/maya/models/${agente.id}`).set(admin).send({
      provider: 'openai',
      modelName: 'gpt-4o',
      name: 'Maya editada',
      family: 'GPT-4',
      conversationType: 'duvida',
      maxTokens: 900,
      temperature: 0.2,
      prompts: 'Não grave viagem.',
      sortOrder: 1,
    });
    expect(editado.body).toMatchObject({ name: 'Maya editada', family: 'GPT-4', isActive: true });
    expect((await request(app.getHttpServer()).post(`/v1/admin/maya/models/${agente.id}/deactivate`).set(admin)).body.isActive).toBe(false);
    expect((await request(app.getHttpServer()).post('/v1/maya/conversations').set(auth(pessoa)).send({ content: 'De novo' })).status).toBe(409);
    expect((await request(app.getHttpServer()).delete(`/v1/admin/maya/models/${agente.id}`).set(admin)).status).toBe(204);
  });

  it('aplica cupom e PRO de 30 dias sem somar e sem fatura', async () => {
    const pessoa = await entrar(app, enviarCodigoDeVerificacao);
    const operador = await criarAdmin(dados);
    const entrada = await request(app.getHttpServer()).post('/v1/admin/sign-in').send(operador);
    const admin = { Authorization: `Bearer ${entrada.body.accessToken}` };
    const codigo = `PRO${randomUUID().slice(0, 6)}`;
    await planoPago(app, admin.Authorization, codigo);
    const cupom = await request(app.getHttpServer()).post('/v1/admin/coupons').set(admin).send({ code: codigo, freeDays: 10, isActive: true });
    expect(cupom.status).toBe(201);
    expect((await request(app.getHttpServer()).post('/v1/billing/coupons').set(auth(pessoa)).send({ code: codigo })).body.source).toBe('coupon');
    const promo = await request(app.getHttpServer()).post('/v1/admin/promo').set(admin).send({ userId: pessoa.userId });
    expect(promo.status).toBe(201);
    const grant = await dados.query<{ dias: string }[]>(
      `SELECT extract(day FROM ends_at - starts_at)::text AS dias FROM subscription.promo_grants WHERE id = $1`,
      [promo.body.id],
    );
    expect(Number(grant[0].dias)).toBe(30);
    const atual = await request(app.getHttpServer()).get('/v1/billing').set(auth(pessoa));
    const fim = new Date(atual.body.renewsAt).getTime();
    expect(fim).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
    expect(await dados.query(`SELECT 1 FROM subscription.subscription_payments p JOIN subscription.user_subscriptions s ON s.id = p.subscription_id WHERE s.user_id = $1`, [pessoa.userId])).toHaveLength(0);
    expect((await request(app.getHttpServer()).post(`/v1/admin/promo/${promo.body.id}/revoke`).set(admin)).status).toBe(204);
    const depois = await request(app.getHttpServer()).get('/v1/billing').set(auth(pessoa));
    expect(depois.body.source).toBe('coupon');
    expect(new Date(depois.body.renewsAt).getTime()).toBeLessThan(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const parada = await entrar(app, enviarCodigoDeVerificacao);
    await dados.query(`UPDATE identity.users SET status = 'inactive' WHERE id = $1`, [parada.userId]);
    expect((await request(app.getHttpServer()).post('/v1/admin/promo').set(admin).send({ userId: parada.userId })).status).toBe(404);
  });

  it('assina, cancela a renovação, estorna e guarda a conta sem segredo', async () => {
    const pessoa = await entrar(app, enviarCodigoDeVerificacao);
    const operador = await criarAdmin(dados);
    const entrada = await request(app.getHttpServer()).post('/v1/admin/sign-in').send(operador);
    const admin = { Authorization: `Bearer ${entrada.body.accessToken}` };
    const marca = randomUUID().slice(0, 8);
    const plano = await planoPago(app, admin.Authorization, `pago-${marca}`);
    const preco = await dados.query<{ id: string }[]>(`SELECT id FROM subscription.plan_prices WHERE plan_id = $1`, [plano]);
    const assinada = await request(app.getHttpServer()).post('/v1/billing/subscriptions').set(auth(pessoa)).send({ planPriceId: preco[0].id, method: 'pix' });
    expect(assinada.status).toBe(201);
    expect(assinada.body.source).toBe('paid');
    const faturas = await request(app.getHttpServer()).get('/v1/billing/invoices').set(auth(pessoa));
    expect(faturas.body[0].status).toBe('paid');
    expect((await request(app.getHttpServer()).post(`/v1/billing/subscriptions/${assinada.body.id}/cancel`).set(auth(pessoa))).body.cancelAtPeriodEnd).toBe(true);
    const estorno = await request(app.getHttpServer()).post('/v1/admin/refunds').set(admin).send({ subscriptionId: assinada.body.id, reason: 'trial' });
    expect(estorno.status).toBe(201);
    const linha = await dados.query<{ status: string; provider_refund_id: string }[]>(`SELECT status, provider_refund_id FROM subscription.refunds WHERE id = $1`, [estorno.body.id]);
    expect(linha[0].status).toBe('refunded');
    expect(linha[0].provider_refund_id).toMatch(/^ref_/);
    expect((await request(app.getHttpServer()).patch('/v1/admin/payment-methods').set(admin).send({ method: 'boleto', isEnabled: false })).status).toBe(200);
    expect((await request(app.getHttpServer()).patch('/v1/admin/payment-methods').set(admin).send({ method: 'pix', isEnabled: false })).status).toBe(200);
    expect((await request(app.getHttpServer()).patch('/v1/admin/payment-methods').set(admin).send({ method: 'credit_card', isEnabled: false })).status).toBe(409);
    await request(app.getHttpServer()).patch('/v1/admin/payment-methods').set(admin).send({ method: 'boleto', isEnabled: true });
    await request(app.getHttpServer()).patch('/v1/admin/payment-methods').set(admin).send({ method: 'pix', isEnabled: true });
    expect((await request(app.getHttpServer()).post('/v1/admin/providers').set(admin).send({ provider: 'asaas', accountName: 'Principal', credentialsReference: 'aact_segredo' })).status).toBe(404);
    const conta = await request(app.getHttpServer()).post('/v1/admin/providers').set(admin).send({ provider: 'asaas', accountName: 'Principal', credentialsReference: 'env:ASAAS_API_KEY' });
    expect(conta.status).toBe(201);
    const gravada = await dados.query<{ credentials_reference: string }[]>(`SELECT credentials_reference FROM integration.external_provider_accounts WHERE id = $1`, [conta.body.id]);
    expect(gravada[0].credentials_reference).toBe('env:ASAAS_API_KEY');
    expect((await request(app.getHttpServer()).post(`/v1/admin/providers/${conta.body.id}/sync`).set(admin)).status).toBe(201);
    const referencia = await request(app.getHttpServer()).post('/v1/admin/references').set(admin).send({ entityType: 'subscription', entityId: assinada.body.id, provider: 'asaas', externalId: 'sub_teste' });
    expect(referencia.status).toBe(201);
    const logs = JSON.stringify(await request(app.getHttpServer()).get('/v1/admin/integration-logs').set(admin));
    expect(logs).not.toContain('ASAAS_API_KEY');
    expect(logs).not.toContain('aact_');
    const semChave = await new AsaasCobranca().cobrar({ amount: 10, method: 'pix', description: 'teste' });
    expect(semChave.estado).toBe('aguardando');
  });

  it('não marca pago nem estorna quando a cobrança não confirma', async () => {
    const pessoa = await entrar(app, enviarCodigoDeVerificacao);
    const operador = await criarAdmin(dados);
    const entrada = await request(app.getHttpServer()).post('/v1/admin/sign-in').send(operador);
    const admin = { Authorization: `Bearer ${entrada.body.accessToken}` };
    const marca = randomUUID().slice(0, 8);
    const plano = await planoPago(app, admin.Authorization, `espera-${marca}`);
    const outro = await planoPago(app, admin.Authorization, `troca-${marca}`);
    const precos = await dados.query<{ id: string; plan_id: string }[]>(`SELECT id, plan_id FROM subscription.plan_prices WHERE plan_id = ANY($1::uuid[])`, [[plano, outro]]);
    const precoAtual = precos.find((item) => item.plan_id === plano)!;
    const precoNovo = precos.find((item) => item.plan_id === outro)!;
    cobranca.estado = 'aguardando';
    try {
      const assinada = await request(app.getHttpServer()).post('/v1/billing/subscriptions').set(auth(pessoa)).send({ planPriceId: precoAtual.id, method: 'pix' });
      expect(assinada.body.status).toBe('past_due');
      const pendente = await dados.query<{ status: string; provider_payment_id: string }[]>(
        `SELECT status, provider_payment_id FROM subscription.subscription_payments WHERE subscription_id = $1`,
        [assinada.body.id],
      );
      expect(pendente[0].status).toBe('pending');
      process.env.ASAAS_WEBHOOK_TOKEN = 'webhook-local';
      const gancho = await request(app.getHttpServer()).post('/webhooks/asaas').set('asaas-access-token', 'webhook-local').send({
        event: 'PAYMENT_CONFIRMED',
        payment: { id: pendente[0].provider_payment_id, creditCard: { number: '4111111111111111' } },
        creditCardToken: 'tok_secreto',
      });
      expect(gancho.status).toBe(200);
      const pago = await dados.query<{ status: string }[]>(`SELECT status FROM subscription.subscription_payments WHERE subscription_id = $1`, [assinada.body.id]);
      expect(pago[0].status).toBe('paid');
      const ativa = await dados.query<{ status: string }[]>(`SELECT status::text AS status FROM subscription.user_subscriptions WHERE id = $1`, [assinada.body.id]);
      expect(ativa[0].status).toBe('active');
      const evento = await dados.query<{ payload: { creditCard?: unknown; creditCardToken?: unknown; payment?: { creditCard?: unknown } } }[]>(
        `SELECT payload FROM subscription.subscription_events WHERE provider_event_id = $1`,
        [pendente[0].provider_payment_id],
      );
      expect(JSON.stringify(evento[0].payload)).not.toContain('4111');
      expect(evento[0].payload.creditCardToken).toBeUndefined();
      cobranca.estado = 'falhou';
      expect((await request(app.getHttpServer()).post(`/v1/billing/subscriptions/${assinada.body.id}/plan`).set(auth(pessoa)).send({ planPriceId: precoNovo.id })).status).toBe(409);
      const mesmo = await dados.query<{ plan_id: string }[]>(`SELECT plan_id FROM subscription.user_subscriptions WHERE id = $1`, [assinada.body.id]);
      expect(mesmo[0].plan_id).toBe(plano);
      cobranca.estorno = 'falhou';
      expect((await request(app.getHttpServer()).post('/v1/admin/refunds').set(admin).send({ subscriptionId: assinada.body.id, reason: 'duplicate_charge' })).status).toBe(502);
      const intacta = await dados.query<{ status: string }[]>(`SELECT status::text AS status FROM subscription.user_subscriptions WHERE id = $1`, [assinada.body.id]);
      expect(intacta[0].status).toBe('active');
      const falha = await dados.query<{ status: string }[]>(`SELECT status FROM subscription.refunds WHERE subscription_id = $1`, [assinada.body.id]);
      expect(falha[0].status).toBe('failed');
    } finally {
      cobranca.estado = 'pago';
      cobranca.estorno = 'estornado';
    }
  });
});

async function entrar(app: INestApplication, enviar: ReturnType<typeof vi.fn>): Promise<{ access: string; userId: string }> {
  const email = `conta-${randomUUID()}@exemplo.com`;
  expect((await request(app.getHttpServer()).post('/v1/auth/sign-up').send({ nome: 'Pessoa E2E', email, senha: 'umaSenhaForte123', aceitouTermos: true })).status).toBe(202);
  const codigo = enviar.mock.calls.at(-1)?.[0].codigo as string;
  expect((await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo })).status).toBe(200);
  const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
  const dados = app.get(DataSource);
  const usuarios = await dados.query<{ id: string }[]>(`SELECT id FROM identity.users WHERE email = $1`, [email]);
  return { access: login.body.accessToken as string, userId: usuarios[0].id };
}

async function lugar(dados: DataSource): Promise<string> {
  const id = randomUUID();
  const marca = id.slice(0, 8);
  const pais = randomUUID();
  const cidade = randomUUID();
  await dados.query(`INSERT INTO geography.countries (id, name) VALUES ($1, $2)`, [pais, `Pais ${marca}`]);
  await dados.query(`INSERT INTO geography.cities (id, country_id, name) VALUES ($1, $2, $3)`, [cidade, pais, `Cidade ${marca}`]);
  await dados.query(`INSERT INTO catalog.places (id, city_id, slug, name) VALUES ($1, $2, $3, $4)`, [id, cidade, `lugar-${marca}`, `Lugar ${marca}`]);
  return id;
}

async function planoPago(app: INestApplication, authorization: string, code: string): Promise<string> {
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
  const ativado = await request(app.getHttpServer()).post(`/v1/admin/plans/${criado.body.id}/activate`).set({ Authorization: authorization });
  expect(ativado.status).toBe(200);
  return criado.body.id as string;
}

function auth(pessoa: { access: string }): { Authorization: string } {
  return { Authorization: `Bearer ${pessoa.access}` };
}

async function criarAdmin(dados: DataSource): Promise<{ email: string; senha: string }> {
  const email = `conta-admin-${randomUUID()}@exemplo.com`;
  const senha = 'painel-teste-1';
  await dados.query(`INSERT INTO admin.admin_users (name, email, password_hash) VALUES ('Operador', $1, $2)`, [email, await hash(senha, { type: argon2id })]);
  return { email, senha };
}
