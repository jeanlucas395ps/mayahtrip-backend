import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CodigoHandoffGravado, CodigoHandoffRepositorio } from '../../../domain/ports/codigo-handoff-repositorio.port';

interface Linha {
  id: string;
  user_id: string;
  code_hash: string;
  expires_at: Date;
  used_at: Date | null;
}

@Injectable()
export class CodigoHandoffTypeOrmRepositorio implements CodigoHandoffRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async salvar(codigo: CodigoHandoffGravado): Promise<void> {
    await this.dados.query(
      `INSERT INTO identity.user_handoff_codes (id, user_id, code_hash, expires_at, used_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [codigo.id, codigo.contaId, codigo.hashCodigo, codigo.expiraEm, codigo.usadoEm],
    );
  }

  async buscarPorHash(hashCodigo: string): Promise<CodigoHandoffGravado | null> {
    const linhas = await this.dados.query<Linha[]>(
      `SELECT id, user_id, code_hash, expires_at, used_at FROM identity.user_handoff_codes WHERE code_hash = $1`,
      [hashCodigo],
    );
    const linha = linhas[0];
    if (!linha) return null;
    return {
      id: linha.id,
      contaId: linha.user_id,
      hashCodigo: linha.code_hash,
      expiraEm: new Date(linha.expires_at),
      usadoEm: linha.used_at ? new Date(linha.used_at) : null,
    };
  }

  async marcarUsado(id: string, quando: Date): Promise<void> {
    await this.dados.query(`UPDATE identity.user_handoff_codes SET used_at = $2 WHERE id = $1`, [id, quando]);
  }
}
