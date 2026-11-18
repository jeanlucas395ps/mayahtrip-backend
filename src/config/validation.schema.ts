import Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  REDIS_URL: Joi.string().uri().required(),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL_SECONDS: Joi.number().default(900),

  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  SMTP_FROM: Joi.string().required(),

  SIGN_UP_CODE_TTL_MINUTES: Joi.number().default(10),
  SIGN_UP_RATE_LIMIT_PER_MINUTE: Joi.number().default(5),

  // Teto do guard único. O número de produto continua em aberto.
  // 120/60000 é o valor que o processo já usava.
  RATE_LIMIT_LIMITE: Joi.number().default(120),
  RATE_LIMIT_JANELA_MS: Joi.number().default(60_000),

  REFRESH_TTL_MANTER_CONECTADO_SEGUNDOS: Joi.number().default(30 * 24 * 60 * 60),
  REFRESH_TTL_SEM_MANTER_CONECTADO_SEGUNDOS: Joi.number().default(24 * 60 * 60),
  HANDOFF_TTL_SEGUNDOS: Joi.number().default(60),

  // Nome usado pela documentação do ReadMe. Vazio não publica.
  README_API_KEY: Joi.string().allow('').optional(),

  GCS_BUCKET: Joi.string().allow('').default(''),
});
