import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SessaoGravada, SessaoRepositorio } from '../../../domain/ports/sessao-repositorio.port';

interface LinhaSessao {
  id: string;
  user_id: string;
  family_id: string;
  refresh_token_hash: string;
  keep_signed_in: boolean;
  expires_at: Date;
  consumed_at: Date | null;
  revoked_at: Date | null;
}

@Injectable()
export class SessaoTypeOrmRepositorio implements SessaoRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async salvar(sessao: SessaoGravada): Promise<void> {
    await this.dados.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO identity.user_sessions
           (id, user_id, family_id, refresh_token_hash, keep_signed_in, access_tier, expires_at, consumed_at, revoked_at)
         VALUES ($1, $2, $3, $4, $5, 'free', $6, $7, CASE WHEN $8 THEN now() ELSE NULL END)`,
        [
          sessao.id,
          sessao.contaId,
          sessao.familiaId,
          sessao.hashRefresh,
          sessao.manterConectado,
          sessao.expiraEm,
          sessao.consumidaEm,
          sessao.revogada,
        ],
      );
      await tx.query(`UPDATE identity.users SET last_login_at = now() WHERE id = $1`, [sessao.contaId]);
    });
  }

  async buscarPorHashRefresh(hashRefresh: string): Promise<SessaoGravada | null> {
    const linhas = await this.dados.query<LinhaSessao[]>(
      `SELECT id, user_id, family_id, refresh_token_hash, keep_signed_in, expires_at, consumed_at, revoked_at
       FROM identity.user_sessions WHERE refresh_token_hash = $1`,
      [hashRefresh],
    );
    return linhas[0] ? paraDominio(linhas[0]) : null;
  }

  async marcarConsumida(id: string, quando: Date): Promise<void> {
    await this.dados.query(`UPDATE identity.user_sessions SET consumed_at = $2 WHERE id = $1`, [id, quando]);
  }

  async revogarFamilia(familiaId: string): Promise<SessaoGravada[]> {
    const linhas = await this.dados.query<LinhaSessao[]>(
      `UPDATE identity.user_sessions SET revoked_at = COALESCE(revoked_at, now())
       WHERE family_id = $1
       RETURNING id, user_id, family_id, refresh_token_hash, keep_signed_in, expires_at, consumed_at, revoked_at`,
      [familiaId],
    );
    return linhas.map((linha) => ({ ...paraDominio(linha), revogada: true, accessJti: '' }));
  }
}

function paraDominio(linha: LinhaSessao): SessaoGravada {
  return {
    id: linha.id,
    contaId: linha.user_id,
    familiaId: linha.family_id,
    hashRefresh: linha.refresh_token_hash,
    accessJti: '',
    manterConectado: linha.keep_signed_in,
    expiraEm: new Date(linha.expires_at),
    consumidaEm: linha.consumed_at ? new Date(linha.consumed_at) : null,
    revogada: linha.revoked_at !== null,
  };
}
