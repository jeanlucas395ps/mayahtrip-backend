export const PAISES_NO_MUNDO = 195;

export type OrigemVisita = 'manual' | 'trip';

export class VisitaInvalidaError extends Error {
  constructor(readonly motivo: 'data') {
    super(motivo);
    this.name = 'VisitaInvalidaError';
  }
}

export interface VisitaAtual {
  origem: OrigemVisita;
  viagemId: string | null;
  quando: string | null;
}

export interface VisitaNova {
  origem: OrigemVisita;
  viagemId: string | null;
  quando: string | null;
}

export type DecisaoVisita =
  | { tipo: 'inserir' }
  | { tipo: 'atualizar'; origem: OrigemVisita; viagemId: string | null; quando: string | null }
  | { tipo: 'manter' };

/** Uma linha por pessoa. Viagem passada substitui a marca manual. A primeira viagem permanece. */
export function decidirMarcacao(atual: VisitaAtual | null, nova: VisitaNova): DecisaoVisita {
  if (!atual) return { tipo: 'inserir' };
  if (atual.origem === 'trip') return { tipo: 'manter' };
  if (nova.origem === 'trip') {
    return { tipo: 'atualizar', origem: 'trip', viagemId: nova.viagemId, quando: nova.quando };
  }
  if (nova.quando && nova.quando !== atual.quando) {
    return { tipo: 'atualizar', origem: 'manual', viagemId: null, quando: nova.quando };
  }
  return { tipo: 'manter' };
}

export function podeRemover(atual: VisitaAtual | null): 'remover' | 'ausente' | 'viagem' {
  if (!atual) return 'ausente';
  if (atual.origem === 'trip') return 'viagem';
  return 'remover';
}

export function dataDeVisita(valor: string | undefined): string | null {
  if (valor === undefined || valor.trim() === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new VisitaInvalidaError('data');
  const [ano, mes, dia] = valor.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
    throw new VisitaInvalidaError('data');
  }
  return valor;
}

/** BUSINESS/32: visitados ÷ 195, mínimo exibido 1% quando há visita. */
export function percentualDoMundo(quantidade: number): number {
  if (quantidade <= 0) return 0;
  const bruto = Math.round((quantidade / PAISES_NO_MUNDO) * 100);
  return Math.min(100, Math.max(1, bruto));
}
