import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry } from '@prometheus-io/client';

/**
 * DEVELOPMENT.md §11: métrica do próprio processo exposta para o
 * Prometheus desde o primeiro endpoint (latência, taxa de erro).
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duração das requisições HTTP, em segundos.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });

  readonly httpRequestErrors = new Counter({
    name: 'http_request_errors_total',
    help: 'Total de requisições HTTP que terminaram em erro (status >= 400).',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });

  observeRequest(method: string, route: string, statusCode: number, durationSeconds: number): void {
    const labels = { method, route, status_code: String(statusCode) };
    this.httpRequestDuration.observe(labels, durationSeconds);

    if (statusCode >= 400) {
      this.httpRequestErrors.inc(labels);
    }
  }

  async metricsText(): Promise<string> {
    return this.registry.metrics();
  }
}
