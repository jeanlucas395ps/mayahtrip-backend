import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CAMBIO, Cambio, CategoriaLida, FinanceiroRepositorio, MoedaLida, TaxaLida } from '../../domain/financeiro.port';

@Injectable()
export class FinanceiroPgRepositorio implements FinanceiroRepositorio {
  constructor(
    @Inject(DataSource) private readonly dados: DataSource,
    @Inject(CAMBIO) private readonly cambio: Cambio,
  ) {}

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

  async taxa(base: string, alvo: string, data: string): Promise<TaxaLida | 'moeda' | 'ausente' | 'cambio'> {
    const moedas = await this.dados.query<{ code: string }[]>(
      `SELECT code FROM finance.currency_definitions WHERE is_active AND code IN ($1, $2)`,
      [base, alvo],
    );
    if (moedas.length < 2) return 'moeda';
    const existente = await this.lerTaxa(base, alvo, data);
    if (existente) return existente;
    const valor = await this.cambio.taxa(base, alvo, data);
    if (valor === null) return 'cambio';
    try {
      await this.dados.query(
        `INSERT INTO finance.exchange_rates (base_currency, target_currency, exchange_rate, provider, rate_date)
         VALUES ($1, $2, $3, 'frankfurter', $4)`,
        [base, alvo, valor, data],
      );
    } catch (erro) {
      const candidato = erro as { code?: string; driverError?: { code?: string } };
      if (candidato.code !== '23505' && candidato.driverError?.code !== '23505') throw erro;
    }
    return (await this.lerTaxa(base, alvo, data)) ?? 'ausente';
  }

  private async lerTaxa(base: string, alvo: string, data: string): Promise<TaxaLida | null> {
    const linhas = await this.dados.query<{ exchange_rate: string; rate_date: string }[]>(
      `SELECT exchange_rate::text, rate_date::text FROM finance.exchange_rates
       WHERE base_currency = $1 AND target_currency = $2 AND rate_date = $3`,
      [base, alvo, data],
    );
    if (linhas.length === 0) return null;
    return { base, target: alvo, rate: Number(linhas[0].exchange_rate), date: linhas[0].rate_date };
  }
}
