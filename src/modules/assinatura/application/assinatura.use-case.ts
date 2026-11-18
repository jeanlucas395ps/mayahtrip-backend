import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { COBRANCA, Cobranca } from '../domain/cobranca.port';

export type FalhaAssinatura = 'ausente' | 'plano' | 'metodo' | 'cupom' | 'conta' | 'janela' | 'cobranca' | 'ultimo';

@Injectable()
export class AssinaturaUseCase {
  constructor(
    @Inject(DataSource) private readonly dados: DataSource,
    @Inject(COBRANCA) private readonly cobranca: Cobranca,
  ) {}

  async atual(userId: string) {
    const linhas = await this.dados.query<{
      id: string;
      code: string;
      name: string;
      status: string;
      current_period_end: Date | null;
      cancel_at_period_end: boolean;
      coupon_id: string | null;
      promo_grant_id: string | null;
      provider_subscription_id: string | null;
    }[]>(
      `SELECT assinatura.id, plano.code, plano.name, assinatura.status::text AS status, assinatura.current_period_end,
              assinatura.cancel_at_period_end, assinatura.coupon_id, assinatura.promo_grant_id, assinatura.provider_subscription_id
       FROM subscription.user_subscriptions assinatura
       JOIN subscription.plans plano ON plano.id = assinatura.plan_id
       WHERE assinatura.user_id = $1 AND assinatura.status IN ('active', 'trialing', 'past_due')
       ORDER BY assinatura.current_period_end DESC NULLS LAST
       LIMIT 1`,
      [userId],
    );
    if (linhas.length === 0) return { code: 'free', name: 'Free', status: 'active', source: 'free', renewsAt: null, cancelAtPeriodEnd: false };
    const linha = linhas[0];
    const source = linha.provider_subscription_id ? 'paid' : linha.promo_grant_id ? 'promo' : linha.coupon_id ? 'coupon' : 'paid';
    return {
      id: linha.id,
      code: linha.code,
      name: linha.name,
      status: linha.status,
      source,
      renewsAt: linha.current_period_end ? new Date(linha.current_period_end).toISOString() : null,
      cancelAtPeriodEnd: linha.cancel_at_period_end,
    };
  }

  planos() {
    return this.dados.query(
      `SELECT plano.id, plano.code, plano.name, preco.id AS "priceId", trim(preco.currency) AS currency, preco.amount::text AS amount, preco.billing_period::text AS "billingPeriod"
       FROM subscription.plans plano
       JOIN subscription.plan_prices preco ON preco.plan_id = plano.id AND preco.is_active
       WHERE plano.is_active AND NOT plano.is_free
       ORDER BY plano.name`,
    );
  }

  metodos() {
    return this.dados.query<{ method: string; isEnabled: boolean }[]>(
      `SELECT method::text AS method, is_enabled AS "isEnabled" FROM subscription.payment_method_settings ORDER BY method`,
    );
  }

  async assinar(userId: string, planPriceId: string, method: 'credit_card' | 'boleto' | 'pix') {
    const precos = await this.dados.query<{ plan_id: string; amount: string; code: string }[]>(
      `SELECT preco.plan_id, preco.amount::text AS amount, plano.code
       FROM subscription.plan_prices preco
       JOIN subscription.plans plano ON plano.id = preco.plan_id
       WHERE preco.id = $1 AND preco.is_active AND plano.is_active AND NOT plano.is_free`,
      [planPriceId],
    );
    if (precos.length === 0) return 'plano' as const;
    if (!(await this.metodoLigado(method))) return 'metodo' as const;
    const resultado = await this.cobranca.cobrar({ amount: Number(precos[0].amount), method, description: precos[0].code });
    await this.log('asaas', 'subscription.create', resultado.estado === 'falhou' ? 'failed' : 'ok');
    if (resultado.estado === 'falhou') return 'cobranca' as const;
    const pago = resultado.estado === 'pago';
    const criadas = await this.dados.query<{ id: string }[]>(
      `INSERT INTO subscription.user_subscriptions
         (user_id, plan_id, plan_price_id, status, provider, provider_subscription_id, started_at, current_period_start, current_period_end)
       VALUES ($1, $2, $3, $4::subscription.subscription_status, 'asaas', $5, clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '30 days')
       RETURNING id`,
      [userId, precos[0].plan_id, planPriceId, pago ? 'active' : 'past_due', resultado.providerSubscriptionId],
    );
    await this.dados.query(
      `INSERT INTO subscription.subscription_payments (subscription_id, provider_payment_id, amount, currency, status, paid_at)
       VALUES ($1, $2, $3, 'BRL', $4, CASE WHEN $5 THEN clock_timestamp() ELSE NULL END)`,
      [criadas[0].id, resultado.providerPaymentId, precos[0].amount, pago ? 'paid' : 'pending', pago],
    );
    return this.atual(userId);
  }

