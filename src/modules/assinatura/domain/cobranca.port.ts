export const COBRANCA = Symbol('COBRANCA');

export interface PedidoDeCobranca {
  amount: number;
  method: 'credit_card' | 'boleto' | 'pix';
  description: string;
}

export interface ResultadoDeCobranca {
  estado: 'pago' | 'aguardando' | 'falhou';
  providerPaymentId: string | null;
  providerSubscriptionId: string | null;
}

export interface Cobranca {
  cobrar(pedido: PedidoDeCobranca): Promise<ResultadoDeCobranca>;
  estornar(providerPaymentId: string | null): Promise<{ estado: 'estornado' | 'falhou'; providerRefundId: string | null }>;
}
