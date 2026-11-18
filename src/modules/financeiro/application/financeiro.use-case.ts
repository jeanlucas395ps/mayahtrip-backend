import { Inject, Injectable } from '@nestjs/common';
import { CategoriaLida, FINANCEIRO, FinanceiroRepositorio, MoedaLida, TaxaLida } from '../domain/financeiro.port';

@Injectable()
export class FinanceiroUseCase {
  constructor(@Inject(FINANCEIRO) private readonly financeiro: FinanceiroRepositorio) {}

  async moedas(uso: string | undefined): Promise<MoedaLida[] | 'filtro'> {
    if (uso && uso !== 'exibicao' && uso !== 'gasto') return 'filtro';
    return this.financeiro.moedas(uso !== 'gasto');
  }

  categorias(): Promise<CategoriaLida[]> {
    return this.financeiro.categorias();
  }

  taxa(base: string | undefined, alvo: string | undefined, data: string | undefined): Promise<TaxaLida | 'moeda' | 'ausente' | 'cambio' | 'filtro'> {
    if (!base || !alvo || !data || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^[A-Za-z]{3}$/.test(base) || !/^[A-Za-z]{3}$/.test(alvo)) {
      return Promise.resolve('filtro');
    }
    return this.financeiro.taxa(base.toUpperCase(), alvo.toUpperCase(), data);
  }
}
