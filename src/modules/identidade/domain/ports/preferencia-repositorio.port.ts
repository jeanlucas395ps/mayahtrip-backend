import { PreferenciaGravada } from '../preferencia';

export const PREFERENCIA_REPOSITORIO = Symbol('PREFERENCIA_REPOSITORIO');

export interface PreferenciaRepositorio {
  buscar(userId: string): Promise<PreferenciaGravada>;
  salvar(preferencia: PreferenciaGravada): Promise<void>;
  moedasDeExibicao(): Promise<Set<string>>;
}
