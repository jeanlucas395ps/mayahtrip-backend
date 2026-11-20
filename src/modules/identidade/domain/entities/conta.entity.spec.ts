import { describe, expect, it } from 'vitest';
import { Email } from '../value-objects/email.vo';
import { CodigoVerificacao } from '../value-objects/codigo-verificacao.vo';
import { Conta } from './conta.entity';

describe('Conta', () => {
  const email = new Email('pessoa@exemplo.com');
  const agora = new Date('2026-11-16T15:00:00.000Z');
  const codigo = CodigoVerificacao.gerar(agora, 10);

  it('nasce em estado pendente, nunca confirmada diretamente', () => {
    const conta = Conta.criarPendente({
      id: 'id-1',
      nome: 'Jean Lucas',
      email,
      username: 'jean.lucas',
      hashSenha: 'hash-opaco',
      codigoVerificacao: codigo,
      criadaEm: agora,
    });

    expect(conta.estado).toBe('pendente');
  });

  it('confirma na quinta tentativa certa e bloqueia sem olhar o código depois de cinco erros', () => {
    const agora = new Date('2026-11-16T15:00:00.000Z');
    const codigo = CodigoVerificacao.reconstituir('1234', agora, 10);
    const conta = Conta.criarPendente({
      id: 'id-1',
      nome: 'Jean Lucas',
      email,
      username: 'jean.lucas',
      hashSenha: 'hash-opaco',
      codigoVerificacao: codigo,
      criadaEm: agora,
    });

    expect(conta.tentarConfirmar('1234', new Date('2026-11-16T15:09:59.000Z'))).toBe('confirmada');

    const bloqueada = Conta.criarPendente({
      id: 'id-2',
      nome: 'Jean Lucas',
      email,
      username: 'jean.lucas',
      hashSenha: 'hash-opaco',
      codigoVerificacao: codigo,
      criadaEm: agora,
    });
    for (let i = 0; i < 5; i += 1) {
      expect(bloqueada.tentarConfirmar('0000', agora)).toBe('incorreto');
    }
    expect(bloqueada.tentarConfirmar('1234', agora)).toBe('bloqueada');
    expect(bloqueada.estado).toBe('pendente');
  });

  it('reenvio antes de 30 s é recusado e no instante dos 30 s gera outro código', () => {
    const agora = new Date('2026-11-16T15:00:00.000Z');
    const conta = Conta.criarPendente({
      id: 'id-1',
      nome: 'Jean Lucas',
      email,
      username: 'jean.lucas',
      hashSenha: 'hash-opaco',
      codigoVerificacao: CodigoVerificacao.reconstituir('1234', agora, 10),
      criadaEm: agora,
    });
    const cedo = new Date(agora.getTime() + 29_000);
    const noLimite = new Date(agora.getTime() + 30_000);
    const novo = CodigoVerificacao.reconstituir('9999', noLimite, 10);

    expect(conta.tentarReenviar(novo, cedo)).toBe('cedo');
    expect(conta.tentarReenviar(novo, noLimite)).toBe('reenviado');
    expect(conta.tentativasCodigo).toBe(0);
    expect(conta.codigoVerificacao?.valor).toBe('9999');
  });

  it('nunca expõe o hash da senha em string ou JSON', () => {
    const conta = Conta.criarPendente({
      id: 'id-1',
      nome: 'Jean Lucas',
      email,
      username: 'jean.lucas',
      hashSenha: 'hash-opaco-bem-secreto',
      codigoVerificacao: codigo,
      criadaEm: agora,
    });

    expect(JSON.stringify(conta)).not.toContain('hash-opaco-bem-secreto');
  });
});
