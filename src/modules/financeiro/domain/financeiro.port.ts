export const FINANCEIRO = Symbol('FINANCEIRO');
export const CAMBIO = Symbol('CAMBIO');

export interface Cambio {
  taxa(base: string, alvo: string, data: string): Promise<number | null>;
}

export interface TaxaLida {
  base: string;
  target: string;
  rate: number;
  date: string;
}

export interface MoedaLida {
  code: string;
  name: string;
  symbol: string | null;
  decimalPlaces: number;
  display: boolean;
}

export interface CategoriaLida {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  sortOrder: number;
}

export interface FinanceiroRepositorio {
  moedas(exibicao: boolean): Promise<MoedaLida[]>;
  categorias(): Promise<CategoriaLida[]>;
  taxa(base: string, alvo: string, data: string): Promise<TaxaLida | 'moeda' | 'ausente' | 'cambio'>;
}
