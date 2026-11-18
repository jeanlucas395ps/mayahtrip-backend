import { Module } from '@nestjs/common';
import { IdentidadeModule } from '../identidade/identidade.module';
import { FinanceiroUseCase } from './application/financeiro.use-case';
import { GastosUseCase } from './application/gastos.use-case';
import { CAMBIO, FINANCEIRO } from './domain/financeiro.port';
import { GASTOS } from './domain/gasto.port';
import { FrankfurterCambio } from './infrastructure/cambio/frankfurter-cambio.adapter';
import { FinanceiroPgRepositorio } from './infrastructure/persistence/financeiro-pg.repositorio';
import { GastosPgRepositorio } from './infrastructure/persistence/gastos-pg.repositorio';
import { FinanceiroController } from './interface/http/financeiro.controller';
import { GastosController } from './interface/http/gastos.controller';

@Module({
  imports: [IdentidadeModule],
  controllers: [FinanceiroController, GastosController],
  providers: [
    FinanceiroUseCase,
    GastosUseCase,
    { provide: 'FRANKFURTER_URL', useValue: process.env.FRANKFURTER_URL ?? 'https://api.frankfurter.app' },
    { provide: CAMBIO, useClass: FrankfurterCambio },
    { provide: FINANCEIRO, useClass: FinanceiroPgRepositorio },
    { provide: GASTOS, useClass: GastosPgRepositorio },
  ],
  exports: [FinanceiroUseCase, GastosUseCase],
})
export class FinanceiroModule {}
