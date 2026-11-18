export const MALA = Symbol('MALA');

export interface ItemDaMalaDaViagem {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  quantity: number;
  isPacked: boolean;
  notes: string | null;
}

export interface VistanteDaMala {
  participantId: string;
  displayName: string;
}

export interface MalaDaPessoa {
  participantId: string;
  displayName: string;
  mine: boolean;
  canEdit: boolean;
  viewers: VistanteDaMala[];
  items: ItemDaMalaDaViagem[];
}

export interface MalasLidas {
  bags: MalaDaPessoa[];
}

export interface ItemMalaNovo {
  name: string;
  quantity: number;
  notes: string | null;
}

export interface ItemMalaEditado {
  name: string;
  quantity: number;
  notes: string | null;
  isPacked: boolean;
}

export type FalhaMala = 'ausente' | 'proibido' | 'sumido' | 'pessoa' | 'categoria';

export interface MalaRepositorio {
  listar(userId: string, viagemId: string): Promise<MalasLidas | 'ausente'>;
  adicionar(userId: string, viagemId: string, participanteId: string, item: ItemMalaNovo): Promise<MalasLidas | FalhaMala>;
  editar(userId: string, viagemId: string, itemId: string, item: ItemMalaEditado): Promise<MalasLidas | FalhaMala>;
  remover(userId: string, viagemId: string, itemId: string): Promise<MalasLidas | FalhaMala>;
  esvaziar(userId: string, viagemId: string, participanteId: string): Promise<MalasLidas | FalhaMala>;
  definirVistantes(userId: string, viagemId: string, participanteId: string, vistantes: string[]): Promise<MalasLidas | FalhaMala>;
}
