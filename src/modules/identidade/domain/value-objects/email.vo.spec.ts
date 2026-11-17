import { describe, expect, it } from 'vitest';
import { Email } from './email.vo';

describe('Email', () => {
  it('normaliza para minúsculas e remove espaços nas pontas', () => {
    const email = new Email('  Pessoa@Exemplo.COM  ');

    expect(email.valor).toBe('pessoa@exemplo.com');
  });

  it('deriva o @usuário inicial a partir da parte antes do "@"', () => {
    const email = new Email('joao.silva@exemplo.com');

    expect(email.usuarioSugerido()).toBe('joao.silva');
  });

  it('dois e-mails equivalentes (case-insensitive) são considerados iguais', () => {
    const a = new Email('Pessoa@Exemplo.com');
    const b = new Email('pessoa@exemplo.com');

    expect(a.igual(b)).toBe(true);
  });
});
