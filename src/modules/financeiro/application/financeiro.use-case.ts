import { Inject, Injectable } from '@nestjs/common';
import { CategoriaLida, FINANCEIRO, FinanceiroRepositorio, MoedaLida } from '../domain/financeiro.port';

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
}
