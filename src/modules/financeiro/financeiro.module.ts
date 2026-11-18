import { Module } from '@nestjs/common';
import { IdentidadeModule } from '../identidade/identidade.module';
import { FinanceiroUseCase } from './application/financeiro.use-case';
import { FINANCEIRO } from './domain/financeiro.port';
import { FinanceiroPgRepositorio } from './infrastructure/persistence/financeiro-pg.repositorio';
import { FinanceiroController } from './interface/http/financeiro.controller';

@Module({
  imports: [IdentidadeModule],
  controllers: [FinanceiroController],
  providers: [FinanceiroUseCase, { provide: FINANCEIRO, useClass: FinanceiroPgRepositorio }],
  exports: [FinanceiroUseCase],
})
export class FinanceiroModule {}
