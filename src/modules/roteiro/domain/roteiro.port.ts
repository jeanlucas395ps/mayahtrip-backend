export const ROTEIRO = Symbol('ROTEIRO');

export interface ParadaLida {
  id: string;
  title: string | null;
  sortOrder: number;
  startTime: string | null;
  durationMinutes: number | null;
  done: boolean;
}

export interface DeslocamentoLido {
  id: string;
  fromStopId: string | null;
  toStopId: string | null;
  transportType: string | null;
  durationSeconds: number | null;
}

export interface DiaLido {
  id: string;
  dayNumber: number;
  date: string | null;
  title: string | null;
  destinationId: string | null;
  stops: ParadaLida[];
  transfers: DeslocamentoLido[];
}

export interface RoteiroLido {
  id: string | null;
  days: DiaLido[];
}

export interface DiaNovo {
  dayNumber: number;
  date?: string;
  title?: string;
  destinationId?: string;
}

export interface ParadaNova {
  title: string;
  sortOrder: number;
  startTime?: string;
  durationMinutes?: number;
}

export interface DeslocamentoNovo {
  fromStopId?: string;
  toStopId?: string;
  transportType: string;
  durationSeconds?: number;
}

export type FalhaRoteiro = 'ausente' | 'semEdicao' | 'dia' | 'parada' | 'destino' | 'longa' | 'roteiro';

export interface PedidoDeGeracao {
  interests?: string[];
  pace?: string;
}

export interface GeracaoLida {
  jobId: string;
  status: 'completed';
  itineraryId: string;
}

export interface RoteiroRepositorio {
  ler(userId: string, viagemId: string): Promise<RoteiroLido | 'ausente'>;
  criarDia(userId: string, viagemId: string, dia: DiaNovo): Promise<RoteiroLido | FalhaRoteiro>;
  criarParada(userId: string, viagemId: string, diaId: string, parada: ParadaNova): Promise<RoteiroLido | FalhaRoteiro>;
  criarDeslocamento(userId: string, viagemId: string, diaId: string, deslocamento: DeslocamentoNovo): Promise<RoteiroLido | FalhaRoteiro>;
  marcarFeito(userId: string, viagemId: string, paradaId: string, feito: boolean): Promise<RoteiroLido | FalhaRoteiro>;
  gerar(userId: string, viagemId: string, pedido: PedidoDeGeracao, chave?: string | null): Promise<GeracaoLida | FalhaRoteiro>;
  otimizar(userId: string, viagemId: string): Promise<RoteiroLido | FalhaRoteiro>;
}
