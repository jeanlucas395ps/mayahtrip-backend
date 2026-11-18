import { Module } from '@nestjs/common';
import { IdentidadeModule } from '../identidade/identidade.module';
import { FinanceiroUseCase } from './application/financeiro.use-case';
import { CAMBIO, FINANCEIRO } from './domain/financeiro.port';
import { FrankfurterCambio } from './infrastructure/cambio/frankfurter-cambio.adapter';
import { FinanceiroPgRepositorio } from './infrastructure/persistence/financeiro-pg.repositorio';
import { FinanceiroController } from './interface/http/financeiro.controller';

@Module({
  imports: [IdentidadeModule],
  controllers: [FinanceiroController],
  providers: [
    FinanceiroUseCase,
    { provide: 'FRANKFURTER_URL', useValue: process.env.FRANKFURTER_URL ?? 'https://api.frankfurter.app' },
    { provide: CAMBIO, useClass: FrankfurterCambio },
    { provide: FINANCEIRO, useClass: FinanceiroPgRepositorio },
  ],
  exports: [FinanceiroUseCase],
})
export class FinanceiroModule {}
