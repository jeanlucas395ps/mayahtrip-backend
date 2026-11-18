import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { TENTATIVAS_CONFIRMACAO } from '../../domain/entities/conta.entity';
import { RecuperacaoDeSenha } from '../../domain/entities/recuperacao-de-senha';
import { CONTA_REPOSITORIO, ContaRepositorio } from '../../domain/ports/conta-repositorio.port';
import { HASH_DE_SENHA, HashDeSenha } from '../../domain/ports/hash-de-senha.port';
import {
  RECUPERACAO_DE_SENHA_REPOSITORIO,
  RecuperacaoDeSenhaRepositorio,
} from '../../domain/ports/recuperacao-de-senha-repositorio.port';
import { REMETENTE_DE_EMAIL, RemetenteDeEmail } from '../../domain/ports/remetente-de-email.port';
import { RELOGIO, Relogio } from '../../domain/ports/relogio.port';
import { CodigoVerificacao } from '../../domain/value-objects/codigo-verificacao.vo';
import { Email } from '../../domain/value-objects/email.vo';
import { Idioma } from '../../domain/value-objects/idioma.vo';
import { Senha, SenhaInvalidaError } from '../../domain/value-objects/senha.vo';
import { SessaoDeAcesso } from '../sessao-de-acesso';
import { CODIGO_TTL_MINUTOS } from './criar-conta.use-case';

export type ResultadoPedidoSenha = { tipo: 'enviado' } | { tipo: 'cedo' };

export type ResultadoCodigoSenha =
  | { tipo: 'aceito' }
  | { tipo: 'incorreto'; tentativasRestantes: number }
  | { tipo: 'bloqueada' };

export type ResultadoRedefinirSenha = ResultadoCodigoSenha | { tipo: 'alterada' } | { tipo: 'senha_curta' };

@Injectable()
export class PedirCodigoDeSenhaUseCase {
  constructor(
    @Inject(CONTA_REPOSITORIO) private readonly contas: ContaRepositorio,
    @Inject(RECUPERACAO_DE_SENHA_REPOSITORIO) private readonly codigos: RecuperacaoDeSenhaRepositorio,
    @Inject(REMETENTE_DE_EMAIL) private readonly remetente: RemetenteDeEmail,
    @Inject(RELOGIO) private readonly relogio: Relogio,
    @Inject(CODIGO_TTL_MINUTOS) private readonly codigoTtlMinutos: number,
  ) {}

  executar(emailTexto: string, idiomaTexto: string): Promise<ResultadoPedidoSenha> {
    return emitir(this.dependencias(), emailTexto, idiomaTexto, false);
  }

  reenviar(emailTexto: string, idiomaTexto: string): Promise<ResultadoPedidoSenha> {
    return emitir(this.dependencias(), emailTexto, idiomaTexto, true);
  }

  private dependencias(): DependenciasDoPedido {
    return {
      contas: this.contas,
      codigos: this.codigos,
      remetente: this.remetente,
      relogio: this.relogio,
      codigoTtlMinutos: this.codigoTtlMinutos,
    };
  }
}

interface DependenciasDoPedido {
  contas: ContaRepositorio;
  codigos: RecuperacaoDeSenhaRepositorio;
  remetente: RemetenteDeEmail;
  relogio: Relogio;
  codigoTtlMinutos: number;
}

async function emitir(
  deps: DependenciasDoPedido,
  emailTexto: string,
  idiomaTexto: string,
  recusarCedo: boolean,
): Promise<ResultadoPedidoSenha> {
  const conta = await deps.contas.buscarPorEmail(new Email(emailTexto));
  if (!conta || conta.estado !== 'confirmada') {
    return { tipo: 'enviado' };
  }

  const agora = deps.relogio.agora();
  const aberta = await deps.codigos.buscarAberta(conta.id);
  if (aberta?.cedoDemais(agora)) {
    return recusarCedo ? { tipo: 'cedo' } : { tipo: 'enviado' };
  }

  const codigo = CodigoVerificacao.gerar(agora, deps.codigoTtlMinutos);
  const recuperacao = RecuperacaoDeSenha.abrir(randomUUID(), codigo);
  await deps.codigos.abrir(conta.id, recuperacao);
  await deps.remetente.enviarCodigoDeVerificacao({
    paraEmail: conta.email.valor,
    nome: conta.nome,
    codigo: codigo.valor,
    idioma: new Idioma(idiomaTexto),
  });
  return { tipo: 'enviado' };
}

