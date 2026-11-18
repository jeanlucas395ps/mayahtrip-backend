import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditoriaAdmin, SessaoAdminRepositorio } from '../../domain/ports/sessao-admin.port';

@Injectable()
export class SessaoAdminPgRepositorio implements SessaoAdminRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async buscarAtivo(email: string): Promise<{ id: string; passwordHash: string } | null> {
    const linhas = await this.dados.query<{ id: string; password_hash: string }[]>(
      `SELECT id, password_hash FROM admin.admin_users
       WHERE lower(email) = lower($1) AND is_active AND deleted_at IS NULL`,
      [email],
    );
    const linha = linhas[0];
    return linha ? { id: linha.id, passwordHash: linha.password_hash } : null;
  }

  async registrarTentativa(email: string, ip: string | null, successful: boolean): Promise<void> {
    await this.dados.query(
      `INSERT INTO admin.admin_login_attempts (email, ip_address, successful) VALUES ($1, $2, $3)`,
      [email.slice(0, 255), ip, successful],
    );
  }

  async abrirSessao(adminId: string, tokenHash: string, ip: string | null, expiresAt: Date): Promise<void> {
    await this.dados.query(
      `INSERT INTO admin.admin_sessions (admin_user_id, token_hash, ip_address, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [adminId, tokenHash, ip, expiresAt],
    );
  }

  async marcarEntrada(adminId: string): Promise<void> {
    await this.dados.query(`UPDATE admin.admin_users SET last_login_at = now() WHERE id = $1`, [adminId]);
  }

  async sessaoAtiva(tokenHash: string): Promise<string | null> {
    const linhas = await this.dados.query<{ admin_user_id: string }[]>(
      `SELECT s.admin_user_id
       FROM admin.admin_sessions s
       JOIN admin.admin_users u ON u.id = s.admin_user_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > now()
         AND u.is_active
         AND u.deleted_at IS NULL`,
      [tokenHash],
    );
    return linhas[0]?.admin_user_id ?? null;
  }

  async revogar(tokenHash: string): Promise<boolean> {
    const resultado = await this.dados.query<{ id: string }[]>(
      `UPDATE admin.admin_sessions
       SET revoked_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL
       RETURNING id`,
      [tokenHash],
    );
    const linhas = Array.isArray(resultado[0]) ? resultado[0] : resultado;
    return Boolean(linhas[0]);
  }

  async auditar(registro: AuditoriaAdmin): Promise<void> {
    await this.dados.query(
      `INSERT INTO admin.admin_audit_logs
         (admin_user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
      [
        registro.adminId,
        registro.action,
        registro.entityType,
        registro.entityId,
        registro.oldValues ? JSON.stringify(registro.oldValues) : null,
        registro.newValues ? JSON.stringify(registro.newValues) : null,
        registro.ip,
      ],
    );
  }
}
