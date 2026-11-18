import { Module } from '@nestjs/common';
import { IdentidadeModule } from '../identidade/identidade.module';
import { ViagemUseCase } from './application/viagem.use-case';
import { VIAGEM } from './domain/ports/viagem.port';
import { ViagemPgRepositorio } from './infrastructure/persistence/viagem-pg.repositorio';
import { ViagemController } from './interface/http/viagem.controller';

@Module({
  imports: [IdentidadeModule],
  controllers: [ViagemController],
  providers: [ViagemUseCase, { provide: VIAGEM, useClass: ViagemPgRepositorio }],
})
export class ViagemModule {}
