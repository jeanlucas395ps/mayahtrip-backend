/**
 * Formato de e-mail é validado na borda (DTO, `@IsEmail`). Este VO só
 * normaliza e deriva o `@usuário` inicial — a regra de unicidade desse
 * usuário é `A DEFINIR` (`BUSINESS/02-cadastro-e-verificacao.md`), por
 * isso não é resolvida aqui.
 */
export class Email {
  readonly valor: string;

  constructor(valorBruto: string) {
    this.valor = valorBruto.trim().toLowerCase();
  }

  usuarioSugerido(): string {
    return this.valor.split('@')[0];
  }

  igual(outro: Email): boolean {
    return this.valor === outro.valor;
  }

  toString(): string {
    return this.valor;
  }
}
