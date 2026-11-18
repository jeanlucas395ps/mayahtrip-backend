import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MigrationInterface, QueryRunner } from 'typeorm';

const SCHEMAS = [
  'platform',
  'integration',
  'moderation',
  'ingestion',
  'admin',
  'maya',
  'subscription',
  'notification',
  'community',
  'organization',
  'finance',
  'itinerary',
  'travel',
  'catalog',
  'geography',
  'identity',
];

/**
 * Aplica o modelo fechado em mayahtrip-base/.docs/TECH/mayahtrip.sql.
 * As tabelas antigas de conta e sessão, no schema public, continuam.
 * Elas são a identidade que a API já executa.
 */
export class ModeloProduto1794852431568 implements MigrationInterface {
  name = 'ModeloProduto1794852431568';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const arquivo = join(dirname(fileURLToPath(import.meta.url)), 'modelo-produto.sql');
    const sql = readFileSync(arquivo, 'utf8');
    await queryRunner.query(sql);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const schema of SCHEMAS) {
      await queryRunner.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
  }
}
