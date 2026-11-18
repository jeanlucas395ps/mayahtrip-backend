import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { authConfig } from '../../../config/auth.config';
import { RELOGIO, Relogio } from '../domain/ports/relogio.port';
import { LISTA_DE_REVOGACAO, ListaDeRevogacao } from '../domain/ports/lista-de-revogacao.port';
import { SESSAO_REPOSITORIO, SessaoGravada, SessaoRepositorio } from '../domain/ports/sessao-repositorio.port';

export interface ParDeTokens {
  accessToken: string;
  refreshToken: string;
  expiraEmSegundos: number;
}

export type ResultadoRenovacao =
  | { tipo: 'renovado'; tokens: ParDeTokens }
  | { tipo: 'recusado' };

/** ADR 0001: refresh opaco com hash no Postgres; reuso revoga a família. */
@Injectable()
export class SessaoDeAcesso {
  constructor(
    @Inject(SESSAO_REPOSITORIO) private readonly sessoes: SessaoRepositorio,
    @Inject(LISTA_DE_REVOGACAO) private readonly revogacao: ListaDeRevogacao,
    @Inject(RELOGIO) private readonly relogio: Relogio,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  async emitir(contaId: string, manterConectado: boolean, familiaId: string = randomUUID()): Promise<ParDeTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    const accessJti = randomUUID();
    const agora = this.relogio.agora();
    const dias = await this.sessoes.diasDeSessao(manterConectado);
    const ttlRefresh = dias !== null
      ? dias * 24 * 60 * 60
      : manterConectado
        ? this.config.refreshTtlComManterConectadoSegundos
        : this.config.refreshTtlSemManterConectadoSegundos;

    await this.revogacao.lembrarJti(familiaId, accessJti, this.config.jwtAccessTtlSeconds).catch(() => undefined);
    await this.sessoes.salvar({
      id: randomUUID(),
      contaId,
      familiaId,
      hashRefresh: hashOpaco(refreshToken),
      accessJti,
      manterConectado,
      expiraEm: new Date(agora.getTime() + ttlRefresh * 1000),
      consumidaEm: null,
      revogada: false,
    });

    return {
      accessToken: await this.assinar(contaId, accessJti),
      refreshToken,
      expiraEmSegundos: this.config.jwtAccessTtlSeconds,
    };
  }

  /**
   * “Sair” encerra só a família deste aparelho. O refresh identifica a
   * família; o jti do access precisa estar nela quando o índice existe.
   */
  async encerrarLocal(contaId: string, refreshToken: string, jtiAtual: string): Promise<boolean> {
    const sessao = await this.sessoes.buscarPorHashRefresh(hashOpaco(refreshToken));
    if (!sessao || sessao.contaId !== contaId || sessao.revogada || sessao.consumidaEm) {
      return false;
    }

    const jtis = await this.revogacao.jtisDaFamilia(sessao.familiaId).catch(() => [] as string[]);
    if (jtis.length > 0 && !jtis.includes(jtiAtual)) {
      return false;
    }

    await this.revogarFamilia(sessao);
    await this.revogacao.revogar(jtiAtual, this.config.jwtAccessTtlSeconds);
    return true;
  }

  /** A recuperação começa deslogada: não há família local para preservar. */
  async encerrarTodas(contaId: string): Promise<void> {
    const familias = await this.sessoes.revogarDoUsuario(contaId);
    for (const familiaId of familias) {
      const jtis = await this.revogacao.jtisDaFamilia(familiaId).catch(() => [] as string[]);
      for (const jti of jtis) {
        await this.revogacao.revogar(jti, this.config.jwtAccessTtlSeconds);
      }
    }
  }

  async renovar(refreshToken: string): Promise<ResultadoRenovacao> {
    const sessao = await this.sessoes.buscarPorHashRefresh(hashOpaco(refreshToken));
    const agora = this.relogio.agora();

    if (!sessao) {
      return { tipo: 'recusado' };
    }

    if (sessao.revogada || sessao.consumidaEm || sessao.expiraEm.getTime() <= agora.getTime()) {
      if (sessao.consumidaEm || sessao.revogada) {
        await this.revogarFamilia(sessao);
      }
      return { tipo: 'recusado' };
    }

    await this.sessoes.marcarConsumida(sessao.id, agora);
    const tokens = await this.emitir(sessao.contaId, sessao.manterConectado, sessao.familiaId);
    return { tipo: 'renovado', tokens };
  }

  private async revogarFamilia(sessao: SessaoGravada): Promise<void> {
    await this.sessoes.revogarFamilia(sessao.familiaId);
    const jtis = await this.revogacao.jtisDaFamilia(sessao.familiaId).catch(() => []);
    for (const jti of jtis) {
      await this.revogacao.revogar(jti, this.config.jwtAccessTtlSeconds);
    }
  }

  private assinar(contaId: string, jti: string): Promise<string> {
    return this.jwt.signAsync({ sub: contaId }, { jwtid: jti, expiresIn: this.config.jwtAccessTtlSeconds });
  }
}

export function hashOpaco(valor: string): string {
  return createHash('sha256').update(valor).digest('hex');
}
