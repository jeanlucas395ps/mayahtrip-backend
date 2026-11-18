import { Module } from '@nestjs/common';
import { IdentidadeModule } from '../identidade/identidade.module';
import { CatalogoUseCase } from './application/catalogo.use-case';
import { CATALOGO } from './domain/ports/catalogo.port';
import { CatalogoPgRepositorio } from './infrastructure/persistence/catalogo-pg.repositorio';
import { CatalogoController } from './interface/http/catalogo.controller';

@Module({
  imports: [IdentidadeModule],
  controllers: [CatalogoController],
  providers: [CatalogoUseCase, { provide: CATALOGO, useClass: CatalogoPgRepositorio }],
})
export class CatalogoModule {}