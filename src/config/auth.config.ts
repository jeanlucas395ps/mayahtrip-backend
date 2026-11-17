import { registerAs } from '@nestjs/config';

export interface AuthConfig {
  jwtAccessSecret: string;
  jwtAccessTtlSeconds: number;
}

/**
 * ADR 0001: access token é JWT stateless de 15 min; não há segredo de
 * refresh token aqui porque o refresh é opaco (aleatório), não assinado.
 */
export const authConfig = registerAs('auth', (): AuthConfig => ({
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET as string,
  jwtAccessTtlSeconds: Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900),
}));