  async trocar(userId: string, subscriptionId: string, planPriceId: string) {
    const atuais = await this.dados.query<{ plan_id: string }[]>(
      `SELECT plan_id FROM subscription.user_subscriptions WHERE id = $1 AND user_id = $2 AND status = 'active' AND provider_subscription_id IS NOT NULL`,
      [subscriptionId, userId],
    );
    if (atuais.length === 0) return 'ausente' as const;
    const precos = await this.dados.query<{ plan_id: string; amount: string }[]>(
      `SELECT plan_id, amount::text AS amount FROM subscription.plan_prices WHERE id = $1 AND is_active`,
      [planPriceId],
    );
    if (precos.length === 0) return 'plano' as const;
    const resultado = await this.cobranca.cobrar({ amount: Number(precos[0].amount), method: 'credit_card', description: 'troca' });
    await this.log('asaas', 'subscription.change', resultado.estado);
    if (resultado.estado !== 'pago') return 'cobranca' as const;
    await this.dados.query(
      `UPDATE subscription.user_subscriptions SET plan_id = $2, plan_price_id = $3, updated_at = clock_timestamp() WHERE id = $1`,
      [subscriptionId, precos[0].plan_id, planPriceId],
    );
    return this.atual(userId);
  }

  async cancelar(userId: string, subscriptionId: string) {
    const linhas = await this.dados.query(
      `UPDATE subscription.user_subscriptions
       SET cancel_at_period_end = true, cancelled_at = clock_timestamp(), updated_at = clock_timestamp()
       WHERE id = $1 AND user_id = $2 AND status = 'active'
       RETURNING id`,
      [subscriptionId, userId],
    );
    if (linhasRetornadas(linhas).length === 0) return 'ausente' as const;
    return this.atual(userId);
  }

  faturas(userId: string) {
    return this.dados.query(
      `SELECT pagamento.id, pagamento.amount::text AS amount, trim(pagamento.currency) AS currency, pagamento.status, pagamento.paid_at AS "paidAt", plano.code
       FROM subscription.subscription_payments pagamento
       JOIN subscription.user_subscriptions assinatura ON assinatura.id = pagamento.subscription_id
       JOIN subscription.plans plano ON plano.id = assinatura.plan_id
       WHERE assinatura.user_id = $1
       ORDER BY pagamento.created_at DESC`,
      [userId],
    );
  }

  async resgatarCupom(userId: string, code: string) {
    const cupons = await this.dados.query<{ id: string; free_days: number }[]>(
      `SELECT id, free_days FROM subscription.coupons
       WHERE lower(code) = lower($1) AND is_active AND (valid_until IS NULL OR valid_until >= current_date)`,
      [code],
    );
    if (cupons.length === 0) return 'cupom' as const;
    const fim = await this.aplicarBeneficio(userId, cupons[0].free_days, cupons[0].id, null);
    return fim;
  }

  async concederPromo(adminId: string, userId: string) {
    const contas = await this.dados.query(`SELECT 1 FROM identity.users WHERE id = $1 AND deleted_at IS NULL AND status = 'active'`, [userId]);
    if (contas.length === 0) return 'conta' as const;
    if (!(await this.planoPago())) return 'plano' as const;
    const grants = await this.dados.query<{ id: string }[]>(
      `INSERT INTO subscription.promo_grants (user_id, granted_by_admin_id, starts_at, ends_at)
       SELECT $1, $2, agora, agora + interval '30 days' FROM (SELECT clock_timestamp() AS agora) relogio
       RETURNING id`,
      [userId, adminId],
    );
    await this.aplicarBeneficio(userId, 30, null, grants[0].id);
    return { id: grants[0].id };
  }

