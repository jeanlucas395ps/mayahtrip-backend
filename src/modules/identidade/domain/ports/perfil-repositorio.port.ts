import { PerfilGravado } from '../perfil';

export const PERFIL_REPOSITORIO = Symbol('PERFIL_REPOSITORIO');

export class UsernameEmUsoError extends Error {
  constructor() {
    super('username em uso');
    this.name = 'UsernameEmUsoError';
  }
}

export interface PerfilRepositorio {
  buscarPorUsuario(userId: string): Promise<PerfilGravado | null>;
  buscarPorUsername(username: string): Promise<PerfilGravado | null>;
  salvar(perfil: PerfilGravado): Promise<void>;
  segue(seguidorId: string, seguidoId: string): Promise<boolean>;
}
