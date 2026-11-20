import { describe, expect, it } from 'vitest';
import { aplicarEdicao, PerfilGravado, PerfilInvalidoError } from './perfil';

const atual: PerfilGravado = {
  userId: 'id-1',
  displayName: 'Ana',
  username: 'ana',
  homeCity: 'Lisboa',
  websiteUrl: 'https://ana.example',
  bio: 'Olá',
  avatarStorageKey: null,
  visibility: 'public',
};

describe('aplicarEdicao', () => {
  it('mantém o valor anterior quando o campo vem vazio e tira o @ inicial', () => {
    const editado = aplicarEdicao(atual, {
      displayName: '  ',
      username: '@Ana.Silva',
      homeCity: '',
      bio: '',
      websiteUrl: '',
    });

    expect(editado.displayName).toBe('Ana');
    expect(editado.username).toBe('Ana.Silva');
    expect(editado.homeCity).toBe('Lisboa');
    expect(editado.bio).toBe('Olá');
    expect(editado.websiteUrl).toBe('https://ana.example');
  });

  it('rejeita username fora do conjunto, bio acima de 150 e nome acima de 120', () => {
    expect(() => aplicarEdicao(atual, { username: 'ana silva' })).toThrow(PerfilInvalidoError);
    expect(() => aplicarEdicao(atual, { username: 'ana!' })).toThrow(PerfilInvalidoError);
    expect(() => aplicarEdicao(atual, { bio: 'a'.repeat(151) })).toThrow(PerfilInvalidoError);
    expect(() => aplicarEdicao(atual, { displayName: 'a'.repeat(121) })).toThrow(PerfilInvalidoError);
    expect(aplicarEdicao(atual, { bio: 'a'.repeat(150) }).bio).toHaveLength(150);
    expect(aplicarEdicao(atual, { username: `@${'á'.repeat(80)}` }).username).toBe('á'.repeat(80));
    expect(aplicarEdicao(atual, { username: 'ana#$&' }).username).toBe('ana#$&');
  });
});
