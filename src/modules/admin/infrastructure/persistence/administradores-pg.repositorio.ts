import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AdministradorGravado, AdministradoresRepositorio } from '../../domain/ports/administradores.port';

interface Linha {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
}

@Injectable()
export class AdministradoresPgRepositorio implements AdministradoresRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async listar(): Promise<AdministradorGravado[]> {
    const linhas = await this.dados.query<Linha[]>(
      `SELECT id, name, email, is_active FROM admin.admin_users WHERE deleted_at IS NULL ORDER BY name, email`,
    );
    return linhas.map(paraAdministrador);
  }

  async porId(id: string): Promise<AdministradorGravado | null> {
    const linhas = await this.dados.query<Linha[]>(
      `SELECT id, name, email, is_active FROM admin.admin_users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return linhas[0] ? paraAdministrador(linhas[0]) : null;
  }

  async contarAtivos(): Promise<number> {
    const linhas = await this.dados.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM admin.admin_users WHERE is_active AND deleted_at IS NULL`,
    );
    return Number(linhas[0]?.total ?? 0);
  }

  async criar(entrada: { name: string; email: string; passwordHash: string }): Promise<AdministradorGravado> {
    const linhas = await this.dados.query<Linha[]>(
      `INSERT INTO admin.admin_users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, is_active`,
      [entrada.name, entrada.email, entrada.passwordHash],
    );
    return paraAdministrador(linhas[0]);
  }

  async editar(
    id: string,
    entrada: { name: string; email: string; passwordHash: string | null },
  ): Promise<AdministradorGravado | null> {
    const linhas = await this.dados.query<Linha[]>(
      `UPDATE admin.admin_users
       SET name = $2,
           email = $3,
           password_hash = COALESCE($4, password_hash)
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, name, email, is_active`,
      [id, entrada.name, entrada.email, entrada.passwordHash],
    );
    const linha = Array.isArray(linhas[0]) ? (linhas[0] as Linha[])[0] : linhas[0];
    return linha ? paraAdministrador(linha) : null;
  }

  async definirAtivo(id: string, ativo: boolean): Promise<boolean> {
    const resultado = await this.dados.query<{ id: string }[]>(
      `UPDATE admin.admin_users SET is_active = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id, ativo],
    );
    const linhas = Array.isArray(resultado[0]) ? resultado[0] : resultado;
    return Boolean(linhas[0]);
  }

  async excluir(id: string): Promise<boolean> {
    const resultado = await this.dados.query<{ id: string }[]>(
      `UPDATE admin.admin_users
       SET deleted_at = now(), is_active = false
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id],
    );
    const linhas = Array.isArray(resultado[0]) ? resultado[0] : resultado;
    return Boolean(linhas[0]);
  }
}

function paraAdministrador(linha: Linha): AdministradorGravado {
  return { id: linha.id, name: linha.name, email: linha.email, isActive: linha.is_active };
}
