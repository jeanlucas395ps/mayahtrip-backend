import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `db-use-migrations` (nestjs-best-practices) / ADR
 * `0001-identidade-tokens-persistencia.md`: toda mudança de schema é uma
 * migration, nunca `synchronize`. `confirm-account-api` (próxima spec)
 * vai alterar esta tabela (ex.: contador de tentativas) numa migration
 * nova, não nesta.
 */
export class CriarTabelaConta1794852431566 implements MigrationInterface {
  name = 'CriarTabelaConta1794852431566';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "conta" (
        "id" uuid NOT NULL,
        "nome" varchar(100) NOT NULL,
        "email" varchar(255) NOT NULL,
        "hash_senha" varchar(255) NOT NULL,
        "codigo_verificacao" varchar(4) NOT NULL,
        "codigo_gerado_em" timestamptz NOT NULL,
        "estado" varchar(20) NOT NULL,
        "criada_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conta" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_conta_email" ON "conta" ("email")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_conta_email"`);
    await queryRunner.query(`DROP TABLE "conta"`);
  }
}
