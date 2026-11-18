import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CategoriaLida, FinanceiroRepositorio, MoedaLida } from '../../domain/financeiro.port';

@Injectable()
export class FinanceiroPgRepositorio implements FinanceiroRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async moedas(exibicao: boolean): Promise<MoedaLida[]> {
    const linhas = await this.dados.query<{ code: string; name: string; symbol: string | null; decimal_places: number; is_display: boolean }[]>(
      `SELECT code, name, symbol, decimal_places, is_display
       FROM finance.currency_definitions
       WHERE is_active AND ($1::boolean = false OR is_display)
       ORDER BY code`,
      [exibicao],
    );
    return linhas.map((linha) => ({
      code: linha.code.trim(),
      name: linha.name,
      symbol: linha.symbol,
      decimalPlaces: linha.decimal_places,
      display: linha.is_display,
    }));
  }

  async categorias(): Promise<CategoriaLida[]> {
    const linhas = await this.dados.query<{ id: string; name: string; slug: string; icon: string; legend_color: string; sort_order: number }[]>(
      `SELECT id, name, slug, icon, legend_color, sort_order
       FROM finance.expense_categories
       ORDER BY sort_order, slug`,
    );
    return linhas.map((linha) => ({
      id: linha.id,
      name: linha.name,
      slug: linha.slug,
      icon: linha.icon,
      color: linha.legend_color.trim(),
      sortOrder: linha.sort_order,
    }));
  }
}
