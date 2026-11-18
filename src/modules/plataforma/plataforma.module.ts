import { Inject, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { IdentidadeModule } from '../identidade/identidade.module';
import { PlataformaUseCase } from './application/plataforma.use-case';
import { PlataformaController } from './interface/http/plataforma.controller';

@Injectable()
class ExpiracaoDiaria implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(@Inject(PlataformaUseCase) private readonly plataforma: PlataformaUseCase) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.plataforma.expirar().catch(() => undefined);
    }, 24 * 60 * 60 * 1000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

@Module({
  imports: [IdentidadeModule, AdminModule],
  controllers: [PlataformaController],
  providers: [PlataformaUseCase, ExpiracaoDiaria],
})
export class PlataformaModule implements OnModuleInit {
  private readonly log = new Logger(PlataformaModule.name);

  constructor(@Inject(PlataformaUseCase) private readonly plataforma: PlataformaUseCase) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.plataforma.garantirFontes();
    } catch (erro) {
      this.log.warn(`Fontes não foram preparadas: ${erro instanceof Error ? erro.name : 'erro'}`);
    }
  }
}
