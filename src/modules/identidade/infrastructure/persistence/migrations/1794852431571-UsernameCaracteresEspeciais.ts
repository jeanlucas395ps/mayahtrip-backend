import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Amplia o CHECK de username para # $ & (menções no cadastro/perfil).
 */
export class UsernameCaracteresEspeciais1794852431571 implements MigrationInterface {
  name = 'UsernameCaracteresEspeciais1794852431571';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE identity.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_username_check`);
    await queryRunner.query(`
      ALTER TABLE identity.user_profiles
      ADD CONSTRAINT user_profiles_username_check CHECK (
        char_length(username) BETWEEN 1 AND 80
        AND username ~ '^[[:alpha:][:digit:]#._$&-]+$'
      )
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN identity.user_profiles.username IS
        'Único sem distinguir maiúscula. Letras, números e # . _ - $ &. O @ digitado no início é removido na API.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE identity.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_username_check`);
    await queryRunner.query(`
      ALTER TABLE identity.user_profiles
      ADD CONSTRAINT user_profiles_username_check CHECK (
        char_length(username) BETWEEN 1 AND 80
        AND username ~ '^[[:alpha:][:digit:]._-]+$'
      )
    `);
  }
}
