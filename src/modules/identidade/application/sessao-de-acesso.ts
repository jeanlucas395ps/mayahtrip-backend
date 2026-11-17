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
    const ttlRefresh = manterConectado
      ? this.config.refreshTtlComManterConectadoSegundos
      : this.config.refreshTtlSemManterConectadoSegundos;

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
    const linhas = await this.sessoes.revogarFamilia(sessao.familiaId);
    const agora = this.relogio.agora();
    for (const linha of linhas) {
      const ttl = Math.ceil((linha.expiraEm.getTime() - agora.getTime()) / 1000);
      if (ttl > 0) {
        await this.revogacao.revogar(linha.accessJti, Math.min(ttl, this.config.jwtAccessTtlSeconds));
      }
    }
  }

  private assinar(contaId: string, jti: string): Promise<string> {
    return this.jwt.signAsync({ sub: contaId }, { jwtid: jti, expiresIn: this.config.jwtAccessTtlSeconds });
  }
}

export function hashOpaco(valor: string): string {
  return createHash('sha256').update(valor).digest('hex');
}
