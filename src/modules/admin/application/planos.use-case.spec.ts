import { describe, expect, it } from 'vitest';
import { PlanosUseCase } from './planos.use-case';
import { NovoPlano, PlanoGravado, PlanosRepositorio } from './planos.repositorio';

function plano(parcial: Partial<PlanoGravado> = {}): PlanoGravado {
  return {
    id: 'p1',
    code: 'pro',
    name: 'PRO',
    description: null,
    isFree: false,
    isActive: false,
    temPrecoAtivo: false,
    preco: null,
    features: [],
    ...parcial,
  };
}

class Memoria implements PlanosRepositorio {
  itens: PlanoGravado[] = [];

  listar(): Promise<PlanoGravado[]> {
    return Promise.resolve(this.itens);
  }

  porId(id: string): Promise<PlanoGravado | null> {
    return Promise.resolve(this.itens.find((p) => p.id === id) ?? null);
  }

  porCodigo(code: string): Promise<PlanoGravado | null> {
    return Promise.resolve(this.itens.find((p) => p.code === code) ?? null);
  }

  criar(entrada: NovoPlano): Promise<PlanoGravado> {
    const gravado = plano({
      id: `id-${this.itens.length + 1}`,
      code: entrada.code,
      name: entrada.name,
      isFree: entrada.isFree,
      isActive: entrada.isActive,
      temPrecoAtivo: entrada.amount !== null,
    });
    this.itens.push(gravado);
    return Promise.resolve(gravado);
  }

  editar(id: string, entrada: Omit<NovoPlano, 'isActive'>): Promise<PlanoGravado> {
    const atual = this.itens.find((p) => p.id === id);
    if (!atual) throw new Error('ausente');
    atual.name = entrada.name;
    return Promise.resolve(atual);
  }

  definirAtivo(id: string, ativo: boolean): Promise<void> {
    const atual = this.itens.find((p) => p.id === id);
    if (atual) atual.isActive = ativo;
    return Promise.resolve();
  }
}

const entrada = {
  code: 'pro',
  name: 'PRO',
  description: null,
  isFree: false,
  currency: 'BRL',
  billingPeriod: 'monthly' as const,
  amount: 29,
  durationDays: 30,
  features: [],
};

describe('PlanosUseCase', () => {
  it('deve recusar um código repetido quando o plano já existe', async () => {
    const memoria = new Memoria();
    memoria.itens.push(plano());
    const caso = new PlanosUseCase(memoria);
    const resultado = await caso.criar(entrada);
    expect(resultado.tipo).toBe('codigo_repetido');
  });

  it('deve criar o plano inativo quando ele é pago', async () => {
    const memoria = new Memoria();
    const caso = new PlanosUseCase(memoria);
    const resultado = await caso.criar(entrada);
    expect(resultado.tipo).toBe('criado');
    if (resultado.tipo === 'criado') expect(resultado.plano.isActive).toBe(false);
  });

  it('deve recusar ativar quando o plano pago não tem preço', async () => {
    const memoria = new Memoria();
    memoria.itens.push(plano({ temPrecoAtivo: false }));
    const caso = new PlanosUseCase(memoria);
    const resultado = await caso.ativar('p1');
    expect(resultado).toEqual({ tipo: 'recusado', motivo: 'sem_preco' });
  });

  it('deve recusar desativar o Free quando o plano é gratuito', async () => {
    const memoria = new Memoria();
    memoria.itens.push(plano({ id: 'free', code: 'free', isFree: true, isActive: true }));
    const caso = new PlanosUseCase(memoria);
    const resultado = await caso.desativar('free');
    expect(resultado).toEqual({ tipo: 'recusado', motivo: 'free_imutavel' });
    expect(memoria.itens[0]?.isActive).toBe(true);
  });

  it('deve desativar o plano pago quando ele tem preço', async () => {
    const memoria = new Memoria();
    memoria.itens.push(plano({ isActive: true, temPrecoAtivo: true }));
    const caso = new PlanosUseCase(memoria);
    const resultado = await caso.desativar('p1');
    expect(resultado.tipo).toBe('desativado');
    expect(memoria.itens[0]?.isActive).toBe(false);
  });
});
