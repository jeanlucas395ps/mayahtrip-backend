import { describe, expect, it } from 'vitest';
import { CodigoVerificacao } from './codigo-verificacao.vo';

describe('CodigoVerificacao', () => {
  it('gera um código de 4 dígitos numéricos', () => {
    const agora = new Date('2026-11-16T15:00:00.000Z');
    const codigo = CodigoVerificacao.gerar(agora, 10);

    expect(codigo.valor).toMatch(/^\d{4}$/);
  });

  it('fica válido imediatamente após ser gerado', () => {
    const agora = new Date('2026-11-16T15:00:00.000Z');
    const codigo = CodigoVerificacao.gerar(agora, 10);

    expect(codigo.estaExpirado(agora)).toBe(false);
  });

  it('continua válido um instante antes dos 10 minutos (BUSINESS/02: validade de 10 min)', () => {
    const agora = new Date('2026-11-16T15:00:00.000Z');
    const codigo = CodigoVerificacao.gerar(agora, 10);
    const noveMinutosE59 = new Date('2026-11-16T15:09:59.000Z');

    expect(codigo.estaExpirado(noveMinutosE59)).toBe(false);
  });

  it('expira exatamente aos 10 minutos', () => {
    const agora = new Date('2026-11-16T15:00:00.000Z');
    const codigo = CodigoVerificacao.gerar(agora, 10);
    const dezMinutosDepois = new Date('2026-11-16T15:10:00.000Z');

    expect(codigo.estaExpirado(dezMinutosDepois)).toBe(true);
  });

  it('dois códigos gerados em sequência não são sempre iguais', () => {
    const agora = new Date('2026-11-16T15:00:00.000Z');
    const valores = new Set(
      Array.from({ length: 20 }, () => CodigoVerificacao.gerar(agora, 10).valor),
    );

    expect(valores.size).toBeGreaterThan(1);
  });
});
