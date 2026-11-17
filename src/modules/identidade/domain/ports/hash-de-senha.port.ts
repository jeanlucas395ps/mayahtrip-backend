/**
 * `di-use-interfaces-tokens` (nestjs-best-practices): interface + token de
 * injeção, para a implementação real (Argon2id) poder ser trocada por um
 * mock em teste sem I/O. ADR `0001-identidade-tokens-persistencia.md`.
 */
export const HASH_DE_SENHA = Symbol('HASH_DE_SENHA');

export interface HashDeSenha {
  gerar(senhaPlana: string): Promise<string>;
}
