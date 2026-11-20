import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Conta } from '../../domain/entities/conta.entity';
import { CONTA_REPOSITORIO, ContaRepositorio } from '../../domain/ports/conta-repositorio.port';
import { HASH_DE_SENHA, HashDeSenha } from '../../domain/ports/hash-de-senha.port';
import { RELOGIO, Relogio } from '../../domain/ports/relogio.port';
import { VALIDADOR_TOKEN_GOOGLE, ValidadorTokenGoogle } from '../../domain/ports/validador-token-google.port';
import { Email } from '../../domain/value-objects/email.vo';
import { ParDeTokens, SessaoDeAcesso } from '../sessao-de-acesso';

export type ResultadoEntrar = { tipo: 'ok'; tokens: ParDeTokens } | { tipo: 'recusado' };

@Injectable()
export class EntrarComSenhaUseCase {
  constructor(
    @Inject(CONTA_REPOSITORIO) private readonly repositorio: ContaRepositorio,
    @Inject(HASH_DE_SENHA) private readonly hashDeSenha: HashDeSenha,
    @Inject(SessaoDeAcesso) private readonly sessao: SessaoDeAcesso,
  ) {}

  async executar(emailTexto: string, senhaPlana: string, manterConectado: boolean): Promise<ResultadoEntrar> {
    const conta = await this.repositorio.buscarPorEmail(new Email(emailTexto));
    if (!conta || conta.estado !== 'confirmada' || !conta.temSenha) {
      return { tipo: 'recusado' };
    }

    const hash = conta.obterHashSenhaParaPersistencia();
    const confere = hash !== null && (await this.hashDeSenha.conferir(senhaPlana, hash));
    if (!confere) {
      return { tipo: 'recusado' };
    }

    return { tipo: 'ok', tokens: await this.sessao.emitir(conta.id, manterConectado) };
  }
}

@Injectable()
export class EntrarComGoogleUseCase {
  private readonly logger = new Logger(EntrarComGoogleUseCase.name);

  constructor(
    @Inject(CONTA_REPOSITORIO) private readonly repositorio: ContaRepositorio,
    @Inject(VALIDADOR_TOKEN_GOOGLE) private readonly validador: ValidadorTokenGoogle,
    @Inject(RELOGIO) private readonly relogio: Relogio,
    @Inject(SessaoDeAcesso) private readonly sessao: SessaoDeAcesso,
  ) {}

  async executar(token: string, manterConectado: boolean): Promise<ResultadoEntrar> {
    const perfil = await this.validador.validar(token);
    if (!perfil) {
      this.logger.warn('Google recusado: token inválido ou audiência/e-mail não conferem');
      return { tipo: 'recusado' };
    }

    const porSub = await this.repositorio.buscarPorGoogleSub(perfil.sub);
    const email = new Email(perfil.email);
    const porEmail = porSub ?? (await this.repositorio.buscarPorEmail(email));

    let conta = porEmail;
    if (!conta) {
      // Conta nova: sem senha, já confirmada (Google provou o e-mail).
      conta = Conta.criarPorGoogle({
        id: randomUUID(),
        nome: perfil.nome,
        email,
        googleSub: perfil.sub,
        criadaEm: this.relogio.agora(),
      });
      this.logger.log(`Google: criando conta confirmada para ${perfil.email}`);
    } else {
      conta.confirmarPorGoogle(perfil.sub);
      this.logger.log(`Google: vinculando/confirmando conta existente ${perfil.email}`);
    }

    await this.repositorio.salvar(conta);
    return { tipo: 'ok', tokens: await this.sessao.emitir(conta.id, manterConectado) };
  }
}
