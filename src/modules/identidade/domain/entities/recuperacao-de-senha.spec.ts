import { describe, expect, it } from 'vitest';
import { CodigoVerificacao } from '../value-objects/codigo-verificacao.vo';
import { RecuperacaoDeSenha } from './recuperacao-de-senha';

describe('RecuperacaoDeSenha', () => {
  const agora = new Date('2026-11-18T12:00:00.000Z');

  it('aceita o código certo sem consumir a tentativa e bloqueia depois de cinco erros', () => {
    const aberta = RecuperacaoDeSenha.abrir('id-1', CodigoVerificacao.reconstituir('1234', agora, 10));
    expect(aberta.tentar('1234', agora)).toBe('aceito');
    expect(aberta.tentativasCodigo).toBe(0);

    const bloqueada = RecuperacaoDeSenha.abrir('id-2', CodigoVerificacao.reconstituir('1234', agora, 10));
    for (let i = 0; i < 5; i += 1) {
      expect(bloqueada.tentar('0000', agora)).toBe('incorreto');
    }
    expect(bloqueada.tentar('1234', agora)).toBe('bloqueada');
    expect(bloqueada.tentativasCodigo).toBe(5);
  });

  it('trata o código vencido como erro e só libera o reenvio depois de 30 segundos', () => {
    const recuperacao = RecuperacaoDeSenha.abrir('id-1', CodigoVerificacao.reconstituir('1234', agora, 10));
    expect(recuperacao.cedoDemais(new Date(agora.getTime() + 29_000))).toBe(true);
    expect(recuperacao.cedoDemais(new Date(agora.getTime() + 30_000))).toBe(false);
    expect(recuperacao.tentar('1234', new Date(agora.getTime() + 10 * 60_000))).toBe('incorreto');
  });
});
