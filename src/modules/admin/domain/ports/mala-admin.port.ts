export const MALA_ADMIN = Symbol('MALA_ADMIN');

export interface ItemDaMala {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  sortOrder: number;
}

export interface CategoriaDaMala {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  items: ItemDaMala[];
}

export interface CategoriaDaMalaNova {
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ItemDaMalaNovo {
  name: string;
  description: string | null;
  sortOrder: number;
  isDefault: boolean;
  categoryId: string;
}

export interface MalaAdminRepositorio {
  listar(): Promise<CategoriaDaMala[]>;
  editarCategoria(id: string, categoria: CategoriaDaMalaNova): Promise<CategoriaDaMala[] | 'ausente'>;
  editarItem(id: string, item: ItemDaMalaNovo): Promise<CategoriaDaMala[] | 'ausente' | 'categoria'>;
}
