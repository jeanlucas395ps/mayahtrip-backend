import { ParteFechada, TipoDeDivisao } from './divisao';

export const GASTOS = Symbol('GASTOS');

export type ContextoDoGasto = 'before_trip' | 'on_trip' | 'after_trip' | 'planned';

export interface GastoNovo {
  title?: string;
  description?: string;
  amount: number;
  currency: string;
  categoryId: string;
  context: ContextoDoGasto;
  expenseDate?: string;
  isEstimate?: boolean;
  paidByParticipantId: string;
  splits: ParteFechada[];
}

export interface CotaLida {
  participantId: string;
  displayName: string;
  allocationType: TipoDeDivisao;
  allocationValue: number | null;
  shareAmount: number;
}

export interface GastoLido {
  id: string;
  title: string;
  description: string | null;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  amountOriginal: number;
  currencyOriginal: string;
  amountDisplay: number;
  expenseDate: string | null;
  context: ContextoDoGasto;
  isEstimate: boolean;
  paidByParticipantId: string;
  paidByName: string;
  hasReceipt: boolean;
  splits: CotaLida[];
}

export interface AcertoLido {
  id: string;
  payerParticipantId: string;
  payerName: string;
  receiverParticipantId: string;
  receiverName: string;
  amount: number;
  currency: string;
  amountDisplay: number;
  undone: boolean;
}

export interface SaldoLido {
  participantId: string;
  displayName: string;
  net: number;
}

export interface PainelDeGastos {
  currency: string;
  total: number;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  categories: { slug: string; name: string; total: number }[];
  balances: SaldoLido[];
  expenses: GastoLido[];
  settlements: AcertoLido[];
}

export type FalhaGasto = 'ausente' | 'semGasto' | 'divisao' | 'moeda' | 'categoria' | 'pessoa' | 'data' | 'cambio' | 'recibo' | 'acerto';

export interface GastosRepositorio {
  painel(userId: string, viagemId: string): Promise<PainelDeGastos | FalhaGasto>;
  criar(userId: string, viagemId: string, gasto: GastoNovo): Promise<PainelDeGastos | FalhaGasto>;
  editar(userId: string, viagemId: string, gastoId: string, gasto: GastoNovo): Promise<PainelDeGastos | FalhaGasto>;
  excluir(userId: string, viagemId: string, gastoId: string): Promise<PainelDeGastos | FalhaGasto>;
  guardarRecibo(userId: string, viagemId: string, gastoId: string, chave: string, mime: string): Promise<string | null | FalhaGasto>;
  chaveDoRecibo(userId: string, viagemId: string, gastoId: string): Promise<string | null | FalhaGasto>;
  acertar(userId: string, viagemId: string, payerId: string, receiverId: string, amount: number, currency: string): Promise<PainelDeGastos | FalhaGasto>;
  desfazerAcerto(userId: string, viagemId: string, acertoId: string): Promise<PainelDeGastos | FalhaGasto>;
}
