import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export const databaseConfig = registerAs('database', (): DatabaseConfig => ({
  host: process.env.DB_HOST as string,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME as string,
  password: process.env.DB_PASSWORD as string,
  database: process.env.DB_NAME as string,
}));
