import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IdentidadeModule } from '../identidade/identidade.module';
import { NotificacaoUseCase } from './application/notificacao.use-case';
import { linhasDeModelo } from './domain/modelos';
import { NotificacaoController } from './interface/http/notificacao.controller';

@Module({
  imports: [IdentidadeModule],
  controllers: [NotificacaoController],
  providers: [NotificacaoUseCase],
  exports: [NotificacaoUseCase],
})
export class NotificacaoModule implements OnModuleInit {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async onModuleInit(): Promise<void> {
    for (const linha of linhasDeModelo()) {
      await this.dados.query(
        `INSERT INTO notification.notification_templates (event_type, locale, channel, title_template, body_template, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (event_type, locale, channel) DO NOTHING`,
        [linha.eventType, linha.locale, linha.channel, linha.title, linha.body],
      );
    }
  }
}
