import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

export interface RequestWithCorrelationId extends Request {
  correlationId: string;
}

/**
 * DEVELOPMENT.md §11: correlation id propagado do app à API e aos
 * adaptadores externos. Aceita o id recebido do cliente; gera um novo
 * quando ausente.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(CORRELATION_ID_HEADER);
    const correlationId = incoming && incoming.length > 0 ? incoming : randomUUID();

    (req as RequestWithCorrelationId).correlationId = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    next();
  }
}
