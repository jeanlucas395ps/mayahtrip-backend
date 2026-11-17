const TAMANHO_MINIMO = 8;

/** BUSINESS/02: "Senha < 8 caracteres → 'A senha precisa ter pelo menos 8 caracteres.'" */
export class SenhaInvalidaError extends Error {
  constructor() {
    super('A senha precisa ter pelo menos 8 caracteres.');
    this.name = 'SenhaInvalidaError';
  }
}

/**
 * Invariante de domínio (defesa em profundidade: o DTO na borda já valida
 * o mesmo mínimo — `DEVELOPMENT.md` §1, "regra de negócio mora no domínio
 * da API"). Nunca serializa o valor real, para não acabar em log por
 * engano (`DEVELOPMENT.md` §9/§11).
 */
export class Senha {
  readonly valor: string;

  constructor(valorPlano: string) {
    if (valorPlano.length < TAMANHO_MINIMO) {
      throw new SenhaInvalidaError();
    }

    this.valor = valorPlano;
  }

  toString(): string {
    return '[senha oculta]';
  }

  toJSON(): string {
    return this.toString();
  }
}
