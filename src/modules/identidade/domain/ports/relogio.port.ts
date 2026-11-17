export const RELOGIO = Symbol('RELOGIO');

/** Única porta de tempo do módulo — nenhum `new Date()` disperso. */
export interface Relogio {
  agora(): Date;
}
