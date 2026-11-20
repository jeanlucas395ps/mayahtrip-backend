import { describe, expect, it } from 'vitest';
import { Username, UsernameInvalidoError } from './username.vo';

describe('Username', () => {
  it('aceita letras, números e # . _ - $ &; remove @ inicial', () => {
    expect(new Username('@Jean.lucas_1#$&-').valor).toBe('Jean.lucas_1#$&-');
  });

  it('rejeita espaço, vazio e caracteres fora do conjunto', () => {
    expect(() => new Username('')).toThrow(UsernameInvalidoError);
    expect(() => new Username('   ')).toThrow(UsernameInvalidoError);
    expect(() => new Username('jean lucas')).toThrow(UsernameInvalidoError);
    expect(() => new Username('jean@lucas')).toThrow(UsernameInvalidoError);
    expect(() => new Username('jean!')).toThrow(UsernameInvalidoError);
  });
});
