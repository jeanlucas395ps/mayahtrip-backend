import { timingSafeEqual } from 'node:crypto';
import { Controller, Headers, HttpCode, HttpException, HttpStatus, Inject, Post, Body, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

/**
 * O contrato veio do projeto de referência da Asaas: o header
 * asaas-access-token precisa bater com ASAAS_WEBHOOK_TOKEN.
 * Sem o token configurado, a rota recusa. O corpo fica no histórico
 * de assinatura e não vai para o log.
 */
@ApiTags('asaas')
@Controller({ path: 'webhooks/asaas', version: VERSION_NEUTRAL })
export class AsaasWebhookController {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async receber(
    @Headers('asaas-access-token') token: string | undefined,
    @Body() corpo: Record<string, unknown>,
  ): Promise<{ recebido: true }> {
    const esperado = process.env.ASAAS_WEBHOOK_TOKEN ?? '';
    if (!tokenConfere(esperado, token)) {
      throw new HttpException({ message: 'Não foi possível entrar.' }, HttpStatus.UNAUTHORIZED);
    }

    const evento = typeof corpo.event === 'string' ? corpo.event : 'unknown';
    const pagamento = corpo.payment;
    const pagamentoId = pagamento && typeof pagamento === 'object' && 'id' in pagamento ? String((pagamento as { id: unknown }).id) : null;
    const limpo = semSegredo(corpo);

    await this.dados.query(
      `INSERT INTO subscription.subscription_events
         (subscription_id, provider, event_type, provider_event_id, payload, processed_at)
       VALUES (
         (SELECT id FROM subscription.user_subscriptions WHERE provider_subscription_id = $4 LIMIT 1),
         'asaas', $1, $2, $3::jsonb, now()
       )`,
      [evento, pagamentoId, JSON.stringify(limpo), pagamentoId],
    );
    if (pagamentoId && (evento === 'PAYMENT_CONFIRMED' || evento === 'PAYMENT_RECEIVED')) {
      await this.dados.query(
        `UPDATE subscription.subscription_payments
         SET status = 'paid', paid_at = COALESCE(paid_at, clock_timestamp())
         WHERE provider_payment_id = $1 AND status = 'pending'`,
        [pagamentoId],
      );
      await this.dados.query(
        `UPDATE subscription.user_subscriptions
         SET status = 'active', updated_at = clock_timestamp()
         WHERE id IN (SELECT subscription_id FROM subscription.subscription_payments WHERE provider_payment_id = $1)
           AND status = 'past_due'`,
        [pagamentoId],
      );
    }

    return { recebido: true };
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

export function tokenConfere(esperado: string, recebido: string | undefined): boolean {
  if (!esperado || !recebido) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
