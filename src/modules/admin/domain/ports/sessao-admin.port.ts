export const SESSAO_ADMIN = Symbol('SESSAO_ADMIN');

export interface AuditoriaAdmin {
  adminId: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ip: string | null;
}

export interface SessaoAdminRepositorio {
  buscarAtivo(email: string): Promise<{ id: string; passwordHash: string } | null>;
  registrarTentativa(email: string, ip: string | null, successful: boolean): Promise<void>;
  abrirSessao(adminId: string, tokenHash: string, ip: string | null, expiresAt: Date): Promise<void>;
  marcarEntrada(adminId: string): Promise<void>;
  sessaoAtiva(tokenHash: string): Promise<string | null>;
  revogar(tokenHash: string): Promise<boolean>;
  auditar(registro: AuditoriaAdmin): Promise<void>;
}
