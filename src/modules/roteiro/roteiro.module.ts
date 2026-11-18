import { Module } from '@nestjs/common';
import { IdentidadeModule } from '../identidade/identidade.module';
import { RoteiroUseCase } from './application/roteiro.use-case';
import { ROTEIRO } from './domain/roteiro.port';
import { RoteiroPgRepositorio } from './infrastructure/persistence/roteiro-pg.repositorio';
import { RoteiroController } from './interface/http/roteiro.controller';

@Module({
  imports: [IdentidadeModule],
  controllers: [RoteiroController],
  providers: [RoteiroUseCase, { provide: ROTEIRO, useClass: RoteiroPgRepositorio }],
})
export class RoteiroModule {}
