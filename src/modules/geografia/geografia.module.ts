import { Module } from '@nestjs/common';
import { IdentidadeModule } from '../identidade/identidade.module';
import { GeografiaUseCase } from './application/geografia.use-case';
import { GEOGRAFIA } from './domain/ports/geografia.port';
import { GeografiaPgRepositorio } from './infrastructure/persistence/geografia-pg.repositorio';
import { GeografiaController } from './interface/http/geografia.controller';

@Module({
  imports: [IdentidadeModule],
  controllers: [GeografiaController],
  providers: [GeografiaUseCase, { provide: GEOGRAFIA, useClass: GeografiaPgRepositorio }],
})
export class GeografiaModule {}
