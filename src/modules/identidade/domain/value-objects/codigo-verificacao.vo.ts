import { randomInt } from 'node:crypto';

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

  estaExpirado(agora: Date): boolean {
    const expiraEm = this.geradoEm.getTime() + this.validoPorMinutos * 60_000;
    return agora.getTime() >= expiraEm;
  }

  toString(): string {
    return '[código oculto]';
  }

  toJSON(): string {
    return this.toString();
  }
}
