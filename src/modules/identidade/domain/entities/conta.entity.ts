import { Email } from '../value-objects/email.vo';
import { CodigoVerificacao } from '../value-objects/codigo-verificacao.vo';

export type EstadoConta = 'pendente' | 'confirmada';

interface CriarPendenteParams {
  id: string;
  nome: string;
  email: Email;
  hashSenha: string;
  codigoVerificacao: CodigoVerificacao;
  criadaEm: Date;
}

/**
 * Aggregate root do módulo identidade. Nesta fatia (sign-up-api) só
 * nasce pendente; confirmar (ativar) é responsabilidade da spec
 * `043-confirm-account-api`, ainda não implementada.
 */
export class Conta {
  private constructor(
    readonly id: string,
    readonly nome: string,
    readonly email: Email,
    private readonly hashSenha: string,
    readonly codigoVerificacao: CodigoVerificacao,
    readonly estado: EstadoConta,
    readonly criadaEm: Date,
  ) {}

  static criarPendente(params: CriarPendenteParams): Conta {
    return new Conta(
      params.id,
      params.nome,
      params.email,
      params.hashSenha,
      params.codigoVerificacao,
      'pendente',
      params.criadaEm,
    );
  }

  /** Só a infraestrutura de persistência lê o hash, para gravar a linha. */
  obterHashSenhaParaPersistencia(): string {
    return this.hashSenha;
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      nome: this.nome,
      email: this.email.valor,
      estado: this.estado,
      criadaEm: this.criadaEm,
    };
  }
}
