import { Module } from '@nestjs/common';
import { IdentidadeModule } from '../identidade/identidade.module';
import { NotificacaoModule } from '../notificacao/notificacao.module';
import { ComunidadeUseCase } from './application/comunidade.use-case';
import { COMUNIDADE } from './domain/comunidade.port';
import { ComunidadePgRepositorio } from './infrastructure/persistence/comunidade-pg.repositorio';
import { ComunidadeController } from './interface/http/comunidade.controller';

@Module({
  imports: [IdentidadeModule, NotificacaoModule],
  controllers: [ComunidadeController],
  providers: [ComunidadeUseCase, { provide: COMUNIDADE, useClass: ComunidadePgRepositorio }],
})
export class ComunidadeModule {}
