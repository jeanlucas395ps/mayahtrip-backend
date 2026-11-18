import { describe, expect, it } from 'vitest';
import { hashDeTokenAdmin } from './token-admin';

describe('token do painel', () => {
  it('grava só o sha256 e o mesmo token produz o mesmo hash', () => {
    const hash = hashDeTokenAdmin('token-do-painel');
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashDeTokenAdmin('token-do-painel'));
    expect(hash).not.toBe(hashDeTokenAdmin('outro-token'));
  });
});
