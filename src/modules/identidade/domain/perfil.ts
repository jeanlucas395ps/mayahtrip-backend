export type VisibilidadeDoPerfil = 'public' | 'private';

export type MotivoDePerfilInvalido = 'username' | 'bio' | 'nome' | 'cidade';

export class PerfilInvalidoError extends Error {
  constructor(readonly motivo: MotivoDePerfilInvalido) {
    super(motivo);
    this.name = 'PerfilInvalidoError';
  }
}

export interface PerfilGravado {
  userId: string;
  displayName: string;
  username: string;
  homeCity: string | null;
  websiteUrl: string | null;
  bio: string | null;
  avatarStorageKey: string | null;
  visibility: VisibilidadeDoPerfil;
}

export interface EdicaoDePerfil {
  displayName?: string;
  username?: string;
  homeCity?: string;
  websiteUrl?: string;
  bio?: string;
  visibility?: VisibilidadeDoPerfil;
}

const LIMITE_NOME = 120;
const LIMITE_BIO = 150;
const LIMITE_CIDADE = 150;
const LIMITE_USERNAME = 80;

/** BUSINESS/34: vazio mantém o anterior. O @ inicial não entra no username. */
export function aplicarEdicao(atual: PerfilGravado, edicao: EdicaoDePerfil): PerfilGravado {
  return {
    ...atual,
    displayName: textoObrigatorio(edicao.displayName, atual.displayName, LIMITE_NOME, 'nome'),
    username: usernameOuAtual(edicao.username, atual.username),
    homeCity: textoOpcional(edicao.homeCity, atual.homeCity, LIMITE_CIDADE, 'cidade'),
    websiteUrl: edicao.websiteUrl === undefined || edicao.websiteUrl.trim() === '' ? atual.websiteUrl : edicao.websiteUrl.trim(),
    bio: textoOpcional(edicao.bio, atual.bio, LIMITE_BIO, 'bio'),
    visibility: edicao.visibility ?? atual.visibility,
  };
}

export function normalizarUsername(bruto: string): string | null {
  const semArroba = bruto.trim().replace(/^@+/, '');
  if (semArroba.length === 0) return null;
  if (semArroba.length > LIMITE_USERNAME || !/^[\p{L}\p{N}._-]+$/u.test(semArroba)) {
    throw new PerfilInvalidoError('username');
  }
  return semArroba;
}

function usernameOuAtual(bruto: string | undefined, atual: string): string {
  if (bruto === undefined) return atual;
  return normalizarUsername(bruto) ?? atual;
}

function textoObrigatorio(
  valor: string | undefined,
  atual: string,
  limite: number,
  motivo: MotivoDePerfilInvalido,
): string {
  return textoOpcional(valor, atual, limite, motivo) ?? atual;
}

function textoOpcional(
  valor: string | undefined,
  atual: string | null,
  limite: number,
  motivo: MotivoDePerfilInvalido,
): string | null {
  if (valor === undefined || valor.trim() === '') return atual;
  const texto = valor.trim();
  if (texto.length > limite) throw new PerfilInvalidoError(motivo);
  return texto;
}
