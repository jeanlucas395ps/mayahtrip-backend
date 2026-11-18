export const CATALOGO = Symbol('CATALOGO');

export type IdiomaCatalogo = 'pt-BR' | 'pt-PT' | 'en' | 'es';

export interface CategoriaLida {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
}

export interface ResumoLido {
  averageRating: number | null;
  totalReviews: number;
}

export interface DicaLida {
  id: string;
  userId: string;
  username: string | null;
  displayName: string | null;
  content: string;
}

export interface LugarBuscado {
  id: string;
  slug: string;
  name: string;
  cityId: string | null;
  cityName: string | null;
  categories: CategoriaLida[];
  averageRating: number | null;
  totalReviews: number;
}

export interface EnderecoLido {
  id: string;
  line1: string | null;
  neighborhood: string | null;
  postalCode: string | null;
  cityId: string | null;
}

export interface HorarioLido {
  id: string;
  weekday: number;
  openingTime: string | null;
  closingTime: string | null;
  isClosed: boolean;
}

export interface PrecoLido {
  id: string;
  currency: string | null;
  priceLevel: number | null;
  minimumPrice: number | null;
  maximumPrice: number | null;
}

export interface VisitaLida {
  id: string;
  recommendedDurationMinutes: number | null;
  bestTimeToVisit: string | null;
  accessibilityInformation: string | null;
}

export interface MidiaLida {
  id: string;
  mediaType: string;
  attribution: string | null;
  sortOrder: number | null;
}

export interface ReferenciaLida {
  id: string;
  provider: string;
  externalId: string;
  externalUrl: string | null;
  providerMetadata: Record<string, unknown> | null;
  lastSyncedAt: string | null;
}

export interface LugarLido extends LugarBuscado {
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  websiteUrl: string | null;
  phone: string | null;
  addresses: EnderecoLido[];
  openingHours: HorarioLido[];
  prices: PrecoLido[];
  visitInformation: VisitaLida[];
  media: MidiaLida[];
  externalReferences: ReferenciaLida[];
  communityTips: DicaLida[];
}

export interface CatalogoRepositorio {
  buscar(texto: string, idioma: IdiomaCatalogo): Promise<LugarBuscado[]>;
  lugar(id: string, idioma: IdiomaCatalogo): Promise<LugarLido | null>;
  chaveDeMidia(lugarId: string, midiaId: string): Promise<string | null>;
}
