import { Controller, Get, HttpException, HttpStatus, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../../../identidade/interface/http/guards/access-token.guard';
import { FinanceiroUseCase } from '../../application/financeiro.use-case';
import { CategoriaLida, MoedaLida, TaxaLida } from '../../domain/financeiro.port';

@ApiTags('finance')
@Controller('finance')
@UseGuards(AccessTokenGuard)
export class FinanceiroController {
  constructor(@Inject(FinanceiroUseCase) private readonly financeiro: FinanceiroUseCase) {}

  @Get('currencies')
  async moedas(@Query('uso') uso?: string): Promise<MoedaLida[]> {
    const lista = await this.financeiro.moedas(uso);
    if (lista === 'filtro') throw new HttpException({ message: 'Filtro inválido.' }, HttpStatus.BAD_REQUEST);
    return lista;
  }

  @Get('exchange-rates')
  async taxa(@Query('base') base?: string, @Query('target') alvo?: string, @Query('date') data?: string): Promise<TaxaLida> {
    const taxa = await this.financeiro.taxa(base, alvo, data);
    if (taxa === 'filtro') throw new HttpException({ message: 'Informe a moeda de origem, a de destino e a data.' }, HttpStatus.BAD_REQUEST);
    if (taxa === 'moeda') throw new HttpException({ message: 'Escolha uma moeda ativa.' }, HttpStatus.BAD_REQUEST);
    if (taxa === 'cambio') throw new HttpException({ message: 'Não foi possível obter a taxa do dia.' }, HttpStatus.BAD_GATEWAY);
    if (taxa === 'ausente') throw new HttpException({ message: 'Não foi possível obter a taxa do dia.' }, HttpStatus.BAD_GATEWAY);
    return taxa;
  }

  @Get('expense-categories')
  categorias(): Promise<CategoriaLida[]> {
    return this.financeiro.categorias();
  }
}
