import { registerAs } from '@nestjs/config';

export interface SignUpConfig {
  /** D-3 proposta em 042-sign-up-api.md: valor pendente de confirmação do produto. */
  codeTtlMinutes: number;
  rateLimitPerMinute: number;
}

export const signUpConfig = registerAs('signUp', (): SignUpConfig => ({
  codeTtlMinutes: Number(process.env.SIGN_UP_CODE_TTL_MINUTES ?? 10),
  rateLimitPerMinute: Number(process.env.SIGN_UP_RATE_LIMIT_PER_MINUTE ?? 5),
}));
