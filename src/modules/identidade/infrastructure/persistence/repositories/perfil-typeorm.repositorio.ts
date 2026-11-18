import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PerfilGravado, PerfilInvalidoError, VisibilidadeDoPerfil } from '../../../domain/perfil';
import { PerfilRepositorio, UsernameEmUsoError } from '../../../domain/ports/perfil-repositorio.port';

interface LinhaPerfil {
  user_id: string;
  display_name: string;
  username: string;
  home_city_label: string | null;
  website_url: string | null;
  bio: string | null;
  avatar_storage_key: string | null;
  visibility: VisibilidadeDoPerfil;
}

@Injectable()
export class PerfilTypeOrmRepositorio implements PerfilRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async buscarPorUsuario(userId: string): Promise<PerfilGravado | null> {
    const linhas = await this.dados.query<LinhaPerfil[]>(`${consulta} WHERE p.user_id = $1`, [userId]);
    return linhas[0] ? paraDominio(linhas[0]) : null;
  }

  async buscarPorUsername(username: string): Promise<PerfilGravado | null> {
    const linhas = await this.dados.query<LinhaPerfil[]>(`${consulta} WHERE lower(p.username) = lower($1)`, [username]);
    return linhas[0] ? paraDominio(linhas[0]) : null;
  }

  async salvar(perfil: PerfilGravado): Promise<void> {
    try {
      const linhas = await this.dados.query<{ user_id: string }[]>(
        `UPDATE identity.user_profiles
         SET display_name = $2,
             username = $3,
             home_city_label = $4,
             website_url = $5,
             bio = $6,
             visibility = $7::identity.profile_visibility,
             avatar_storage_key = $8,
             updated_at = now()
         WHERE user_id = $1
         RETURNING user_id`,
        [
          perfil.userId,
          perfil.displayName,
          perfil.username,
          perfil.homeCity,
          perfil.websiteUrl,
          perfil.bio,
          perfil.visibility,
          perfil.avatarStorageKey,
        ],
      );
      if (!linhas[0]) {
        throw new Error('perfil ausente');
      }
    } catch (erro) {
      if (codigoPg(erro) === '23505') throw new UsernameEmUsoError();
      if (codigoPg(erro) === '23514') throw new PerfilInvalidoError('username');
      throw erro;
    }
  }

  async segue(seguidorId: string, seguidoId: string): Promise<boolean> {
    const linhas = await this.dados.query<{ ok: number }[]>(
      `SELECT 1 AS ok
       FROM community.user_follows
       WHERE follower_user_id = $1 AND followed_user_id = $2`,
      [seguidorId, seguidoId],
    );
    return Boolean(linhas[0]);
  }
}

const consulta = `
  SELECT p.user_id, p.display_name, p.username, p.home_city_label, p.website_url,
         p.bio, p.avatar_storage_key, p.visibility
  FROM identity.user_profiles p
`;

function paraDominio(linha: LinhaPerfil): PerfilGravado {
  return {
    userId: linha.user_id,
    displayName: linha.display_name,
    username: linha.username,
    homeCity: linha.home_city_label,
    websiteUrl: linha.website_url,
    bio: linha.bio,
    avatarStorageKey: linha.avatar_storage_key,
    visibility: linha.visibility,
  };
}

function codigoPg(erro: unknown): string | undefined {
  if (!erro || typeof erro !== 'object') return undefined;
  const candidato = erro as { code?: string; driverError?: { code?: string } };
  return candidato.code ?? candidato.driverError?.code;
}
