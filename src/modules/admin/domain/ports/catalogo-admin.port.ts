export const CATALOGO_ADMIN = Symbol('CATALOGO_ADMIN');

export type IdiomaCatalogo = 'pt-BR' | 'pt-PT' | 'en' | 'es';
export type StatusLugar = 'active' | 'archived';

export interface TraducaoEntrada {
  locale: IdiomaCatalogo;
  name: string | null;
  description: string | null;
}

export interface EnderecoEntrada {
  line1: string | null;
  neighborhood: string | null;
  postalCode: string | null;
  cityId: string | null;
}

export interface HorarioEntrada {
  weekday: number;
  openingTime: string | null;
  closingTime: string | null;
  isClosed: boolean;
}

export interface PrecoEntrada {
  currency: string | null;
  priceLevel: number | null;
  minimumPrice: number | null;
  maximumPrice: number | null;
}

export interface VisitaEntrada {
  recommendedDurationMinutes: number | null;
  bestTimeToVisit: string | null;
  accessibilityInformation: string | null;
}

export interface ReferenciaEntrada {
  provider: string;
  externalId: string;
  externalUrl: string | null;
  providerMetadata: Record<string, unknown> | null;
}

export interface SalvarLugar {
  slug: string;
  name: string;
  description: string | null;
  cityId: string | null;
  latitude: number | null;
  longitude: number | null;
  websiteUrl: string | null;
  phone: string | null;
  status: StatusLugar;
  translations: TraducaoEntrada[];
  categoryIds: string[];
  addresses: EnderecoEntrada[];
  openingHours: HorarioEntrada[];
  prices: PrecoEntrada[];
  visitInformation: VisitaEntrada[];
  externalReferences: ReferenciaEntrada[];
}

export interface LugarResumo {
  id: string;
  slug: string;
  name: string;
  status: StatusLugar;
  cityName: string | null;
}

export interface PaginaDeLugares {
  items: LugarResumo[];
  total: number;
  page: number;
  pageSize: number;
}

/** Contexto para montar o path GCS de mídia do lugar. */
export interface CaminhoMidiaDoLugar {
  countryName: string | null;
  cityName: string | null;
  placeSlug: string;
  placeName: string;
}

export interface LugarAdmin extends SalvarLugar {
  id: string;
  averageRating: number | null;
  totalReviews: number;
  media: { id: string; mediaType: string; attribution: string | null; sortOrder: number | null }[];
}

export interface CategoriaAdmin {
  id: string;
  slug: string;
  parentId: string | null;
  translations: { locale: IdiomaCatalogo; name: string }[];
}

export interface SalvarCategoria {
  slug: string;
  parentId: string | null;
  translations: { locale: IdiomaCatalogo; name: string }[];
}

export type FalhaCatalogo = 'ausente' | 'slug' | 'cidade' | 'categoria' | 'referencia' | 'em_uso' | 'mesmo' | 'invalido';

/** Busca read-only de cidades para o seletor do lugar (sem CRUD de geografia). */
export interface CidadeResumoAdmin {
  id: string;
  name: string;
  countryName: string | null;
}

export interface CatalogoAdminRepositorio {
  listar(texto: string, status: StatusLugar | null, page: number, pageSize: number): Promise<PaginaDeLugares>;
  buscarCidades(texto: string): Promise<CidadeResumoAdmin[]>;
  ficha(id: string): Promise<LugarAdmin | null>;
  caminhoMidia(lugarId: string): Promise<CaminhoMidiaDoLugar | null>;
  salvar(id: string | null, entrada: SalvarLugar): Promise<LugarAdmin | FalhaCatalogo>;
  arquivar(id: string): Promise<LugarAdmin | 'ausente'>;
  unificar(destinoId: string, origemId: string): Promise<LugarAdmin | 'ausente' | 'mesmo'>;
  categorias(): Promise<CategoriaAdmin[]>;
  salvarCategoria(id: string | null, entrada: SalvarCategoria): Promise<CategoriaAdmin | FalhaCatalogo>;
  excluirCategoria(id: string): Promise<'ok' | 'ausente' | 'em_uso'>;
  adicionarMidia(lugarId: string, chave: string, tipo: 'photo' | 'video', atribuicao: string | null, ordem: number | null): Promise<{ id: string } | 'ausente'>;
  removerMidia(lugarId: string, midiaId: string): Promise<{ chave: string } | 'ausente'>;
}
