import { describe, expect, it } from 'vitest';
import { podeDesativar, podeExcluir } from './regras-de-administrador';

describe('regras do administrador', () => {
  it('recusa excluir a si mesmo quando é o único ativo e recusa desligar o último ativo', () => {
    expect(podeExcluir('eu', 'eu', 1)).toBe('unico');
    expect(podeExcluir('eu', 'eu', 2)).toBeNull();
    expect(podeExcluir('outro', 'eu', 1)).toBeNull();
    expect(podeDesativar(true, 1)).toBe('unico');
    expect(podeDesativar(true, 2)).toBeNull();
    expect(podeDesativar(false, 1)).toBeNull();
  });
});
