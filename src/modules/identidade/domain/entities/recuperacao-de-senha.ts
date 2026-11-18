import { CodigoVerificacao } from '../value-objects/codigo-verificacao.vo';
import { INTERVALO_REENVIO_MS, TENTATIVAS_CONFIRMACAO } from './conta.entity';

export type ResultadoCodigoSenha = 'aceito' | 'incorreto' | 'bloqueada';

/**
 * Código de `BUSINESS/03`. As regras de tentativa e de reenvio são as
 * do cadastro (`BUSINESS/02`). Aceitar o código não queima a linha:
 * a senha nova é outro passo.
 */
export class RecuperacaoDeSenha {
  private constructor(
    readonly id: string,
    private codigo: CodigoVerificacao,
    private tentativas: number,
  ) {}

  static abrir(id: string, codigo: CodigoVerificacao): RecuperacaoDeSenha {
    return new RecuperacaoDeSenha(id, codigo, 0);
  }

  static reconstituir(id: string, codigo: CodigoVerificacao, tentativas: number): RecuperacaoDeSenha {
    return new RecuperacaoDeSenha(id, codigo, tentativas);
  }

  get codigoVerificacao(): CodigoVerificacao {
    return this.codigo;
  }

  get tentativasCodigo(): number {
    return this.tentativas;
  }

  tentativasRestantes(): number {
    return Math.max(0, TENTATIVAS_CONFIRMACAO - this.tentativas);
  }

  cedoDemais(agora: Date): boolean {
    return agora.getTime() - this.codigo.geradoEm.getTime() < INTERVALO_REENVIO_MS;
  }

  tentar(informado: string, agora: Date): ResultadoCodigoSenha {
    if (this.tentativas >= TENTATIVAS_CONFIRMACAO) {
      return 'bloqueada';
    }

    const aceito = this.codigo.conferir(informado) && !this.codigo.estaExpirado(agora);
    if (!aceito) {
      this.tentativas += 1;
      return 'incorreto';
    }

    return 'aceito';
  }
}
