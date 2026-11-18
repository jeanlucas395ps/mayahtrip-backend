import { Module } from '@nestjs/common';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { IdentidadeModule } from '../identidade/identidade.module';
import { ComprasUseCase } from './application/compras.use-case';
import { DocumentosUseCase } from './application/documentos.use-case';
import { MalaUseCase } from './application/mala.use-case';
import { COMPRAS } from './domain/compras.port';
import { DOCUMENTOS } from './domain/documentos.port';
import { MALA } from './domain/mala.port';
import { ComprasPgRepositorio } from './infrastructure/persistence/compras-pg.repositorio';
import { DocumentosPgRepositorio } from './infrastructure/persistence/documentos-pg.repositorio';
import { MalaPgRepositorio } from './infrastructure/persistence/mala-pg.repositorio';
import { ComprasController } from './interface/http/compras.controller';
import { DocumentosController } from './interface/http/documentos.controller';
import { MalaController } from './interface/http/mala.controller';

@Module({
  imports: [IdentidadeModule, FinanceiroModule],
  controllers: [MalaController, ComprasController, DocumentosController],
  providers: [
    MalaUseCase,
    ComprasUseCase,
    DocumentosUseCase,
    { provide: MALA, useClass: MalaPgRepositorio },
    { provide: COMPRAS, useClass: ComprasPgRepositorio },
    { provide: DOCUMENTOS, useClass: DocumentosPgRepositorio },
  ],
})
export class OrganizacaoModule {}
