import { describe, expect, it, vi } from 'vitest';
import { Conta } from '../../domain/entities/conta.entity';
import type { ContaRepositorio } from '../../domain/ports/conta-repositorio.port';
import { CodigoVerificacao } from '../../domain/value-objects/codigo-verificacao.vo';
import { Email } from '../../domain/value-objects/email.vo';
import { VerificarEmailDisponivelUseCase } from './verificar-email-disponivel.use-case';

function montar(conta: Conta | null) {
  const repositorio: ContaRepositorio = {
    existePorEmail: vi.fn(),
    buscarPorEmail: vi.fn().mockResolvedValue(conta),
    buscarPorGoogleSub: vi.fn(),
    salvar: vi.fn(),
  };
  return { useCase: new VerificarEmailDisponivelUseCase(repositorio), repositorio };
}

describe('VerificarEmailDisponivelUseCase', () => {
  it('e-mail livre → disponivel true', async () => {
    const { useCase } = montar(null);
    await expect(useCase.executar('novo@exemplo.com')).resolves.toEqual({ disponivel: true });
  });

  it('conta pendente → disponivel true (pode concluir cadastro)', async () => {
    const agora = new Date('2026-11-20T12:00:00.000Z');
    const pendente = Conta.reconstituir({
      id: 'p1',
      nome: 'Jean',
      email: new Email('jean@exemplo.com'),
      username: null,
      hashSenha: 'hash',
      codigoVerificacao: CodigoVerificacao.gerar(agora, 10),
      estado: 'pendente',
      criadaEm: agora,
      tentativasCodigo: 0,
      googleSub: null,
      origem: 'senha',
    });
    const { useCase } = montar(pendente);
    await expect(useCase.executar('Jean@Exemplo.com')).resolves.toEqual({ disponivel: true });
  });

  it('conta confirmada → disponivel false', async () => {
    const confirmada = Conta.reconstituir({
      id: 'c1',
      nome: 'Jean',
      email: new Email('jean@exemplo.com'),
      username: null,
      hashSenha: 'hash',
      codigoVerificacao: null,
      estado: 'confirmada',
      criadaEm: new Date('2026-11-01T00:00:00.000Z'),
      tentativasCodigo: 0,
      googleSub: null,
      origem: 'senha',
    });
    const { useCase } = montar(confirmada);
    await expect(useCase.executar('jean@exemplo.com')).resolves.toEqual({ disponivel: false });
  });
});
