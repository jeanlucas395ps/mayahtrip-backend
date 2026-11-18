export const CATALOGO = Symbol('CATALOGO');

export type IdiomaCatalogo = 'pt-BR' | 'pt-PT' | 'en' | 'es';

export interface CategoriaLida {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
}

export interface LugarBuscado {
  id: string;
  slug: string;
  name: string;
  cityId: string | null;
  cityName: string | null;
  categories: CategoriaLida[];
}

export interface LugarLido extends LugarBuscado {
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  websiteUrl: string | null;
  phone: string | null;
}

export interface CatalogoRepositorio {
  buscar(texto: string, idioma: IdiomaCatalogo): Promise<LugarBuscado[]>;
  lugar(id: string, idioma: IdiomaCatalogo): Promise<LugarLido | null>;
}
