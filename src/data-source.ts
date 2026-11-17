import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

config();

/**
 * Fonte de dados usada só pelo CLI do TypeORM (migration:generate/run),
 * fora do contexto do Nest. `db-use-migrations` (nestjs-best-practices):
 * `synchronize` sempre falso aqui.
 */
export const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: ['src/modules/**/infrastructure/persistence/entities/*.entity.ts'],
  migrations: ['src/modules/**/infrastructure/persistence/migrations/*.ts'],
  synchronize: false,
});
