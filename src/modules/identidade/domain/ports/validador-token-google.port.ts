export const VALIDADOR_TOKEN_GOOGLE = Symbol('VALIDADOR_TOKEN_GOOGLE');

export interface PerfilGoogle {
  sub: string;
  email: string;
  nome: string;
}

/**
 * ARCHITECTURE.md §3: a API valida o token do Google. O app não chama
 * o provedor.
 */
export interface ValidadorTokenGoogle {
  validar(token: string): Promise<PerfilGoogle | null>;
}
