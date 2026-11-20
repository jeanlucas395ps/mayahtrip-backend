import { registerAs } from '@nestjs/config';

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  publicAppUrl: string;
}

/**
 * Fornecedor fixado em ARCHITECTURE.md: SMTP Hostinger.
 *
 * Aceita `SMTP_*` (preferido) e faz fallback para `MAIL_*` (mesmo
 * conjunto que o .env.example documenta para Hostinger).
 */
/** Remove aspas que o `.env` às vezes inclui no valor (`'senha'` → `senha`). */
function semAspas(valor: string): string {
  const t = valor.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  return t;
}

export const emailConfig = registerAs('email', (): EmailConfig => {
  const host = process.env.SMTP_HOST || process.env.MAIL_HOST || 'smtp.hostinger.com';
  const port = Number(process.env.SMTP_PORT || process.env.MAIL_PORT || 465);
  const user = semAspas(process.env.SMTP_USER || process.env.MAIL_USERNAME || '');
  const password = semAspas(process.env.SMTP_PASSWORD || process.env.MAIL_PASSWORD || '');

  const fromAddress = process.env.MAIL_FROM_ADDRESS || '';
  const fromName = (process.env.MAIL_FROM_NAME || 'MayahTrip').replace(/\$\{APP_NAME\}/g, 'MayahTrip');
  const fromMailFallback = fromAddress ? `${fromName} <${fromAddress}>` : 'MayahTrip <no-reply@mayahtrip.com>';
  const from = process.env.SMTP_FROM || fromMailFallback;

  return {
    host,
    port,
    user,
    password,
    from,
    publicAppUrl: process.env.APP_PUBLIC_URL ?? '',
  };
});
