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
      hashSenha: 'hash-opaco',
      codigoVerificacao: codigo,
      criadaEm: agora,
    });

    expect(conta.estado).toBe('pendente');
  });

  it('nunca expõe o hash da senha em string ou JSON', () => {
    const conta = Conta.criarPendente({
      id: 'id-1',
      nome: 'Jean Lucas',
      email,
      hashSenha: 'hash-opaco-bem-secreto',
      codigoVerificacao: codigo,
      criadaEm: agora,
    });

    expect(JSON.stringify(conta)).not.toContain('hash-opaco-bem-secreto');
  });
});