@Injectable()
export class ConferirCodigoDeSenhaUseCase {
  constructor(
    @Inject(CONTA_REPOSITORIO) private readonly contas: ContaRepositorio,
    @Inject(RECUPERACAO_DE_SENHA_REPOSITORIO) private readonly codigos: RecuperacaoDeSenhaRepositorio,
    @Inject(RELOGIO) private readonly relogio: Relogio,
  ) {}

  async executar(emailTexto: string, codigo: string): Promise<ResultadoCodigoSenha> {
    const avaliado = await avaliar(this.contas, this.codigos, this.relogio, emailTexto, codigo);
    if (avaliado.tipo === 'aceito') return { tipo: 'aceito' };
    return avaliado;
  }
}

@Injectable()
export class RedefinirSenhaUseCase {
  constructor(
    @Inject(CONTA_REPOSITORIO) private readonly contas: ContaRepositorio,
    @Inject(RECUPERACAO_DE_SENHA_REPOSITORIO) private readonly codigos: RecuperacaoDeSenhaRepositorio,
    @Inject(HASH_DE_SENHA) private readonly hashDeSenha: HashDeSenha,
    @Inject(RELOGIO) private readonly relogio: Relogio,
    @Inject(SessaoDeAcesso) private readonly sessao: SessaoDeAcesso,
  ) {}

  async executar(emailTexto: string, codigo: string, senhaPlana: string): Promise<ResultadoRedefinirSenha> {
    try {
      new Senha(senhaPlana);
    } catch (erro) {
      if (erro instanceof SenhaInvalidaError) return { tipo: 'senha_curta' };
      throw erro;
    }

    const avaliado = await avaliar(this.contas, this.codigos, this.relogio, emailTexto, codigo);
    if (avaliado.tipo !== 'aceito') return avaliado;

    const hash = await this.hashDeSenha.gerar(senhaPlana);
    const gravou = await this.codigos.concluir(avaliado.contaId, avaliado.recuperacao, hash, this.relogio.agora());
    if (!gravou) {
      return { tipo: 'incorreto', tentativasRestantes: TENTATIVAS_CONFIRMACAO - 1 };
    }

    await this.sessao.encerrarTodas(avaliado.contaId);
    return { tipo: 'alterada' };
  }
}

type Avaliacao =
  | { tipo: 'aceito'; contaId: string; recuperacao: RecuperacaoDeSenha }
  | { tipo: 'incorreto'; tentativasRestantes: number }
  | { tipo: 'bloqueada' };

async function avaliar(
  contas: ContaRepositorio,
  codigos: RecuperacaoDeSenhaRepositorio,
  relogio: Relogio,
  emailTexto: string,
  codigo: string,
): Promise<Avaliacao> {
  const conta = await contas.buscarPorEmail(new Email(emailTexto));
  if (!conta || conta.estado !== 'confirmada') {
    return { tipo: 'incorreto', tentativasRestantes: TENTATIVAS_CONFIRMACAO - 1 };
  }

  const recuperacao = await codigos.buscarAberta(conta.id);
  if (!recuperacao) {
    return { tipo: 'incorreto', tentativasRestantes: TENTATIVAS_CONFIRMACAO - 1 };
  }

  const resultado = recuperacao.tentar(codigo, relogio.agora());
  if (resultado === 'aceito') {
    return { tipo: 'aceito', contaId: conta.id, recuperacao };
  }

  await codigos.gravarTentativa(recuperacao);
  if (resultado === 'bloqueada' || recuperacao.tentativasRestantes() === 0) {
    return { tipo: 'bloqueada' };
  }

  return { tipo: 'incorreto', tentativasRestantes: recuperacao.tentativasRestantes() };
}
