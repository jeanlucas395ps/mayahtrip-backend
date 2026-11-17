export const LISTA_DE_REVOGACAO = Symbol('LISTA_DE_REVOGACAO');

/**
 * ADR 0001: Redis guarda só o jti revogado, com TTL até a expiração
 * natural do access token. Não é cache de sessão.
 */
export interface ListaDeRevogacao {
  revogar(jti: string, ttlSegundos: number): Promise<void>;
  estaRevogado(jti: string): Promise<boolean>;
}
