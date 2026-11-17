import { Conta } from '../entities/conta.entity';
import { Email } from '../value-objects/email.vo';

export const CONTA_REPOSITORIO = Symbol('CONTA_REPOSITORIO');

export interface ContaRepositorio {
  /** AC-6/D-2 (042-sign-up-api): usado para não criar e-mail duplicado. */
  existePorEmail(email: Email): Promise<boolean>;
  salvar(conta: Conta): Promise<Conta>;
}
