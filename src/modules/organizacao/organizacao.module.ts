import { Module } from '@nestjs/common';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { IdentidadeModule } from '../identidade/identidade.module';
import { ComprasUseCase } from './application/compras.use-case';
import { MalaUseCase } from './application/mala.use-case';
import { COMPRAS } from './domain/compras.port';
import { MALA } from './domain/mala.port';
import { ComprasPgRepositorio } from './infrastructure/persistence/compras-pg.repositorio';
import { MalaPgRepositorio } from './infrastructure/persistence/mala-pg.repositorio';
import { ComprasController } from './interface/http/compras.controller';
import { MalaController } from './interface/http/mala.controller';

@Module({
  imports: [IdentidadeModule, FinanceiroModule],
  controllers: [MalaController, ComprasController],
  providers: [
    MalaUseCase,
    ComprasUseCase,
    { provide: MALA, useClass: MalaPgRepositorio },
    { provide: COMPRAS, useClass: ComprasPgRepositorio },
  ],
})
export class OrganizacaoModule {}
