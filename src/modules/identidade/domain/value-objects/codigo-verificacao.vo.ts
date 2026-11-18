import { createHash, randomInt } from 'node:crypto';

/**
 * BUSINESS/02-cadastro-e-verificacao.md: código de 4 dígitos, válido por
 * 10 minutos. `estaExpirado` é checado tanto aqui quanto, depois, pelo
 * caso de uso de confirmação (spec `043-confirm-account-api`).
 */
export class CodigoVerificacao {
  private constructor(
    readonly valor: string,
    readonly geradoEm: Date,
    private readonly validoPorMinutos: number,
  ) {}

  static gerar(agora: Date, validoPorMinutos: number): CodigoVerificacao {
    const digitos = randomInt(0, 10_000).toString().padStart(4, '0');
    return new CodigoVerificacao(digitos, agora, validoPorMinutos);
  }

  /** Reconstrói o código gravado, sem gerar outro. */
  static reconstituir(valor: string, geradoEm: Date, validoPorMinutos: number): CodigoVerificacao {
    return new CodigoVerificacao(valor, geradoEm, validoPorMinutos);
  }

  /** Aceita o código em claro ou o sha256 gravado em identity.user_verification_codes. */
  conferir(informado: string): boolean {
    return this.valor === informado || this.valor === hashDeCodigo(informado);
  }

  expiraEm(): Date {
    return new Date(this.geradoEm.getTime() + this.validoPorMinutos * 60_000);
  }

  estaExpirado(agora: Date): boolean {
    return agora.getTime() >= this.expiraEm().getTime();
  }

  toString(): string {
    return '[código oculto]';
  }

  toJSON(): string {
    return this.toString();
  }
}

export function hashDeCodigo(codigo: string): string {
  return createHash('sha256').update(codigo).digest('hex');
}
