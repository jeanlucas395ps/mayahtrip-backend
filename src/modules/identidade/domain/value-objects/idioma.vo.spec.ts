import { describe, expect, it } from 'vitest';
import { Idioma, IdiomaInvalidoError } from './idioma.vo';

describe('Idioma', () => {
  it.each(['pt-BR', 'pt-PT', 'en', 'es'] as const)('aceita o locale oficial %s', (valor) => {
    expect(new Idioma(valor).valor).toBe(valor);
  });

  it('rejeita qualquer locale fora dos quatro oficiais (AGENTS.md: "não crie outro locale")', () => {
    expect(() => new Idioma('fr')).toThrow(IdiomaInvalidoError);
  });

  it('usa pt-BR como padrão quando não informado', () => {
    expect(Idioma.padrao().valor).toBe('pt-BR');
  });
});