  async revogarPromo(id: string) {
    const linhas = await this.dados.query<{ user_id: string }[]>(
      `UPDATE subscription.promo_grants SET revoked_at = clock_timestamp() WHERE id = $1 AND revoked_at IS NULL RETURNING user_id`,
      [id],
    );
    const ids = linhasRetornadas<{ user_id: string }>(linhas);
    if (ids.length === 0) return 'ausente' as const;
    await this.dados.query(
      `UPDATE subscription.user_subscriptions assinatura
       SET promo_grant_id = NULL,
           status = CASE WHEN assinatura.coupon_id IS NULL THEN 'expired'::subscription.subscription_status ELSE 'active'::subscription.subscription_status END,
           current_period_end = CASE
             WHEN assinatura.coupon_id IS NULL THEN clock_timestamp()
             ELSE assinatura.started_at + make_interval(days => (SELECT free_days FROM subscription.coupons WHERE id = assinatura.coupon_id))
           END,
           updated_at = clock_timestamp()
       WHERE assinatura.user_id = $1 AND assinatura.promo_grant_id = $2 AND assinatura.provider_subscription_id IS NULL`,
      [ids[0].user_id, id],
    );
    return 'ok' as const;
  }

  cupons() {
    return this.dados.query(`SELECT id, code, free_days AS "freeDays", valid_until::text AS "validUntil", is_active AS "isActive" FROM subscription.coupons ORDER BY created_at DESC`);
  }

  async salvarCupom(entrada: { id?: string; code: string; freeDays: number; validUntil: string | null; isActive: boolean }) {
    if (entrada.id) {
      const linhas = await this.dados.query(
        `UPDATE subscription.coupons SET code = $2, free_days = $3, valid_until = $4, is_active = $5, updated_at = clock_timestamp() WHERE id = $1 RETURNING id`,
        [entrada.id, entrada.code, entrada.freeDays, entrada.validUntil, entrada.isActive],
      );
      if (linhasRetornadas(linhas).length === 0) return 'ausente' as const;
      return this.cupons();
    }
    try {
      await this.dados.query(
        `INSERT INTO subscription.coupons (code, free_days, valid_until, is_active) VALUES ($1, $2, $3, $4)`,
        [entrada.code, entrada.freeDays, entrada.validUntil, entrada.isActive],
      );
    } catch (erro) {
      if (codigoDe(erro) === '23505') return 'cupom' as const;
      throw erro;
    }
    return this.cupons();
  }

  async excluirCupom(id: string) {
    const usados = await this.dados.query(`SELECT 1 FROM subscription.user_subscriptions WHERE coupon_id = $1`, [id]);
    if (usados.length > 0) return 'cupom' as const;
    const linhas = await this.dados.query(`DELETE FROM subscription.coupons WHERE id = $1 RETURNING id`, [id]);
    return linhasRetornadas(linhas).length > 0 ? ('ok' as const) : ('ausente' as const);
  }

  async definirMetodo(method: string, isEnabled: boolean) {
    if (!isEnabled) {
      const ligados = await this.dados.query(`SELECT 1 FROM subscription.payment_method_settings WHERE is_enabled AND method::text <> $1`, [method]);
      if (ligados.length === 0) return 'ultimo' as const;
    }
    const linhas = await this.dados.query(
      `UPDATE subscription.payment_method_settings SET is_enabled = $2, updated_at = clock_timestamp() WHERE method::text = $1 RETURNING method`,
      [method, isEnabled],
    );
    if (linhasRetornadas(linhas).length === 0) return 'ausente' as const;
    return this.metodos();
  }

  async janelas() {
    await this.garantirJanelas();
    const linhas = await this.dados.query<{ setting_key: string; setting_value: number }[]>(
      `SELECT setting_key, setting_value::text::int AS setting_value FROM platform.system_settings WHERE setting_key IN ('refund.trial_days', 'refund.duplicate_days')`,
    );
    const mapa = Object.fromEntries(linhas.map((linha) => [linha.setting_key, Number(linha.setting_value)]));
    return { trialDays: mapa['refund.trial_days'] ?? 7, duplicateDays: mapa['refund.duplicate_days'] ?? 60 };
  }

  async salvarJanelas(adminId: string, trialDays: number, duplicateDays: number) {
    await this.garantirJanelas();
    await this.dados.query(
      `UPDATE platform.system_settings SET setting_value = to_jsonb($1::int), updated_by_admin_id = $2, updated_at = clock_timestamp() WHERE setting_key = 'refund.trial_days'`,
      [trialDays, adminId],
    );
    await this.dados.query(
      `UPDATE platform.system_settings SET setting_value = to_jsonb($1::int), updated_by_admin_id = $2, updated_at = clock_timestamp() WHERE setting_key = 'refund.duplicate_days'`,
      [duplicateDays, adminId],
    );
    return this.janelas();
  }

