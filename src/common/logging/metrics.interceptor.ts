import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

/**
 * `di-prefer-constructor-injection` (nestjs-best-practices): `@Inject`
 * explícito mesmo numa classe concreta — `emitDecoratorMetadata` não é
 * honrado por `tsx`/esbuild em desenvolvimento, só por `tsc`/SWC no build;
 * o token explícito funciona nos dois.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(@Inject(MetricsService) private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const start = process.hrtime.bigint();

    const record = () => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      const route = req.route?.path ?? req.path;
      this.metrics.observeRequest(req.method, route, res.statusCode, durationSeconds);
    };

    return next.handle().pipe(tap({ next: record, error: record }));
  }
}
