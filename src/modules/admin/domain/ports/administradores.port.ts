export const ADMINISTRADORES = Symbol('ADMINISTRADORES');

export interface AdministradorGravado {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

export interface AdministradoresRepositorio {
  listar(): Promise<AdministradorGravado[]>;
  porId(id: string): Promise<AdministradorGravado | null>;
  contarAtivos(): Promise<number>;
  criar(entrada: { name: string; email: string; passwordHash: string }): Promise<AdministradorGravado>;
  editar(id: string, entrada: { name: string; email: string; passwordHash: string | null }): Promise<AdministradorGravado | null>;
  definirAtivo(id: string, ativo: boolean): Promise<boolean>;
  excluir(id: string): Promise<boolean>;
}
