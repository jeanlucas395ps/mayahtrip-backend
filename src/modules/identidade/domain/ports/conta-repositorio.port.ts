import { Conta } from '../entities/conta.entity';
import { Email } from '../value-objects/email.vo';

export const CONTA_REPOSITORIO = Symbol('CONTA_REPOSITORIO');

export interface ContaRepositorio {
  /** AC-6/D-2 (042-sign-up-api): usado para não criar e-mail duplicado. */
  existePorEmail(email: Email): Promise<boolean>;
  buscarPorEmail(email: Email): Promise<Conta | null>;
  buscarPorGoogleSub(googleSub: string): Promise<Conta | null>;
  salvar(conta: Conta): Promise<Conta>;
}
