import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CORRELATION_ID_HEADER, RequestWithCorrelationId } from '../logging/correlation-id.middleware';
import { MetricsService } from '../logging/metrics.service';
import { redact } from '../logging/redact';

/**
 * DEVELOPMENT.md §3: "Erros estáveis para o app, sem stack trace e sem
 * dado interno. Filtro único de exceção." Nenhuma resposta de erro aqui
 * revela detalhe de implementação; o corpo original da exceção é logado
 * (redigido), nunca devolvido por completo ao cliente.
 *
 * `Logger` aqui é a classe do Nest, não winston direto: `main.ts` troca o
 * logger global da aplicação (`app.useLogger`) por um logger winston em
 * JSON, então toda chamada a `this.logger.error(...)` em qualquer parte
 * do código já sai formatada e estruturada, sem acoplamento a winston.
 */
@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(@Inject(MetricsService) private readonly metrics: MetricsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & Partial<RequestWithCorrelationId>>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const bruto = exception instanceof HttpException ? exception.getResponse() : 'Erro interno. Tente novamente mais tarde.';
    const corpo =
      exception instanceof ThrottlerException
        ? { message: 'Limite de taxa excedido.' }
        : typeof bruto === 'string'
          ? { message: bruto }
          : (bruto as Record<string, unknown>);

    if (exception instanceof ThrottlerException) {
      this.metrics.rejeicoesPorLimite.inc();
    }

    const correlationId = request.correlationId ?? request.header(CORRELATION_ID_HEADER) ?? 'desconhecido';

    this.logger.error(
      JSON.stringify({
        correlationId,
        method: request.method,
        path: request.url,
        status,
        exception: redact(
          exception instanceof Error
            ? { name: exception.name, message: exception.message }
            : exception,
        ),
      }),
    );

    response.status(status).json({
      ...corpo,
      statusCode: status,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
