import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { CORRELATION_ID_HEADER, RequestWithCorrelationId } from '../logging/correlation-id.middleware';
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
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & Partial<RequestWithCorrelationId>>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException ? exception.getResponse() : 'Erro interno. Tente novamente mais tarde.';

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
      statusCode: status,
      message: typeof message === 'string' ? message : (message as Record<string, unknown>).message ?? message,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
