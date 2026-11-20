import { describe, expect, it, vi } from 'vitest';
import { Conta } from '../../domain/entities/conta.entity';
import type { ContaRepositorio } from '../../domain/ports/conta-repositorio.port';
import type { HashDeSenha } from '../../domain/ports/hash-de-senha.port';
import type { PerfilRepositorio } from '../../domain/ports/perfil-repositorio.port';
import { UsernameEmUsoError } from '../../domain/ports/perfil-repositorio.port';
import type { RemetenteDeEmail } from '../../domain/ports/remetente-de-email.port';
import type { Relogio } from '../../domain/ports/relogio.port';
import { CodigoVerificacao } from '../../domain/value-objects/codigo-verificacao.vo';
import { Email } from '../../domain/value-objects/email.vo';
import { CriarContaUseCase } from './criar-conta.use-case';

function montarCasoDeUso(overrides?: {
  contaExistente?: Conta | null;
  usernameEmUsoPor?: string | null;
}) {
  const repositorio: ContaRepositorio = {
    existePorEmail: vi.fn().mockResolvedValue(Boolean(overrides?.contaExistente)),
    buscarPorEmail: vi.fn().mockResolvedValue(overrides?.contaExistente ?? null),
    buscarPorGoogleSub: vi.fn().mockResolvedValue(null),
    salvar: vi.fn().mockImplementation(async (conta) => conta),
  };
  const perfis: PerfilRepositorio = {
    buscarPorUsuario: vi.fn(),
    buscarPorUsername: vi.fn().mockImplementation(async (username: string) => {
      if (overrides?.usernameEmUsoPor && username.toLowerCase() === overrides.usernameEmUsoPor.toLowerCase()) {
        return {
          userId: 'outro-id',
          displayName: 'Outro',
          username,
          homeCity: null,
          websiteUrl: null,
          bio: null,
          avatarStorageKey: null,
          visibility: 'public' as const,
        };
      }
      return null;
    }),
    salvar: vi.fn(),
    segue: vi.fn(),
  };
  const hash: HashDeSenha = {
    gerar: vi.fn().mockResolvedValue('hash-argon2id-opaco'),
  };
  const email: RemetenteDeEmail = {
    enviarCodigoDeVerificacao: vi.fn().mockResolvedValue({ entregue: true }),
    enviarConvite: vi.fn().mockResolvedValue(undefined),
  };
  const relogio: Relogio = {
    agora: vi.fn().mockReturnValue(new Date('2026-11-16T15:00:00.000Z')),
  };

  const useCase = new CriarContaUseCase(repositorio, perfis, hash, email, relogio, 10);

  return { useCase, repositorio, hash, email, relogio, perfis };
}

const entradaValida = {
  nome: 'Jean Lucas',
  usuario: 'jean.lucas',
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
    expect(contaSalva.username).toBe('jean.lucas');
    expect(contaSalva.obterHashSenhaParaPersistencia()).toBe('hash-argon2id-opaco');

    expect(email.enviarCodigoDeVerificacao).toHaveBeenCalledTimes(1);
    const chamadaEmail = (email.enviarCodigoDeVerificacao as any).mock.calls[0][0];
    expect(chamadaEmail.paraEmail).toBe('pessoa@exemplo.com');
    expect(chamadaEmail.codigo).toMatch(/^\d{4}$/);
    expect(chamadaEmail.idioma.valor).toBe('pt-BR');
  });

  it('AC-6/D-2: e-mail já confirmado não cria segunda conta nem reenvia código', async () => {
    const confirmada = Conta.reconstituir({
      id: 'id-1',
      nome: 'Jean',
      email: new Email('pessoa@exemplo.com'),
      username: 'jean.antigo',
      hashSenha: 'hash',
      codigoVerificacao: null,
      estado: 'confirmada',
      criadaEm: new Date('2026-11-01T00:00:00.000Z'),
      tentativasCodigo: 0,
      googleSub: null,
      origem: 'senha',
    });
    const { useCase, repositorio, hash, email } = montarCasoDeUso({ contaExistente: confirmada });

    const resultado = await useCase.executar(entradaValida);

    expect(resultado.contaCriada).toBe(false);
    expect(hash.gerar).not.toHaveBeenCalled();
    expect(repositorio.salvar).not.toHaveBeenCalled();
    expect(email.enviarCodigoDeVerificacao).not.toHaveBeenCalled();
  });

  it('conta pendente: reenvia código no novo cadastro (SMTP pode ter falhado antes)', async () => {
    const geradoEm = new Date('2026-11-16T14:00:00.000Z');
    const pendente = Conta.reconstituir({
      id: 'id-pendente',
      nome: 'Jean',
      email: new Email('pessoa@exemplo.com'),
      username: 'jean.antigo',
      hashSenha: 'hash',
      codigoVerificacao: CodigoVerificacao.gerar(geradoEm, 10),
      estado: 'pendente',
      criadaEm: geradoEm,
      tentativasCodigo: 0,
      googleSub: null,
      origem: 'senha',
    });
    const { useCase, repositorio, hash, email } = montarCasoDeUso({ contaExistente: pendente });

    const resultado = await useCase.executar(entradaValida);

    expect(resultado.contaCriada).toBe(false);
    expect(hash.gerar).toHaveBeenCalled();
    expect(repositorio.salvar).toHaveBeenCalledTimes(1);
    expect(pendente.username).toBe('jean.lucas');
    expect(email.enviarCodigoDeVerificacao).toHaveBeenCalledTimes(1);
  });

  it('username já em uso → UsernameEmUsoError', async () => {
    const { useCase } = montarCasoDeUso({ usernameEmUsoPor: 'jean.lucas' });
    await expect(useCase.executar(entradaValida)).rejects.toBeInstanceOf(UsernameEmUsoError);
  });

  it('usa a mesma instante do relógio injetado para gerar conta e código (sem new Date() disperso)', async () => {
    const { useCase, repositorio, relogio } = montarCasoDeUso();

    await useCase.executar(entradaValida);

    expect(relogio.agora).toHaveBeenCalled();
    const contaSalva = (repositorio.salvar as any).mock.calls[0][0];
    expect(contaSalva.criadaEm).toEqual(new Date('2026-11-16T15:00:00.000Z'));
  });
});
