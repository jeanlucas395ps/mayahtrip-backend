import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { IdentidadeModule } from '../identidade/identidade.module';
import { MayaUseCase } from './application/maya.use-case';
import { MayaAdminController } from './interface/http/maya-admin.controller';
import { MayaController } from './interface/http/maya.controller';

@Module({
  imports: [IdentidadeModule, AdminModule],
  controllers: [MayaController, MayaAdminController],
  providers: [MayaUseCase],
})
export class MayaModule {}
