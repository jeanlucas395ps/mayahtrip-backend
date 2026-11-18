import { Inject, Injectable } from '@nestjs/common';
import { Cambio } from '../../domain/financeiro.port';

@Injectable()
export class FrankfurterCambio implements Cambio {
  constructor(@Inject('FRANKFURTER_URL') private readonly origem: string) {}

  async taxa(base: string, alvo: string, data: string): Promise<number | null> {
    const url = `${this.origem}/${data}?from=${encodeURIComponent(base)}&to=${encodeURIComponent(alvo)}`;
    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!resposta.ok) return null;
      const corpo = (await resposta.json()) as { rates?: Record<string, number> };
      const valor = corpo.rates?.[alvo];
      return typeof valor === 'number' ? valor : null;
    } catch {
      return null;
    }
  }
}
