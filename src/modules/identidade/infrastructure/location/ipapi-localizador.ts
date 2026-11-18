import { Injectable, Logger } from '@nestjs/common';
import { Lugar } from '../../domain/preferencia';
import { Localizador } from '../../domain/ports/localizador.port';

const TEMPO_MS = 3_000;

@Injectable()
export class IpapiLocalizador implements Localizador {
  private readonly logger = new Logger(IpapiLocalizador.name);

  async porIp(ip: string): Promise<Lugar | null> {
    const limpo = ip.replace(/^::ffff:/, '');
    if (!ipPublico(limpo)) return null;

    try {
      const resposta = await fetch(`https://ipapi.co/${encodeURIComponent(limpo)}/json/`, {
        headers: { 'User-Agent': 'MayahTrip', Accept: 'application/json' },
        signal: AbortSignal.timeout(TEMPO_MS),
      });
      if (!resposta.ok) return null;
      const corpo = (await resposta.json()) as {
        error?: boolean;
        country_code?: string;
        country_name?: string;
        city?: string;
        currency?: string;
        timezone?: string;
      };
      if (corpo.error || !corpo.country_code) return null;
      return {
        pais: corpo.country_code,
        paisNome: corpo.country_name ?? null,
        cidade: corpo.city ?? null,
        moeda: corpo.currency ?? null,
        fuso: corpo.timezone ?? null,
      };
    } catch (erro) {
      this.logger.error('Falha ao consultar a localização', erro instanceof Error ? erro.stack : erro);
      return null;
    }
  }
}

function ipPublico(ip: string): boolean {
  if (!ip || ip === '::1' || ip === '0.0.0.0') return false;
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return false;
  const partes = ip.split('.').map(Number);
  if (partes.length === 4 && partes[0] === 172 && partes[1] >= 16 && partes[1] <= 31) return false;
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return false;
  return true;
}
