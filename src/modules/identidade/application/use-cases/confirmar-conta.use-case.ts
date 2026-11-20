import { Inject, Injectable } from '@nestjs/common';
import { Conta, TENTATIVAS_CONFIRMACAO } from '../../domain/entities/conta.entity';
import { CONTA_REPOSITORIO, ContaRepositorio } from '../../domain/ports/conta-repositorio.port';
import { REMETENTE_DE_EMAIL, RemetenteDeEmail } from '../../domain/ports/remetente-de-email.port';
import { RELOGIO, Relogio } from '../../domain/ports/relogio.port';
import { CodigoVerificacao } from '../../domain/value-objects/codigo-verificacao.vo';
import { Email } from '../../domain/value-objects/email.vo';
import { Idioma } from '../../domain/value-objects/idioma.vo';
import { CODIGO_TTL_MINUTOS } from './criar-conta.use-case';

export type ResultadoConfirmarConta =
  | { tipo: 'confirmada' }
  | { tipo: 'incorreto'; tentativasRestantes: number }
  | { tipo: 'bloqueada' };

@Injectable()
export class ConfirmarContaUseCase {
  constructor(
    @Inject(CONTA_REPOSITORIO) private readonly repositorio: ContaRepositorio,
    @Inject(RELOGIO) private readonly relogio: Relogio,
  ) {}

  async executar(emailTexto: string, codigo: string): Promise<ResultadoConfirmarConta> {
    const conta = await this.repositorio.buscarPorEmail(new Email(emailTexto));
    if (!conta || conta.estado !== 'pendente') {
      return { tipo: 'incorreto', tentativasRestantes: TENTATIVAS_CONFIRMACAO - 1 };
    }

    const resultado = conta.tentarConfirmar(codigo, this.relogio.agora());
    if (resultado === 'bloqueada') {
      return { tipo: 'bloqueada' };
    }

    await this.repositorio.salvar(conta);

    if (resultado === 'confirmada') {
      return { tipo: 'confirmada' };
    }

    return { tipo: 'incorreto', tentativasRestantes: conta.tentativasRestantes() };
  }
}

export type ResultadoReenviarCodigo = { tipo: 'enviado'; codigoDev?: string } | { tipo: 'cedo' };

@Injectable()
export class ReenviarCodigoUseCase {
  constructor(
    @Inject(CONTA_REPOSITORIO) private readonly repositorio: ContaRepositorio,
    @Inject(REMETENTE_DE_EMAIL) private readonly remetente: RemetenteDeEmail,
    @Inject(RELOGIO) private readonly relogio: Relogio,
    @Inject(CODIGO_TTL_MINUTOS) private readonly codigoTtlMinutos: number,
  ) {}

  async executar(emailTexto: string, idiomaTexto: string): Promise<ResultadoReenviarCodigo> {
    const idioma = new Idioma(idiomaTexto);
    const conta = await this.repositorio.buscarPorEmail(new Email(emailTexto));
    if (!conta || conta.estado !== 'pendente') {
      return { tipo: 'enviado' };
    }

    const agora = this.relogio.agora();
    const novoCodigo = CodigoVerificacao.gerar(agora, this.codigoTtlMinutos);
    const resultado = conta.tentarReenviar(novoCodigo, agora);
    if (resultado === 'cedo') {
      return { tipo: 'cedo' };
    }

    await this.repositorio.salvar(conta);
    const envio = await this.remetente.enviarCodigoDeVerificacao({
      paraEmail: conta.email.valor,
      nome: conta.nome,
      codigo: novoCodigo.valor,
      idioma,
    });

    return { tipo: 'enviado', codigoDev: envio.codigoDev };
  }
}

export function contaPendente(conta: Conta | null): conta is Conta {
  return conta !== null && conta.estado === 'pendente';
}
