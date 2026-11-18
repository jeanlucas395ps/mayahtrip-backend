import { Module } from '@nestjs/common';
import { IdentidadeModule } from '../identidade/identidade.module';
import { MalaUseCase } from './application/mala.use-case';
import { MALA } from './domain/mala.port';
import { MalaPgRepositorio } from './infrastructure/persistence/mala-pg.repositorio';
import { MalaController } from './interface/http/mala.controller';

@Module({
  imports: [IdentidadeModule],
  controllers: [MalaController],
  providers: [MalaUseCase, { provide: MALA, useClass: MalaPgRepositorio }],
})
export class OrganizacaoModule {}
