export const VIAGENS_ADMIN = Symbol('VIAGENS_ADMIN');

export interface FiltroDeViagem {
  q?: string;
  owner?: string;
  destination?: string;
  status?: string;
  startMode?: string;
  from?: string;
  to?: string;
  active?: string;
  visibility?: string;
}

export interface ParticipanteAdmin {
  displayName: string;
  partyKind: string;
  role: string | null;
}

export interface ViagemAdmin {
  id: string;
  title: string;
  ownerName: string;
  ownerEmail: string;
  destinations: string[];
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  status: string;
  startMode: string;
  isActive: boolean;
  visibility: string;
  participants: ParticipanteAdmin[];
}

export interface ViagensAdminRepositorio {
  listar(filtro: FiltroDeViagem): Promise<ViagemAdmin[] | 'filtro'>;
  ficha(id: string): Promise<ViagemAdmin | null>;
  ativar(id: string, ativa: boolean): Promise<'ok' | 'ausente'>;
  visibilidade(id: string, visibility: 'private' | 'public'): Promise<'ok' | 'ausente'>;
  excluir(id: string): Promise<'ok' | 'ausente'>;
}
