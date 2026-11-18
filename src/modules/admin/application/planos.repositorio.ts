export interface FeatureDePlano {
  key: string;
  value: string;
}

export interface PrecoDePlano {
  currency: string;
  billingPeriod: 'free' | 'monthly' | 'yearly';
  amount: number;
  durationDays: number | null;
  isActive: boolean;
}

export interface PlanoGravado {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isFree: boolean;
  isActive: boolean;
  temPrecoAtivo: boolean;
  preco: PrecoDePlano | null;
  features: FeatureDePlano[];
}

export interface NovoPlano {
  code: string;
  name: string;
  description: string | null;
  isFree: boolean;
  isActive: boolean;
  currency: string | null;
  billingPeriod: PrecoDePlano['billingPeriod'] | null;
  amount: number | null;
  durationDays: number | null;
  features: FeatureDePlano[];
}

export interface PlanosRepositorio {
  listar(): Promise<PlanoGravado[]>;
  porId(id: string): Promise<PlanoGravado | null>;
  porCodigo(code: string): Promise<PlanoGravado | null>;
  criar(entrada: NovoPlano): Promise<PlanoGravado>;
  editar(id: string, entrada: Omit<NovoPlano, 'isActive'>): Promise<PlanoGravado>;
  definirAtivo(id: string, ativo: boolean): Promise<void>;
}

export const PLANOS = Symbol('PLANOS');
