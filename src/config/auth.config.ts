import { registerAs } from '@nestjs/config';

export interface AuthConfig {
  jwtAccessSecret: string;
  jwtAccessTtlSeconds: number;
  /** Fechado em 18 Nov 2026: 30 dias com manter conectado, 1 dia sem. */
  refreshTtlComManterConectadoSegundos: number;
  refreshTtlSemManterConectadoSegundos: number;
  /** Fechado em 18 Nov 2026: 60 segundos, uso único. */
  handoffTtlSegundos: number;
}

/**
 * ADR 0001: access token é JWT stateless de 15 min; não há segredo de
 * refresh token aqui porque o refresh é opaco (aleatório), não assinado.
 */
export const authConfig = registerAs('auth', (): AuthConfig => ({
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET as string,
  jwtAccessTtlSeconds: Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900),
  refreshTtlComManterConectadoSegundos: Number(process.env.REFRESH_TTL_MANTER_CONECTADO_SEGUNDOS ?? 30 * 24 * 60 * 60),
  refreshTtlSemManterConectadoSegundos: Number(process.env.REFRESH_TTL_SEM_MANTER_CONECTADO_SEGUNDOS ?? 24 * 60 * 60),
  handoffTtlSegundos: Number(process.env.HANDOFF_TTL_SEGUNDOS ?? 60),
}));
