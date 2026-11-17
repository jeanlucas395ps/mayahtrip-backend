import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Specs 043, 044 e 047. ADR 0001: código, sessão e handoff no Postgres.
 */
export class IdentidadeSessaoHandoff1794852431567 implements MigrationInterface {
  name = 'IdentidadeSessaoHandoff1794852431567';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "conta" ADD "tentativas_codigo" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "conta" ADD "google_sub" varchar(255)`);
    await queryRunner.query(`ALTER TABLE "conta" ADD "origem" varchar(20) NOT NULL DEFAULT 'senha'`);
    await queryRunner.query(`ALTER TABLE "conta" ALTER COLUMN "hash_senha" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "conta" ALTER COLUMN "codigo_verificacao" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "conta" ALTER COLUMN "codigo_gerado_em" DROP NOT NULL`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_conta_google_sub" ON "conta" ("google_sub") WHERE "google_sub" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "sessao" (
        "id" uuid NOT NULL,
        "conta_id" uuid NOT NULL,
        "familia_id" uuid NOT NULL,
        "hash_refresh" varchar(64) NOT NULL,
        "access_jti" uuid NOT NULL,
        "manter_conectado" boolean NOT NULL,
        "expira_em" timestamptz NOT NULL,
        "consumida_em" timestamptz,
        "revogada" boolean NOT NULL DEFAULT false,
        "criada_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sessao" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sessao_conta" FOREIGN KEY ("conta_id") REFERENCES "conta"("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_sessao_hash_refresh" ON "sessao" ("hash_refresh")`);
    await queryRunner.query(`CREATE INDEX "IDX_sessao_familia" ON "sessao" ("familia_id")`);

    await queryRunner.query(`
      CREATE TABLE "codigo_handoff" (
        "id" uuid NOT NULL,
        "conta_id" uuid NOT NULL,
        "hash_codigo" varchar(64) NOT NULL,
        "expira_em" timestamptz NOT NULL,
        "usado_em" timestamptz,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_codigo_handoff" PRIMARY KEY ("id"),
        CONSTRAINT "FK_handoff_conta" FOREIGN KEY ("conta_id") REFERENCES "conta"("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_handoff_hash" ON "codigo_handoff" ("hash_codigo")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "codigo_handoff"`);
    await queryRunner.query(`DROP TABLE "sessao"`);
    await queryRunner.query(`DROP INDEX "IDX_conta_google_sub"`);
    await queryRunner.query(`ALTER TABLE "conta" DROP COLUMN "origem"`);
    await queryRunner.query(`ALTER TABLE "conta" DROP COLUMN "google_sub"`);
    await queryRunner.query(`ALTER TABLE "conta" DROP COLUMN "tentativas_codigo"`);
    await queryRunner.query(`ALTER TABLE "conta" ALTER COLUMN "hash_senha" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "conta" ALTER COLUMN "codigo_verificacao" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "conta" ALTER COLUMN "codigo_gerado_em" SET NOT NULL`);
  }
}
