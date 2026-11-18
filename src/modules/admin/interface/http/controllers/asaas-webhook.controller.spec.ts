import { describe, expect, it } from 'vitest';
import { tokenConfere } from './asaas-webhook.controller';

describe('webhook da Asaas', () => {
  it('deve recusar quando o token não foi configurado', () => {
    expect(tokenConfere('', 'qualquer')).toBe(false);
  });

  it('deve recusar quando o header não bate com o token', () => {
    expect(tokenConfere('segredo', 'outro')).toBe(false);
  });

  it('deve aceitar quando o header é o token configurado', () => {
    expect(tokenConfere('segredo', 'segredo')).toBe(true);
  });
});
