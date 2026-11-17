import { Email } from '../value-objects/email.vo';
import { CodigoVerificacao } from '../value-objects/codigo-verificacao.vo';

export type EstadoConta = 'pendente' | 'confirmada';
export type OrigemConta = 'senha' | 'google';

/** BUSINESS/02: cinco erros seguidos bloqueiam até o reenvio. */
export const TENTATIVAS_CONFIRMACAO = 5;

/** BUSINESS/02: reenvio só depois de 30 segundos da última geração. */
export const INTERVALO_REENVIO_MS = 30_000;

export type ResultadoConfirmacao = 'confirmada' | 'incorreto' | 'bloqueada';
export type ResultadoReenvio = 'reenviado' | 'cedo';

interface CriarPendenteParams {
  id: string;
  nome: string;
  email: Email;
  hashSenha: string;
  codigoVerificacao: CodigoVerificacao;
  criadaEm: Date;
}

interface CriarPorGoogleParams {
  id: string;
  nome: string;
  email: Email;
  googleSub: string;
  criadaEm: Date;
}

interface ReconstituirParams {
  id: string;
  nome: string;
  email: Email;
  hashSenha: string | null;
  codigoVerificacao: CodigoVerificacao | null;
  estado: EstadoConta;
  criadaEm: Date;
  tentativasCodigo: number;
  googleSub: string | null;
  origem: OrigemConta;
}

/**
 * Aggregate root do módulo identidade.
 * Confirmar, reenviar e entrar estão nas specs 043 e 044.
 */
export class Conta {
  private constructor(
    readonly id: string,
    private nomeInterno: string,
    private emailInterno: Email,
    private hashSenha: string | null,
    private codigo: CodigoVerificacao | null,
    private estadoInterno: EstadoConta,
    readonly criadaEm: Date,
    private tentativas: number,
    private googleSubInterno: string | null,
    readonly origem: OrigemConta,
  ) {}

  get nome(): string {
    return this.nomeInterno;
  }

  get email(): Email {
    return this.emailInterno;
  }

  get estado(): EstadoConta {
    return this.estadoInterno;
  }

  get codigoVerificacao(): CodigoVerificacao | null {
    return this.codigo;
  }

  get tentativasCodigo(): number {
    return this.tentativas;
  }

  get googleSub(): string | null {
    return this.googleSubInterno;
  }

  get temSenha(): boolean {
    return this.hashSenha !== null && this.hashSenha.startsWith('$argon2');
  }

  static criarPendente(params: CriarPendenteParams): Conta {
    return new Conta(
      params.id,
      params.nome,
      params.email,
      params.hashSenha,
      params.codigoVerificacao,
      'pendente',
      params.criadaEm,
      0,
      null,
      'senha',
    );
  }

  /** WEB/02: conta que só entrou com Google nasce confirmada e sem senha. */
  static criarPorGoogle(params: CriarPorGoogleParams): Conta {
    return new Conta(
      params.id,
      params.nome,
      params.email,
      null,
      null,
      'confirmada',
      params.criadaEm,
      0,
      params.googleSub,
      'google',
    );
  }

  static reconstituir(params: ReconstituirParams): Conta {
    return new Conta(
      params.id,
      params.nome,
      params.email,
      params.hashSenha,
      params.codigoVerificacao,
      params.estado,
      params.criadaEm,
      params.tentativasCodigo,
      params.googleSub,
      params.origem,
    );
  }

  /** Liga um Google ID a uma conta que já existia pelo e-mail. */
  vincularGoogle(googleSub: string): void {
    if (!this.googleSubInterno) {
      this.googleSubInterno = googleSub;
    }
  }

  /**
   * 043: a 6ª tentativa não olha o código. Código expirado conta como
   * errado. O acerto na 5ª tentativa ainda confirma.
   */
  tentarConfirmar(codigoInformado: string, agora: Date): ResultadoConfirmacao {
    if (this.estadoInterno !== 'pendente') {
      return 'bloqueada';
    }

    if (this.tentativas >= TENTATIVAS_CONFIRMACAO) {
      return 'bloqueada';
    }

    const codigo = this.codigo;
    const aceito = codigo !== null && codigo.valor === codigoInformado && !codigo.estaExpirado(agora);

    if (!aceito) {
      this.tentativas += 1;
      return 'incorreto';
    }

    this.estadoInterno = 'confirmada';
    return 'confirmada';
  }

  tentativasRestantes(): number {
    return Math.max(0, TENTATIVAS_CONFIRMACAO - this.tentativas);
  }

  tentarReenviar(novoCodigo: CodigoVerificacao, agora: Date): ResultadoReenvio {
    if (this.estadoInterno !== 'pendente' || this.codigo === null) {
      return 'cedo';
    }

    const decorrido = agora.getTime() - this.codigo.geradoEm.getTime();
    if (decorrido < INTERVALO_REENVIO_MS) {
      return 'cedo';
    }

    this.codigo = novoCodigo;
    this.tentativas = 0;
    return 'reenviado';
  }

  /** Só a infraestrutura de persistência lê o hash, para gravar a linha. */
  obterHashSenhaParaPersistencia(): string | null {
    return this.hashSenha;
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      nome: this.nomeInterno,
      email: this.emailInterno.valor,
      estado: this.estadoInterno,
      criadaEm: this.criadaEm,
      origem: this.origem,
    };
  }
}
