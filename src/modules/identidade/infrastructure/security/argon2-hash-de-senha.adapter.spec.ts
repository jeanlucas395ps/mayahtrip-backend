import { describe, expect, it } from 'vitest';
import { Argon2HashDeSenhaAdapter } from './argon2-hash-de-senha.adapter';

describe('Argon2HashDeSenhaAdapter (real, sem mock)', () => {
  it('gera um hash no formato argon2id e nunca devolve a senha em texto puro', async () => {
    const adapter = new Argon2HashDeSenhaAdapter();

    const hash = await adapter.gerar('umaSenhaForte123');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('umaSenhaForte123');
  });

  it('duas chamadas para a mesma senha geram hashes diferentes (salt aleatório)', async () => {
    const adapter = new Argon2HashDeSenhaAdapter();

    const hash1 = await adapter.gerar('umaSenhaForte123');
    const hash2 = await adapter.gerar('umaSenhaForte123');

    expect(hash1).not.toBe(hash2);
  });
});
