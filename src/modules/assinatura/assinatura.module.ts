import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AdminModule } from '../admin/admin.module';
import { IdentidadeModule } from '../identidade/identidade.module';
import { AssinaturaUseCase } from './application/assinatura.use-case';
import { COBRANCA } from './domain/cobranca.port';
import { AsaasCobranca } from './infrastructure/asaas-cobranca';
import { AssinaturaAdminController } from './interface/http/assinatura-admin.controller';
import { AssinaturaController } from './interface/http/assinatura.controller';

@Module({
  imports: [IdentidadeModule, AdminModule],
  controllers: [AssinaturaController, AssinaturaAdminController],
  providers: [AssinaturaUseCase, { provide: COBRANCA, useClass: AsaasCobranca }],
})
export class AssinaturaModule implements OnModuleInit {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.dados.query(
      `INSERT INTO subscription.payment_method_settings (method, is_enabled)
       VALUES ('credit_card', true), ('boleto', true), ('pix', true)
       ON CONFLICT (method) DO NOTHING`,
    );
  }
}
