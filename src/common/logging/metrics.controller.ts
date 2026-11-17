import { Controller, Get, Header, Inject, VERSION_NEUTRAL } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { MetricsService } from './metrics.service';

/** Scrape do Prometheus (OBSERVABILITY.md). Fora da versão da API de produto. */
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
export class MetricsController {
  constructor(@Inject(MetricsService) private readonly metrics: MetricsService) {}

  @Get()
  @SkipThrottle()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async get(): Promise<string> {
    return this.metrics.metricsText();
  }
}
