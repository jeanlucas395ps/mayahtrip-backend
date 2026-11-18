import { Controller, Get, HttpException, HttpStatus, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../../../identidade/interface/http/guards/access-token.guard';
import { FinanceiroUseCase } from '../../application/financeiro.use-case';
import { CategoriaLida, MoedaLida } from '../../domain/financeiro.port';

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

  @Get('expense-categories')
  categorias(): Promise<CategoriaLida[]> {
    return this.financeiro.categorias();
  }
}
