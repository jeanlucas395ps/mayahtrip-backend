export const VIAGEM = Symbol('VIAGEM');

export type ModoDeComeco = 'suggested' | 'community' | 'from_scratch';
export type StatusDoCartao = 'draft' | 'upcoming' | 'happening' | 'finished';
export type FiltroDaCarteira = 'todas' | 'proximas' | 'rascunhos';
export type FalhaViagem =
  | 'ausente'
  | 'cidade'
  | 'destino'
  | 'data'
  | 'dias'
  | 'modo'
  | 'moeda'
  | 'orcamento'
  | 'nome'
  | 'duplicado'
  | 'config'
  | 'capa'
  | 'proibido'
  | 'email'
  | 'pessoa'
  | 'semConvite'
  | 'convite'
  | 'alheio'
  | 'usado'
  | 'papel'
  | 'posse'
  | 'saida'
  | 'remover'
  | 'sumido'
  | 'entrada'
  | 'crianca'
  | 'privada'
  | 'publicar';
export type Papel = 'owner' | 'supreme_traveler' | 'experienced_traveler' | 'junior_assistant';
export type PapelDoConvite = Exclude<Papel, 'owner'>;
export type IdiomaDoConvite = 'pt-BR' | 'pt-PT' | 'en' | 'es';

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
  invites: ConviteNovo[];
}

export interface ConviteNovo {
  email: string;
  role: PapelDoConvite;
}

export interface ConviteParaEnviar {
  email: string;
  token: string;
  idioma: IdiomaDoConvite;
  nomeDeQuemConvida: string;
  titulo: string;
}

export interface ConviteAberto {
  tripId: string;
  tripTitle: string;
  role: PapelDoConvite;
  status: 'pending';
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

export interface ParticipanteLido {
  id: string;
  userId: string | null;
  displayName: string;
  partyKind: 'adult' | 'child';
  role: Papel | null;
  joined: boolean;
}

export interface VisaoDaViagem {
  itinerary: true;
  edit: boolean;
  expenses: boolean;
  documents: boolean;
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
  participants: ParticipanteLido[];
  view: VisaoDaViagem;
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
  criar(entrada: CriarViagem): Promise<{ id: string; convites: ConviteParaEnviar[] } | 'pessoa' | 'duplicado'>;
  convidar(userId: string, viagemId: string, convites: ConviteNovo[]): Promise<ConviteParaEnviar[] | 'ausente' | 'semConvite' | 'pessoa' | 'duplicado'>;
  abrirConvite(userId: string, token: string): Promise<ConviteAberto | 'convite' | 'alheio' | 'usado'>;
  aceitarConvite(userId: string, token: string): Promise<{ tripId: string } | 'convite' | 'alheio' | 'usado' | 'pessoa'>;
  recusarConvite(userId: string, token: string): Promise<'ok' | 'convite' | 'alheio' | 'usado'>;
  alterarPapel(userId: string, viagemId: string, participanteId: string, papel: PapelDoConvite): Promise<'ok' | 'ausente' | 'papel' | 'crianca' | 'sumido'>;
  remover(userId: string, viagemId: string, participanteId: string): Promise<'ok' | 'ausente' | 'remover' | 'saida' | 'sumido'>;
  sair(userId: string, viagemId: string): Promise<'ok' | 'ausente' | 'saida'>;
  passarPosse(userId: string, viagemId: string, participanteId: string): Promise<'ok' | 'ausente' | 'posse' | 'entrada' | 'sumido'>;
  publicar(userId: string, viagemId: string, visibility: 'private' | 'public'): Promise<'ok' | 'ausente' | 'publicar'>;
  clonar(userId: string, viagemId: string): Promise<string | 'ausente' | 'privada'>;
  carteira(donoId: string, filtro: FiltroDaCarteira): Promise<Carteira>;
  ficha(donoId: string, viagemId: string): Promise<ViagemLida | null>;
  guardarCapa(donoId: string, viagemId: string, chave: string): Promise<string | null | 'ausente' | 'proibido'>;
  chaveDaCapa(donoId: string, viagemId: string): Promise<string | null | 'ausente'>;
  renomear(userId: string, viagemId: string, participanteId: string, nome: string): Promise<'ok' | 'ausente' | 'proibido' | 'duplicado'>;
}
