export const USUARIOS = Symbol('USUARIOS');

export interface FiltroDeUsuarios {
  q: string | null;
  ativo: boolean | null;
  verificado: boolean | null;
  entrada: 'google' | 'senha' | null;
  pais: string | null;
  cadastroDe: string | null;
  cadastroAte: string | null;
}

export interface UsuarioDoApp {
  id: string;
  name: string;
  username: string;
  email: string;
  countryId: string | null;
  countryName: string | null;
  locale: string;
  currency: string;
  planCode: string;
  emailVerified: boolean;
  createdAt: string;
  status: 'pending' | 'active' | 'inactive';
  deleted: boolean;
  entrada: 'google' | 'senha' | 'ambos';
}

export interface UsuariosRepositorio {
  listar(filtro: FiltroDeUsuarios): Promise<UsuarioDoApp[]>;
  porId(id: string): Promise<UsuarioDoApp | null>;
  definirStatus(id: string, status: 'active' | 'inactive'): Promise<'ok' | 'ausente' | 'excluido'>;
  excluir(id: string): Promise<UsuarioDoApp | null>;
  restaurar(id: string): Promise<UsuarioDoApp | null>;
}
