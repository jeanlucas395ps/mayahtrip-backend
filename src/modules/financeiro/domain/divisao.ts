export type TipoDeDivisao = 'equal' | 'percent' | 'fixed';

export interface ParteDaDivisao {
  participantId: string;
  allocationType: TipoDeDivisao;
  allocationValue?: number;
}

export interface ParteFechada {
  participantId: string;
  allocationType: TipoDeDivisao;
  allocationValue: number | null;
  shareAmount: number;
}

export function fecharDivisao(valor: number, partes: ParteDaDivisao[]): ParteFechada[] | 'divisao' {
  if (partes.length === 0 || partes.some((parte, indice) => partes.findIndex((outra) => outra.participantId === parte.participantId) !== indice)) {
    return 'divisao';
  }
  const tipos = new Set(partes.map((parte) => parte.allocationType));
  if (tipos.size !== 1) return 'divisao';
  const ordenadas = [...partes].sort((a, b) => a.participantId.localeCompare(b.participantId));
  const tipo = ordenadas[0].allocationType;
  if (tipo === 'equal') {
    const base = Math.floor((valor * 100) / ordenadas.length) / 100;
    const resto = centavos(valor - base * ordenadas.length);
    return ordenadas.map((parte, indice) => ({
      participantId: parte.participantId,
      allocationType: 'equal',
      allocationValue: null,
      shareAmount: indice === ordenadas.length - 1 ? centavos(base + resto) : base,
    }));
  }
  if (tipo === 'percent') {
    if (ordenadas.some((parte) => parte.allocationValue === undefined)) return 'divisao';
    const soma = ordenadas.reduce((total, parte) => total + (parte.allocationValue ?? 0), 0);
    if (Math.abs(soma - 100) > 0.01) return 'divisao';
    const cotas = ordenadas.map((parte) => centavos((valor * (parte.allocationValue ?? 0)) / 100));
    cotas[cotas.length - 1] = centavos(cotas[cotas.length - 1] + centavos(valor - cotas.reduce((a, b) => a + b, 0)));
    return ordenadas.map((parte, indice) => ({
      participantId: parte.participantId,
      allocationType: 'percent',
      allocationValue: parte.allocationValue ?? null,
      shareAmount: cotas[indice],
    }));
  }
  if (ordenadas.some((parte) => parte.allocationValue === undefined)) return 'divisao';
  const soma = ordenadas.reduce((total, parte) => total + (parte.allocationValue ?? 0), 0);
  if (Math.abs(soma - valor) > 0.01) return 'divisao';
  return ordenadas.map((parte) => ({
    participantId: parte.participantId,
    allocationType: 'fixed',
    allocationValue: parte.allocationValue ?? null,
    shareAmount: centavos(parte.allocationValue ?? 0),
  }));
}

function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}
