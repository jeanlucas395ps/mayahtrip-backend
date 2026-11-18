import { registerAs } from '@nestjs/config';

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  publicAppUrl: string;
}

/** Fornecedor fixado em ARCHITECTURE.md: SMTP Hostinger. */
export const emailConfig = registerAs('email', (): EmailConfig => ({
  host: process.env.SMTP_HOST as string,
  port: Number(process.env.SMTP_PORT ?? 587),
  user: process.env.SMTP_USER ?? '',
  password: process.env.SMTP_PASSWORD ?? '',
  from: process.env.SMTP_FROM as string,
  publicAppUrl: process.env.APP_PUBLIC_URL ?? '',
}));
