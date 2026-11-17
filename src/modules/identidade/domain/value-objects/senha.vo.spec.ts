import { describe, expect, it } from 'vitest';
import { Senha, SenhaInvalidaError } from './senha.vo';

describe('Senha', () => {
  it('deve aceitar uma senha com 8 ou mais caracteres', () => {
    const senha = new Senha('12345678');

    expect(senha.valor).toBe('12345678');
  });

  it('deve rejeitar uma senha com menos de 8 caracteres', () => {
    expect(() => new Senha('1234567')).toThrow(SenhaInvalidaError);
  });

  it('deve rejeitar senha vazia', () => {
    expect(() => new Senha('')).toThrow(SenhaInvalidaError);
  });

  it('nunca expõe a senha em string ao ser logada/serializada', () => {
    const senha = new Senha('umaSenhaForte123');

    expect(String(senha)).toBe('[senha oculta]');
    expect(JSON.stringify(senha)).toBe('"[senha oculta]"');
  });
});
