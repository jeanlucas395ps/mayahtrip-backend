import { MigrationInterface, QueryRunner } from 'typeorm';

export class ViagemAtiva1794852431570 implements MigrationInterface {
  name = 'ViagemAtiva1794852431570';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE travel.trips ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE travel.trips DROP COLUMN IF EXISTS is_active`);
  }
}
