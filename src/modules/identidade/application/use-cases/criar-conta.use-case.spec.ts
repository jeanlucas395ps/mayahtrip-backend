import { describe, expect, it, vi } from 'vitest';
import type { ContaRepositorio } from '../../domain/ports/conta-repositorio.port';
import type { HashDeSenha } from '../../domain/ports/hash-de-senha.port';
import type { RemetenteDeEmail } from '../../domain/ports/remetente-de-email.port';
import type { Relogio } from '../../domain/ports/relogio.port';
import { CriarContaUseCase } from './criar-conta.use-case';

function montarCasoDeUso(overrides?: { contaJaExiste?: boolean }) {
  const repositorio: ContaRepositorio = {
    existePorEmail: vi.fn().mockResolvedValue(overrides?.contaJaExiste ?? false),
    salvar: vi.fn().mockImplementation(async (conta) => conta),
  };
  const hash: HashDeSenha = {
    gerar: vi.fn().mockResolvedValue('hash-argon2id-opaco'),
  };
  const email: RemetenteDeEmail = {
    enviarCodigoDeVerificacao: vi.fn().mockResolvedValue(undefined),
  };
  const relogio: Relogio = {
    agora: vi.fn().mockReturnValue(new Date('2026-11-16T15:00:00.000Z')),
  };

  const useCase = new CriarContaUseCase(repositorio, hash, email, relogio, 10);

  return { useCase, repositorio, hash, email, relogio };
}

const entradaValida = {
  nome: 'Jean Lucas',
  email: 'Pessoa@Exemplo.com',
  senhaPlana: 'umaSenhaForte123',
  idioma: 'pt-BR',
};

describe('CriarContaUseCase', () => {
  it('AC-1: cria a conta pendente, gera hash Argon2id e envia o código por e-mail', async () => {
    const { useCase, repositorio, hash, email } = montarCasoDeUso();

    const resultado = await useCase.executar(entradaValida);

    expect(resultado.contaCriada).toBe(true);
    expect(hash.gerar).toHaveBeenCalledWith('umaSenhaForte123');
    expect(repositorio.salvar).toHaveBeenCalledTimes(1);

    const contaSalva = (repositorio.salvar as any).mock.calls[0][0];
    expect(contaSalva.estado).toBe('pendente');
    expect(contaSalva.email.valor).toBe('pessoa@exemplo.com');
    expect(contaSalva.obterHashSenhaParaPersistencia()).toBe('hash-argon2id-opaco');

    expect(email.enviarCodigoDeVerificacao).toHaveBeenCalledTimes(1);
    const chamadaEmail = (email.enviarCodigoDeVerificacao as any).mock.calls[0][0];
    expect(chamadaEmail.paraEmail).toBe('pessoa@exemplo.com');
    expect(chamadaEmail.codigo).toMatch(/^\d{4}$/);
    expect(chamadaEmail.idioma.valor).toBe('pt-BR');
  });

  it('AC-6/D-2: e-mail já cadastrado não cria segunda conta nem reenvia código', async () => {
    const { useCase, repositorio, hash, email } = montarCasoDeUso({ contaJaExiste: true });

    const resultado = await useCase.executar(entradaValida);

    expect(resultado.contaCriada).toBe(false);
    expect(hash.gerar).not.toHaveBeenCalled();
    expect(repositorio.salvar).not.toHaveBeenCalled();
    expect(email.enviarCodigoDeVerificacao).not.toHaveBeenCalled();
  });

  it('usa a mesma instante do relógio injetado para gerar conta e código (sem new Date() disperso)', async () => {
    const { useCase, repositorio, relogio } = montarCasoDeUso();

    await useCase.executar(entradaValida);

    expect(relogio.agora).toHaveBeenCalled();
    const contaSalva = (repositorio.salvar as any).mock.calls[0][0];
    expect(contaSalva.criadaEm).toEqual(new Date('2026-11-16T15:00:00.000Z'));
  });
});
