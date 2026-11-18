import { describe, expect, it } from 'vitest';
import { aplicarEscolha, idiomaDoPais, moedaDoLugar, modoDe, PreferenciaGravada, refletir } from './preferencia';

const exibicao = new Set(['BRL', 'USD', 'GBP', 'CAD', 'AUD', 'EUR', 'MXN', 'CHF', 'CNY', 'JPY']);

const atual: PreferenciaGravada = {
  userId: 'id-1',
  segueIdioma: true,
  idioma: 'pt-BR',
  segueMoeda: true,
  moeda: 'BRL',
  fuso: null,
};

describe('preferência de idioma e moeda', () => {
  it('usa a tabela de países e cai em pt-BR e BRL fora dela', () => {
    expect(idiomaDoPais('PT')).toBe('pt-PT');
    expect(idiomaDoPais('gb')).toBe('en');
    expect(idiomaDoPais('MX')).toBe('es');
    expect(idiomaDoPais('JP')).toBe('pt-BR');
    expect(idiomaDoPais(null)).toBe('pt-BR');
    expect(moedaDoLugar('jpy', exibicao)).toBe('JPY');
    expect(moedaDoLugar('NOK', exibicao)).toBe('BRL');
    expect(moedaDoLugar(null, exibicao)).toBe('BRL');
  });

  it('respeita a escolha explícita e deixa a localização só no que continua seguindo', () => {
    const escolhida = aplicarEscolha(atual, { idioma: 'en', moeda: 'jpy' }, exibicao);
    const refletida = refletir(escolhida, { pais: 'PT', paisNome: 'Portugal', cidade: 'Lisboa', moeda: 'EUR', fuso: 'Europe/Lisbon' }, exibicao);

    expect(refletida.idioma).toBe('en');
    expect(refletida.moeda).toBe('JPY');
    expect(refletida.segueIdioma).toBe(false);
    expect(refletida.fuso).toBe('Europe/Lisbon');
    expect(modoDe(refletida)).toBe('personalizado');

    const deVolta = refletir(
      aplicarEscolha(refletida, { idioma: 'localizacao' }, exibicao),
      { pais: 'PT', paisNome: 'Portugal', cidade: 'Lisboa', moeda: 'EUR', fuso: 'Europe/Lisbon' },
      exibicao,
    );
    expect(deVolta.idioma).toBe('pt-PT');
    expect(deVolta.moeda).toBe('JPY');
    expect(deVolta.segueIdioma).toBe(true);
    expect(deVolta.segueMoeda).toBe(false);
  });
});
