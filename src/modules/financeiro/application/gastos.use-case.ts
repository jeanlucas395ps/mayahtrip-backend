import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ARMAZENAMENTO, ArmazenamentoDeArquivo } from '../../identidade/domain/ports/armazenamento.port';
import { fecharDivisao, ParteDaDivisao } from '../domain/divisao';
import { ContextoDoGasto, FalhaGasto, GASTOS, GastosRepositorio, PainelDeGastos } from '../domain/gasto.port';

const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const LIMITE_BYTES = 10 * 1024 * 1024;

export interface EntradaDeGasto {
  title?: string;
  description?: string;
  amount: number;
  currency: string;
  categoryId: string;
  context: ContextoDoGasto;
  expenseDate?: string;
  isEstimate?: boolean;
  paidByParticipantId: string;
  splits: ParteDaDivisao[];
}

@Injectable()
export class GastosUseCase {
  constructor(
    @Inject(GASTOS) private readonly gastos: GastosRepositorio,
    @Inject(ARMAZENAMENTO) private readonly arquivos: ArmazenamentoDeArquivo,
  ) {}

  painel(userId: string, viagemId: string): Promise<PainelDeGastos | FalhaGasto> {
    return this.gastos.painel(userId, viagemId);
  }

  criar(userId: string, viagemId: string, entrada: EntradaDeGasto): Promise<PainelDeGastos | FalhaGasto> {
    const gasto = preparar(entrada);
    if (gasto === 'divisao') return Promise.resolve('divisao');
    return this.gastos.criar(userId, viagemId, gasto);
  }

  editar(userId: string, viagemId: string, gastoId: string, entrada: EntradaDeGasto): Promise<PainelDeGastos | FalhaGasto> {
    const gasto = preparar(entrada);
    if (gasto === 'divisao') return Promise.resolve('divisao');
    return this.gastos.editar(userId, viagemId, gastoId, gasto);
  }

  excluir(userId: string, viagemId: string, gastoId: string): Promise<PainelDeGastos | FalhaGasto> {
    return this.gastos.excluir(userId, viagemId, gastoId);
  }

  async guardarRecibo(userId: string, viagemId: string, gastoId: string, bytes: Buffer, mime: string): Promise<PainelDeGastos | FalhaGasto> {
    if (!MIMES.has(mime) || bytes.length === 0 || bytes.length > LIMITE_BYTES) return 'recibo';
    const chave = `viagens/${viagemId}/recibo-${gastoId}-${randomUUID()}`;
    await this.arquivos.guardar(chave, bytes, mime);
    const anterior = await this.gastos.guardarRecibo(userId, viagemId, gastoId, chave, mime);
    if (anterior === 'ausente' || anterior === 'semGasto' || anterior === 'divisao' || anterior === 'moeda' || anterior === 'categoria' || anterior === 'pessoa' || anterior === 'data' || anterior === 'cambio' || anterior === 'recibo' || anterior === 'acerto') {
      await this.arquivos.apagar(chave);
      return anterior;
    }
    if (anterior) await this.arquivos.apagar(anterior);
    return this.gastos.painel(userId, viagemId);
  }

  async recibo(userId: string, viagemId: string, gastoId: string): Promise<{ bytes: Buffer; mime: string } | FalhaGasto | 'recibo'> {
    const chave = await this.gastos.chaveDoRecibo(userId, viagemId, gastoId);
    if (chave === 'ausente' || chave === 'semGasto' || chave === 'divisao' || chave === 'moeda' || chave === 'categoria' || chave === 'pessoa' || chave === 'data' || chave === 'cambio' || chave === 'recibo' || chave === 'acerto') {
      return chave;
    }
    if (!chave) return 'recibo';
    const arquivo = await this.arquivos.ler(chave);
    return arquivo ?? 'recibo';
  }

  acertar(userId: string, viagemId: string, payerId: string, receiverId: string, amount: number, currency: string): Promise<PainelDeGastos | FalhaGasto> {
    return this.gastos.acertar(userId, viagemId, payerId, receiverId, amount, currency.toUpperCase());
  }

  desfazerAcerto(userId: string, viagemId: string, acertoId: string): Promise<PainelDeGastos | FalhaGasto> {
    return this.gastos.desfazerAcerto(userId, viagemId, acertoId);
  }
}

function preparar(entrada: EntradaDeGasto): Parameters<GastosRepositorio['criar']>[2] | 'divisao' {
  const splits = fecharDivisao(entrada.amount, entrada.splits);
  if (splits === 'divisao') return 'divisao';
  return {
    title: entrada.title,
    description: entrada.description,
    amount: entrada.amount,
    currency: entrada.currency.toUpperCase(),
    categoryId: entrada.categoryId,
    context: entrada.context,
    expenseDate: entrada.expenseDate,
    isEstimate: entrada.isEstimate,
    paidByParticipantId: entrada.paidByParticipantId,
    splits,
  };
}