  async elegiveis() {
    const janela = await this.janelas();
    return this.dados.query(
      `SELECT assinatura.id, perfil.display_name AS "userName", plano.code, pagamento.paid_at AS "paidAt"
       FROM subscription.user_subscriptions assinatura
       JOIN identity.user_profiles perfil ON perfil.user_id = assinatura.user_id
       JOIN subscription.plans plano ON plano.id = assinatura.plan_id
       JOIN subscription.subscription_payments pagamento ON pagamento.subscription_id = assinatura.id AND pagamento.status = 'paid' AND pagamento.refunded_at IS NULL
       WHERE assinatura.refunded_at IS NULL AND assinatura.provider_subscription_id IS NOT NULL
         AND pagamento.paid_at > clock_timestamp() - make_interval(days => $1::int)
       ORDER BY pagamento.paid_at DESC`,
      [Math.max(janela.trialDays, janela.duplicateDays)],
    );
  }

  async estornar(adminId: string, subscriptionId: string, reason: 'trial' | 'duplicate_charge') {
    const janela = await this.janelas();
    const dias = reason === 'trial' ? janela.trialDays : janela.duplicateDays;
    const linhas = await this.dados.query<{ payment_id: string; provider_payment_id: string | null }[]>(
      `SELECT pagamento.id AS payment_id, pagamento.provider_payment_id
       FROM subscription.user_subscriptions assinatura
       JOIN subscription.subscription_payments pagamento ON pagamento.subscription_id = assinatura.id AND pagamento.status = 'paid' AND pagamento.refunded_at IS NULL
       WHERE assinatura.id = $1 AND assinatura.refunded_at IS NULL AND assinatura.provider_subscription_id IS NOT NULL
         AND assinatura.coupon_id IS NULL
         AND pagamento.paid_at > clock_timestamp() - make_interval(days => $2::int)`,
      [subscriptionId, dias],
    );
    if (linhas.length === 0) return 'janela' as const;
    const resultado = await this.cobranca.estornar(linhas[0].provider_payment_id);
    await this.log('asaas', 'refund.create', resultado.estado);
    if (resultado.estado !== 'estornado') {
      await this.dados.query(
        `INSERT INTO subscription.refunds (subscription_id, payment_id, approved_by_admin_id, status, reason, failure_reason)
         VALUES ($1, $2, $3, 'failed', $4::subscription.refund_reason, 'A Asaas não confirmou o estorno.')`,
        [subscriptionId, linhas[0].payment_id, adminId, reason],
      );
      return 'cobranca' as const;
    }
    const criados = await this.dados.query<{ id: string }[]>(
      `INSERT INTO subscription.refunds (subscription_id, payment_id, approved_by_admin_id, status, provider_refund_id, reason, resolved_at)
       VALUES ($1, $2, $3, 'refunded', $4, $5::subscription.refund_reason, clock_timestamp())
       RETURNING id`,
      [subscriptionId, linhas[0].payment_id, adminId, resultado.providerRefundId, reason],
    );
    await this.dados.query(
      `UPDATE subscription.subscription_payments SET status = 'refunded', refunded_at = clock_timestamp() WHERE id = $1`,
      [linhas[0].payment_id],
    );
    await this.dados.query(
      `UPDATE subscription.user_subscriptions SET status = 'cancelled', refunded_at = clock_timestamp(), updated_at = clock_timestamp() WHERE id = $1`,
      [subscriptionId],
    );
    return { id: criados[0].id };
  }

  async criarConta(provider: string, accountName: string, credentialsReference: string) {
    if (!referenciaValida(credentialsReference)) return 'conta' as const;
    const criadas = await this.dados.query<{ id: string }[]>(
      `INSERT INTO integration.external_provider_accounts (provider, account_name, credentials_reference)
       VALUES ($1, $2, $3) RETURNING id`,
      [provider, accountName, credentialsReference],
    );
    return { id: criadas[0].id };
  }

  async sincronizar(accountId: string) {
    const contas = await this.dados.query(`SELECT 1 FROM integration.external_provider_accounts WHERE id = $1`, [accountId]);
    if (contas.length === 0) return 'ausente' as const;
    const jobs = await this.dados.query<{ id: string }[]>(
      `INSERT INTO integration.external_sync_jobs (provider_account_id, sync_type, status, started_at, finished_at)
       VALUES ($1, 'manual', 'completed', clock_timestamp(), clock_timestamp()) RETURNING id`,
      [accountId],
    );
    await this.log('asaas', 'sync', 'completed');
    return { id: jobs[0].id };
  }

