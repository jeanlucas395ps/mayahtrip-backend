export const VIAGEM = Symbol('VIAGEM');

export type ModoDeComeco = 'suggested' | 'community' | 'from_scratch';
export type StatusDoCartao = 'draft' | 'upcoming' | 'happening' | 'finished';
export type FiltroDaCarteira = 'todas' | 'proximas' | 'rascunhos';
export type FalhaViagem = 'ausente' | 'cidade' | 'destino' | 'data' | 'dias' | 'modo' | 'moeda' | 'orcamento' | 'nome' | 'config' | 'capa';

export interface DestinoNovo {
  cityId: string | null;
  customName: string | null;
}

export interface CriarViagem {
  ownerId: string;
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  startMode: ModoDeComeco;
  adultCount: number;
  childCount: number;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  destinations: DestinoNovo[];
}

export interface DestinoLido {
  id: string;
  cityId: string | null;
  cityName: string | null;
  customName: string | null;
  name: string;
  arrivalDate: string | null;
  departureDate: string | null;
  sortOrder: number;
}

export interface ViagemLida {
  id: string;
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  dayCount: number;
  status: StatusDoCartao;
  daysUntil: number | null;
  visibility: 'private' | 'public';
  startMode: ModoDeComeco;
  adultCount: number;
  childCount: number;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  hasCover: boolean;
  destinationCount: number;
  destinations: DestinoLido[];
}

export interface Carteira {
  counts: { all: number; upcoming: number; drafts: number };
  trips: ViagemLida[];
}

export interface ViagemRepositorio {
  hoje(): Promise<string>;
  teto(chave: string): Promise<number | null>;
  nomesDasCidades(ids: string[]): Promise<Map<string, string> | null>;
  moedaAtiva(codigo: string): Promise<boolean>;
  criar(entrada: CriarViagem): Promise<string>;
  carteira(donoId: string, filtro: FiltroDaCarteira): Promise<Carteira>;
  ficha(donoId: string, viagemId: string): Promise<ViagemLida | null>;
  guardarCapa(donoId: string, viagemId: string, chave: string): Promise<string | null | 'ausente'>;
  chaveDaCapa(donoId: string, viagemId: string): Promise<string | null | 'ausente'>;
}
