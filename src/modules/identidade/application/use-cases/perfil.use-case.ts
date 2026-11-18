import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { aplicarEdicao, EdicaoDePerfil, PerfilGravado, VisibilidadeDoPerfil } from '../../domain/perfil';
import { ARMAZENAMENTO, ArmazenamentoDeArquivo } from '../../domain/ports/armazenamento.port';
import { PERFIL_REPOSITORIO, PerfilRepositorio, UsernameEmUsoError } from '../../domain/ports/perfil-repositorio.port';
import { PREPARADOR_DE_AVATAR, PreparadorDeAvatar } from '../../domain/ports/preparador-de-avatar.port';

/** Mesmo teto já fechado para foto: 10 MB. A API reduz para 256 px. */
export const LIMITE_AVATAR_BYTES = 10 * 1024 * 1024;

export interface PerfilVisivel {
  nome: string;
  usuario: string;
  cidade: string | null;
  link: string | null;
  bio: string | null;
  visibilidade: 'publico' | 'privado';
  temAvatar: boolean;
  conteudoVisivel: boolean;
}

export class AvatarInvalidoError extends Error {
  constructor(readonly motivo: 'tipo' | 'tamanho') {
    super(motivo);
    this.name = 'AvatarInvalidoError';
  }
}

export class PerfilAusenteError extends Error {
  constructor() {
    super('perfil ausente');
    this.name = 'PerfilAusenteError';
  }
}

@Injectable()
export class PerfilUseCase {
  constructor(
    @Inject(PERFIL_REPOSITORIO) private readonly perfis: PerfilRepositorio,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: ArmazenamentoDeArquivo,
    @Inject(PREPARADOR_DE_AVATAR) private readonly preparador: PreparadorDeAvatar,
  ) {}

  async meu(userId: string): Promise<PerfilVisivel> {
    const perfil = await this.exigir(userId);
    return visao(perfil, true);
  }

  async editar(userId: string, edicao: EdicaoDePerfil): Promise<PerfilVisivel> {
    const atual = await this.exigir(userId);
    const editado = aplicarEdicao(atual, edicao);
    const outro = await this.perfis.buscarPorUsername(editado.username);
    if (outro && outro.userId !== atual.userId) {
      throw new UsernameEmUsoError();
    }
    await this.perfis.salvar(editado);
    return visao(editado, true);
  }

  async publicar(username: string, espectadorId: string | null): Promise<PerfilVisivel> {
    const perfil = await this.perfis.buscarPorUsername(username.replace(/^@+/, ''));
    if (!perfil) throw new PerfilAusenteError();
    const podeVer = await this.podeVerConteudo(perfil, espectadorId);
    return visao(perfil, podeVer);
  }

  async definirAvatar(userId: string, bytes: Buffer, mime: string): Promise<void> {
    if (bytes.length > LIMITE_AVATAR_BYTES) throw new AvatarInvalidoError('tamanho');
    const atual = await this.exigir(userId);
    let pronto: { bytes: Buffer; mime: string };
    try {
      pronto = await this.preparador.preparar(bytes, mime);
    } catch {
      throw new AvatarInvalidoError('tipo');
    }

    const chave = `avatars/${userId}/${randomUUID()}`;
    await this.armazenamento.guardar(chave, pronto.bytes, pronto.mime);
    try {
      await this.perfis.salvar({ ...atual, avatarStorageKey: chave });
    } catch (erro) {
      await this.armazenamento.apagar(chave).catch(() => undefined);
      throw erro;
    }
    if (atual.avatarStorageKey && atual.avatarStorageKey !== chave) {
      await this.armazenamento.apagar(atual.avatarStorageKey).catch(() => undefined);
    }
  }

  async lerAvatar(username: string, espectadorId: string | null): Promise<{ bytes: Buffer; mime: string }> {
    const perfil = await this.perfis.buscarPorUsername(username.replace(/^@+/, ''));
    if (!perfil?.avatarStorageKey) throw new PerfilAusenteError();
    if (!(await this.podeVerConteudo(perfil, espectadorId))) throw new PerfilAusenteError();
    const arquivo = await this.armazenamento.ler(perfil.avatarStorageKey);
    if (!arquivo) throw new PerfilAusenteError();
    return arquivo;
  }

  private async exigir(userId: string): Promise<PerfilGravado> {
    const perfil = await this.perfis.buscarPorUsuario(userId);
    if (!perfil) throw new PerfilAusenteError();
    return perfil;
  }

  private async podeVerConteudo(perfil: PerfilGravado, espectadorId: string | null): Promise<boolean> {
    if (perfil.visibility === 'public' || espectadorId === perfil.userId) return true;
    if (!espectadorId) return false;
    return this.perfis.segue(espectadorId, perfil.userId);
  }
}

function visao(perfil: PerfilGravado, conteudoVisivel: boolean): PerfilVisivel {
  const visibilidade = perfil.visibility === 'private' ? 'privado' : 'publico';
  if (!conteudoVisivel) {
    return {
      nome: perfil.displayName,
      usuario: perfil.username,
      cidade: null,
      link: null,
      bio: null,
      visibilidade,
      temAvatar: false,
      conteudoVisivel: false,
    };
  }
  return {
    nome: perfil.displayName,
    usuario: perfil.username,
    cidade: perfil.homeCity,
    link: perfil.websiteUrl,
    bio: perfil.bio,
    visibilidade,
    temAvatar: perfil.avatarStorageKey !== null,
    conteudoVisivel: true,
  };
}

export function visibilidadeDe(valor: 'publico' | 'privado' | undefined): VisibilidadeDoPerfil | undefined {
  if (valor === 'publico') return 'public';
  if (valor === 'privado') return 'private';
  return undefined;
}