  async referenciar(entityType: string, entityId: string, provider: string, externalId: string) {
    const criadas = await this.dados.query<{ id: string }[]>(
      `INSERT INTO integration.external_references (entity_type, entity_id, provider, external_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [entityType, entityId, provider, externalId],
    );
    return { id: criadas[0].id };
  }

  logs() {
    return this.dados.query(
      `SELECT id, provider, operation, status, response_code AS "responseCode", error_message AS "errorMessage", created_at AS "createdAt"
       FROM integration.integration_logs ORDER BY created_at DESC LIMIT 50`,
    );
  }

  pagamentos(filtro: { status: string | null; email: string | null; from: string | null; to: string | null }) {
    return this.dados.query(
      `SELECT pagamento.id, pagamento.amount::text AS amount, trim(pagamento.currency) AS currency, pagamento.status,
              pagamento.provider_payment_id AS "providerPaymentId", pagamento.paid_at AS "paidAt",
              pagamento.created_at AS "createdAt", conta.email, plano.code
       FROM subscription.subscription_payments pagamento
       JOIN subscription.user_subscriptions assinatura ON assinatura.id = pagamento.subscription_id
       JOIN identity.users conta ON conta.id = assinatura.user_id
       JOIN subscription.plans plano ON plano.id = assinatura.plan_id
       WHERE ($1::text IS NULL OR pagamento.status = $1)
         AND ($2::text IS NULL OR conta.email ILIKE $2)
         AND ($3::date IS NULL OR pagamento.created_at::date >= $3::date)
         AND ($4::date IS NULL OR pagamento.created_at::date <= $4::date)
       ORDER BY pagamento.created_at DESC
       LIMIT 50`,
      [filtro.status, filtro.email ? `%${filtro.email}%` : null, filtro.from, filtro.to],
    );
  }

  assinaturas(filtro: { email: string | null; status: string | null; plan: string | null; cancelled: boolean | null; refunded: boolean | null; provider: boolean | null }) {
    return this.dados.query(
      `SELECT assinatura.id, conta.email, perfil.display_name AS "userName", plano.code, assinatura.status::text AS status,
              assinatura.started_at AS "startedAt", assinatura.current_period_end AS "endsAt",
              assinatura.provider_subscription_id AS "providerSubscriptionId",
              assinatura.cancel_at_period_end AS "cancelAtPeriodEnd",
              assinatura.refunded_at IS NOT NULL AS refunded,
              assinatura.coupon_id IS NOT NULL AS coupon,
              assinatura.promo_grant_id IS NOT NULL AS promo
       FROM subscription.user_subscriptions assinatura
       JOIN identity.users conta ON conta.id = assinatura.user_id
       JOIN identity.user_profiles perfil ON perfil.user_id = conta.id
       JOIN subscription.plans plano ON plano.id = assinatura.plan_id
       WHERE ($1::text IS NULL OR conta.email ILIKE $1)
         AND ($2::text IS NULL OR assinatura.status::text = $2)
         AND ($3::text IS NULL OR plano.code ILIKE $3)
         AND ($4::boolean IS NULL OR assinatura.cancel_at_period_end = $4 OR ($4 AND assinatura.status = 'cancelled'))
         AND ($5::boolean IS NULL OR (assinatura.refunded_at IS NOT NULL) = $5)
         AND ($6::boolean IS NULL OR (assinatura.provider_subscription_id IS NOT NULL) = $6)
       ORDER BY assinatura.created_at DESC
       LIMIT 50`,
      [filtro.email ? `%${filtro.email}%` : null, filtro.status, filtro.plan ? `%${filtro.plan}%` : null, filtro.cancelled, filtro.refunded, filtro.provider],
    );
  }

  promocoes() {
    return this.dados.query(
      `SELECT concessao.id, conta.email, perfil.display_name AS "userName",
              concessao.starts_at AS "startsAt", concessao.ends_at AS "endsAt", concessao.revoked_at AS "revokedAt"
       FROM subscription.promo_grants concessao
       JOIN identity.users conta ON conta.id = concessao.user_id
       JOIN identity.user_profiles perfil ON perfil.user_id = conta.id
       ORDER BY concessao.created_at DESC
       LIMIT 50`,
    );
  }

  eventos() {
    return this.dados
      .query<{ id: string; event_type: string; provider_event_id: string | null; payload: Record<string, unknown> | null; created_at: Date }[]>(
        `SELECT id, event_type, provider_event_id, payload, created_at
         FROM subscription.subscription_events
         ORDER BY created_at DESC
         LIMIT 50`,
      )
      .then((linhas) =>
        linhas.map((linha) => ({
          id: linha.id,
          eventType: linha.event_type,
          providerEventId: linha.provider_event_id,
          createdAt: linha.created_at,
          payload: semSegredo(linha.payload ?? {}),
        })),
      );
  }

  private async aplicarBeneficio(userId: string, dias: number, couponId: string | null, promoId: string | null) {
    const plano = await this.planoPago();
    if (!plano) return 'plano' as const;
    const abertas = await this.dados.query<{ id: string }[]>(
      `SELECT id FROM subscription.user_subscriptions
       WHERE user_id = $1 AND status = 'active' AND provider_subscription_id IS NULL
       ORDER BY current_period_end DESC NULLS LAST LIMIT 1`,
      [userId],
    );
    const fim = `clock_timestamp() + make_interval(days => ${Number(dias)})`;
    if (abertas.length === 0) {
      await this.dados.query(
        `INSERT INTO subscription.user_subscriptions
           (user_id, plan_id, coupon_id, promo_grant_id, status, started_at, current_period_start, current_period_end)
         VALUES ($1, $2, $3, $4, 'active', clock_timestamp(), clock_timestamp(), ${fim})`,
        [userId, plano, couponId, promoId],
      );
      return this.atual(userId);
    }
    await this.dados.query(
      `UPDATE subscription.user_subscriptions
       SET current_period_end = GREATEST(current_period_end, ${fim}),
           coupon_id = COALESCE($2, coupon_id),
           promo_grant_id = COALESCE($3, promo_grant_id),
           updated_at = clock_timestamp()
       WHERE id = $1`,
      [abertas[0].id, couponId, promoId],
    );
    return this.atual(userId);
  }

  private async planoPago(): Promise<string | null> {
    const linhas = await this.dados.query<{ id: string }[]>(
      `SELECT id FROM subscription.plans WHERE is_active AND NOT is_free ORDER BY created_at LIMIT 1`,
    );
    return linhas[0]?.id ?? null;
  }

  private async metodoLigado(method: string): Promise<boolean> {
    const linhas = await this.dados.query(`SELECT 1 FROM subscription.payment_method_settings WHERE method::text = $1 AND is_enabled`, [method]);
    return linhas.length > 0;
  }

  private async garantirJanelas(): Promise<void> {
    await this.dados.query(
      `INSERT INTO platform.system_settings (setting_key, setting_value, description)
       VALUES ('refund.trial_days', '7'::jsonb, 'Dias para estorno de teste'),
              ('refund.duplicate_days', '60'::jsonb, 'Dias para estorno de cobrança duplicada')
       ON CONFLICT (setting_key) DO NOTHING`,
    );
  }

  private async log(provider: string, operation: string, status: string): Promise<void> {
    await this.dados.query(
      `INSERT INTO integration.integration_logs (provider, operation, status, response_code) VALUES ($1, $2, $3, $4)`,
      [provider, operation, status, status === 'failed' || status === 'falhou' ? 502 : 200],
    );
  }
}

function semSegredo(corpo: Record<string, unknown>): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...corpo };
  delete copia.creditCard;
  delete copia.creditCardToken;
  delete copia.token;
  if (copia.payment && typeof copia.payment === 'object') {
    const pagamento = { ...(copia.payment as Record<string, unknown>) };
    delete pagamento.creditCard;
    delete pagamento.creditCardToken;
    copia.payment = pagamento;
  }
  return copia;
}

function referenciaValida(valor: string): boolean {
  if (valor.length < 3 || valor.length > 150) return false;
  if (/\s/.test(valor) || valor.includes('$') || /aact_|bearer|sk-/i.test(valor)) return false;
  return /^[A-Za-z0-9:._-]+$/.test(valor);
}

function linhasRetornadas<T>(resultado: T[] | [T[], number]): T[] {
  return Array.isArray(resultado[0]) ? resultado[0] : (resultado as T[]);
}

function codigoDe(erro: unknown): string | undefined {
  if (typeof erro !== 'object' || erro === null) return undefined;
  const direto = 'code' in erro ? (erro as { code?: unknown }).code : undefined;
  if (typeof direto === 'string') return direto;
  const driver = 'driverError' in erro ? (erro as { driverError?: { code?: unknown } }).driverError : undefined;
  return typeof driver?.code === 'string' ? driver.code : undefined;
}
