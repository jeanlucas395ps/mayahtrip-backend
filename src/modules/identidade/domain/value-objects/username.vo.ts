/**
 * Handle público (@menção). Único sem distinguir maiúscula.
 * Letras, números e # . _ - $ & — sem espaços. 1–80. O @ inicial é removido.
 */
export const USERNAME_MAX = 80;

/** Classe de caracteres permitidos (hífen no fim do grupo). */
export const USERNAME_REGEX = /^[\p{L}\p{N}#._$&-]+$/u;

export class UsernameInvalidoError extends Error {
  constructor() {
    super('username inválido');
    this.name = 'UsernameInvalidoError';
  }
}

export class Username {
  readonly valor: string;

  constructor(bruto: string) {
    const semArroba = bruto.trim().replace(/^@+/, '');
    if (
      semArroba.length === 0 ||
      semArroba.length > USERNAME_MAX ||
      /\s/.test(semArroba) ||
      !USERNAME_REGEX.test(semArroba)
    ) {
      throw new UsernameInvalidoError();
    }
    this.valor = semArroba;
  }

  toString(): string {
    return this.valor;
  }
}
