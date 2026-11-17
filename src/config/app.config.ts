import { registerAs } from '@nestjs/config';

export interface AppConfig {
  port: number;
  environment: 'development' | 'production' | 'test';
}

export const appConfig = registerAs('app', (): AppConfig => ({
  port: Number(process.env.PORT ?? 3000),
  environment: (process.env.NODE_ENV as AppConfig['environment']) ?? 'development',
}));
