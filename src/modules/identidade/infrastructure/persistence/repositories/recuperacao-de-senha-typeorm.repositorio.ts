import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RecuperacaoDeSenha } from '../../../domain/entities/recuperacao-de-senha';
import { RecuperacaoDeSenhaRepositorio } from '../../../domain/ports/recuperacao-de-senha-repositorio.port';
import { CodigoVerificacao, hashDeCodigo } from '../../../domain/value-objects/codigo-verificacao.vo';

interface LinhaCodigo {
  id: string;
  code_hash: string;
  attempts: number;
  expires_at: Date;
  last_sent_at: Date;
}

@Injectable()
export class RecuperacaoDeSenhaTypeOrmRepositorio implements RecuperacaoDeSenhaRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async buscarAberta(userId: string): Promise<RecuperacaoDeSenha | null> {
    const linhas = await this.dados.query<LinhaCodigo[]>(
      `SELECT id, code_hash, attempts, expires_at, last_sent_at
       FROM identity.user_verification_codes
       WHERE user_id = $1 AND purpose = 'password_reset' AND used_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    );
    const linha = linhas[0];
    if (!linha) return null;
    const minutos = minutosEntre(new Date(linha.last_sent_at), new Date(linha.expires_at));
    return RecuperacaoDeSenha.reconstituir(
      linha.id,
      CodigoVerificacao.reconstituir(linha.code_hash, new Date(linha.last_sent_at), minutos),
      Number(linha.attempts),
    );
  }

  async abrir(userId: string, recuperacao: RecuperacaoDeSenha): Promise<void> {
    const codigo = recuperacao.codigoVerificacao;
    await this.dados.transaction(async (tx) => {
      await tx.query(
        `DELETE FROM identity.user_verification_codes
         WHERE user_id = $1 AND purpose = 'password_reset' AND used_at IS NULL`,
        [userId],
      );
      await tx.query(
        `INSERT INTO identity.user_verification_codes
           (id, user_id, code_hash, purpose, attempts, expires_at, last_sent_at)
         VALUES ($1, $2, $3, 'password_reset', 0, $4, $5)`,
        [
          recuperacao.id,
          userId,
          hashDeCodigo(codigo.valor),
          codigo.expiraEm(),
          codigo.geradoEm,
        ],
      );
    });
  }

  async gravarTentativa(recuperacao: RecuperacaoDeSenha): Promise<void> {
    await this.dados.query(
      `UPDATE identity.user_verification_codes
       SET attempts = $2
       WHERE id = $1 AND purpose = 'password_reset' AND used_at IS NULL`,
      [recuperacao.id, recuperacao.tentativasCodigo],
    );
  }

  async concluir(userId: string, recuperacao: RecuperacaoDeSenha, hashSenha: string, quando: Date): Promise<boolean> {
    return this.dados.transaction(async (tx) => {
      const linhas = await tx.query<{ id: string }[]>(
        `UPDATE identity.user_verification_codes
         SET used_at = $2
         WHERE id = $1 AND user_id = $3 AND purpose = 'password_reset' AND used_at IS NULL
         RETURNING id`,
        [recuperacao.id, quando, userId],
      );
      if (!linhas[0]) return false;
      await tx.query(`UPDATE identity.users SET password_hash = $2, updated_at = now() WHERE id = $1`, [
        userId,
        hashSenha,
      ]);
      return true;
    });
  }
}

function minutosEntre(inicio: Date, fim: Date): number {
  const minutos = Math.round((fim.getTime() - inicio.getTime()) / 60_000);
  return minutos > 0 ? minutos : 10;
}
