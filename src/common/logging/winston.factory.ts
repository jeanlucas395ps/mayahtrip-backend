import { utilities as nestWinstonUtilities, WinstonModule } from 'nest-winston';
import * as winston from 'winston';

/**
 * Log estruturado em JSON (DEVELOPMENT.md §11). Em desenvolvimento usa um
 * formato legível no terminal; em produção, JSON puro para o Loki/Alloy.
 */
export function createLogger(environment: string) {
  const isDevelopment = environment !== 'production';

  return WinstonModule.createLogger({
    level: isDevelopment ? 'debug' : 'info',
    format: isDevelopment
      ? winston.format.combine(
          winston.format.timestamp(),
          nestWinstonUtilities.format.nestLike('mayahtrip-backend', {
            colors: true,
            prettyPrint: true,
          }),
        )
      : winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [new winston.transports.Console()],
  });
}
