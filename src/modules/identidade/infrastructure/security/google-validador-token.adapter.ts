import { Injectable, Logger } from '@nestjs/common';
import { PerfilGoogle, ValidadorTokenGoogle } from '../../domain/ports/validador-token-google.port';

/**
 * Valida idToken do Google (tokeninfo) e confere audiência com os
 * client IDs configurados (web + iOS). O Flutter manda `serverClientId`
 * (web) no token; em alguns aparelhos o `aud` vem como o client iOS.
 */
const URL_TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';

@Injectable()
export class GoogleValidadorTokenAdapter implements ValidadorTokenGoogle {
  private readonly logger = new Logger(GoogleValidadorTokenAdapter.name);

  async validar(token: string): Promise<PerfilGoogle | null> {
    const url = new URL(URL_TOKENINFO);
    url.searchParams.set('id_token', token);

    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!resposta.ok) {
        this.logger.warn(`Tokeninfo HTTP ${resposta.status}`);
        return null;
      }

      const corpo = (await resposta.json()) as Record<string, unknown>;
      const sub = texto(corpo.sub);
      const email = texto(corpo.email);
      const nome = texto(corpo.name) || email;
      if (!sub || !email || !emailVerificado(corpo.email_verified)) {
        this.logger.warn(
          `Token Google incompleto (sub=${Boolean(sub)} email=${Boolean(email)} verified=${String(corpo.email_verified)})`,
        );
        return null;
      }

      const aud = texto(corpo.aud);
      const azp = texto(corpo.azp);
      const permitidos = audienciasPermitidas();
      if (permitidos.length > 0 && !permitidos.includes(aud) && !permitidos.includes(azp)) {
        this.logger.warn(
          `Token Google com audiência inesperada (aud=${aud || 'n/a'} azp=${azp || 'n/a'} permitidos=${permitidos.length})`,
        );
        return null;
      }

      const expiraEm = Number(corpo.exp) * 1000;
      if (!Number.isFinite(expiraEm) || expiraEm <= Date.now()) {
        this.logger.warn('Token Google expirado');
        return null;
      }

      return { sub, email, nome };
    } catch (erro) {
      this.logger.error('Falha ao validar token do Google', erro instanceof Error ? erro.stack : erro);
      return null;
    }
  }
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

/** tokeninfo pode devolver `"true"` (string) ou `true` (boolean). */
function emailVerificado(valor: unknown): boolean {
  return valor === true || valor === 'true';
}

function audienciasPermitidas(): string[] {
  return [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ]
    .map((v) => (v ?? '').trim())
    .filter(Boolean);
}
