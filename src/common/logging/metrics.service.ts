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

  /** 048-rate-limit-api: rejeição do guard único, sem id de usuário no rótulo. */
  readonly rejeicoesPorLimite = new Counter({
    name: 'http_rate_limit_rejections_total',
    help: 'Requisições rejeitadas pelo guard único de limite de taxa.',
    registers: [this.registry],
  });

  /** 044-sign-in-api D-7: access token recusado porque o jti está no Redis. */
  readonly rejeicoesPorRevogacao = new Counter({
    name: 'auth_revogacao_rejeicoes_total',
    help: 'Access tokens recusados pela lista de revogação.',
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
