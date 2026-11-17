import { registerAs } from '@nestjs/config';

export interface RateLimitConfig {
  /**
   * Teto do guard único (spec 048). O número de produto continua em
   * aberto. 120 por 60 s é o valor que o processo já usava antes desta
   * spec, para o boot não mudar. O teste injeta outro teto.
   */
  limite: number;
  janelaMs: number;
}

export const rateLimitConfig = registerAs(
  'rateLimit',
  (): RateLimitConfig => ({
    limite: Number(process.env.RATE_LIMIT_LIMITE ?? 120),
    janelaMs: Number(process.env.RATE_LIMIT_JANELA_MS ?? 60_000),
  }),
);
