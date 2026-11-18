export const COMPRAS = Symbol('COMPRAS');

export interface ItemDeCompra {
  id: string;
  name: string;
  quantity: number;
  estimatedPrice: number | null;
  currency: string | null;
  storeName: string | null;
  url: string | null;
  isPurchased: boolean;
  expenseId: string | null;
}

export interface ListaDeCompras {
  items: ItemDeCompra[];
}

export interface CompraNova {
  name: string;
  quantity: number;
  estimatedPrice: number | null;
  storeName: string | null;
  url: string | null;
  isPurchased: boolean;
}

export type FalhaCompra = 'ausente' | 'proibido' | 'sumido' | 'ligado';

export interface ComprasRepositorio {
  listar(userId: string, viagemId: string): Promise<ListaDeCompras | FalhaCompra>;
  criar(userId: string, viagemId: string, item: CompraNova): Promise<ListaDeCompras | FalhaCompra>;
  editar(userId: string, viagemId: string, itemId: string, item: CompraNova): Promise<ListaDeCompras | FalhaCompra>;
  remover(userId: string, viagemId: string, itemId: string): Promise<ListaDeCompras | FalhaCompra>;
  vincularGasto(userId: string, viagemId: string, itemId: string): Promise<ListaDeCompras | FalhaCompra>;
}
