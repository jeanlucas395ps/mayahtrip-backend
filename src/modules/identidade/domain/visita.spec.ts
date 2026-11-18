import { describe, expect, it } from 'vitest';
import { dataDeVisita, decidirMarcacao, percentualDoMundo, podeRemover, VisitaInvalidaError } from './visita';

describe('visita no mapa', () => {
  it('deixa a viagem passada no lugar da marca manual e preserva a primeira viagem', () => {
    expect(decidirMarcacao(null, { origem: 'manual', viagemId: null, quando: null }).tipo).toBe('inserir');
    expect(decidirMarcacao({ origem: 'manual', viagemId: null, quando: null }, { origem: 'trip', viagemId: 'viagem-1', quando: '2026-01-01' })).toMatchObject({
      tipo: 'atualizar',
      origem: 'trip',
      viagemId: 'viagem-1',
    });
    expect(decidirMarcacao({ origem: 'trip', viagemId: 'viagem-1', quando: '2026-01-01' }, { origem: 'manual', viagemId: null, quando: '2026-02-01' }).tipo).toBe('manter');
    expect(decidirMarcacao({ origem: 'trip', viagemId: 'viagem-1', quando: '2026-01-01' }, { origem: 'trip', viagemId: 'viagem-2', quando: '2026-03-01' }).tipo).toBe('manter');
  });

  it('só remove marca manual e usa 195 como divisor do mundo', () => {
    expect(podeRemover(null)).toBe('ausente');
    expect(podeRemover({ origem: 'manual', viagemId: null, quando: null })).toBe('remover');
    expect(podeRemover({ origem: 'trip', viagemId: 'viagem-1', quando: null })).toBe('viagem');
    expect(percentualDoMundo(0)).toBe(0);
    expect(percentualDoMundo(1)).toBe(1);
    expect(percentualDoMundo(195)).toBe(100);
    expect(() => dataDeVisita('2026-13-40')).toThrow(VisitaInvalidaError);
    expect(dataDeVisita('2026-01-02')).toBe('2026-01-02');
  });
});
