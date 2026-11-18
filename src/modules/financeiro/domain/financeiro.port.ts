export const FINANCEIRO = Symbol('FINANCEIRO');

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
}
