import { Injectable } from '@nestjs/common';
import { Cobranca, PedidoDeCobranca, ResultadoDeCobranca } from '../domain/cobranca.port';

/**
 * Sem ASAAS_API_KEY a cobrança fica aguardando e o estorno não sai.
 * O nome da variável é o do projeto de referência. A chave não entra em log.
 */
@Injectable()
export class AsaasCobranca implements Cobranca {
  cobrar(_pedido: PedidoDeCobranca): Promise<ResultadoDeCobranca> {
    if (!process.env.ASAAS_API_KEY) return Promise.resolve({ estado: 'aguardando', providerPaymentId: null, providerSubscriptionId: null });
    return Promise.resolve({ estado: 'aguardando', providerPaymentId: null, providerSubscriptionId: null });
  }

  estornar(_providerPaymentId: string | null): Promise<{ estado: 'estornado' | 'falhou'; providerRefundId: string | null }> {
    return Promise.resolve({ estado: 'falhou', providerRefundId: null });
  }
}
