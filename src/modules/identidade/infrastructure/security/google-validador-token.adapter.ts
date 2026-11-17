import { Injectable, Logger } from '@nestjs/common';
import { PerfilGoogle, ValidadorTokenGoogle } from '../../domain/ports/validador-token-google.port';

/**
 * ARCHITECTURE.md já nomeia Google OAuth. A checagem de audiência
 * (client id) não está em nenhum doc, então este adapter só confirma
 * com o Google que o token existe, não expirou e tem e-mail verificado.
 */
const URL_TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';

@Injectable()
export class GoogleValidadorTokenAdapter implements ValidadorTokenGoogle {
  private readonly logger = new Logger(GoogleValidadorTokenAdapter.name);

  async validar(token: string): Promise<PerfilGoogle | null> {
    const url = new URL(URL_TOKENINFO);
    url.searchParams.set('id_token', token);

    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!resposta.ok) {
        return null;
      }

      const corpo = (await resposta.json()) as Record<string, string>;
      if (!corpo.sub || !corpo.email || corpo.email_verified !== 'true') {
        return null;
      }

      const expiraEm = Number(corpo.exp) * 1000;
      if (!Number.isFinite(expiraEm) || expiraEm <= Date.now()) {
        return null;
      }

      return { sub: corpo.sub, email: corpo.email, nome: corpo.name || corpo.email };
    } catch (erro) {
      this.logger.error('Falha ao validar token do Google', erro instanceof Error ? erro.name : 'erro');
      return null;
    }
  }
}
