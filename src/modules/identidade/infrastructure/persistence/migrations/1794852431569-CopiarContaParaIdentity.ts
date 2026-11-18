import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Copia a identidade que a API já gravou em public.conta, sessao e
 * codigo_handoff para o schema identity. As tabelas antigas permanecem
 * até o corte seguinte confirmar que nada mais as lê.
 */
export class CopiarContaParaIdentity1794852431569 implements MigrationInterface {
  name = 'CopiarContaParaIdentity1794852431569';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO identity.users (id, email, password_hash, status, email_verified_at, created_at, updated_at)
      SELECT id, lower(email), hash_senha,
             CASE WHEN estado = 'confirmada' THEN 'active'::identity.user_status ELSE 'pending'::identity.user_status END,
             CASE WHEN estado = 'confirmada' THEN criada_em ELSE NULL END,
             criada_em, criada_em
      FROM conta
      ON CONFLICT (id) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO identity.user_profiles (user_id, display_name, username)
      SELECT c.id,
             c.nome,
             CASE
               WHEN regexp_replace(lower(split_part(c.email, '@', 1)), '[^a-z0-9._-]', '', 'g') = ''
                 THEN 'viajante.' || substr(replace(c.id::text, '-', ''), 1, 8)
               ELSE left(regexp_replace(lower(split_part(c.email, '@', 1)), '[^a-z0-9._-]', '', 'g'), 60)
                    || '.' || substr(replace(c.id::text, '-', ''), 1, 8)
             END
      FROM conta c
      ON CONFLICT (user_id) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO identity.user_preferences (user_id)
      SELECT id FROM conta
      ON CONFLICT (user_id) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO identity.user_auth_providers (user_id, provider, provider_user_id, created_at)
      SELECT id, 'google', google_sub, criada_em
      FROM conta
      WHERE google_sub IS NOT NULL
      ON CONFLICT (provider, provider_user_id) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO identity.user_verification_codes
        (user_id, code_hash, purpose, attempts, expires_at, last_sent_at)
      SELECT id, encode(digest(codigo_verificacao, 'sha256'), 'hex'), 'sign_up', tentativas_codigo,
             codigo_gerado_em + interval '10 minutes', codigo_gerado_em
      FROM conta
      WHERE codigo_verificacao IS NOT NULL AND codigo_gerado_em IS NOT NULL
    `);
    await queryRunner.query(`
      INSERT INTO identity.user_sessions
        (id, user_id, family_id, refresh_token_hash, keep_signed_in, expires_at, consumed_at, revoked_at, created_at)
      SELECT id, conta_id, familia_id, hash_refresh, manter_conectado, expira_em, consumida_em,
             CASE WHEN revogada THEN now() ELSE NULL END, criada_em
      FROM sessao
      ON CONFLICT (id) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO identity.user_handoff_codes (id, user_id, code_hash, expires_at, used_at, created_at)
      SELECT id, conta_id, hash_codigo, expira_em, usado_em, criado_em
      FROM codigo_handoff
      ON CONFLICT (id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM identity.user_handoff_codes WHERE id IN (SELECT id FROM codigo_handoff)`);
    await queryRunner.query(`DELETE FROM identity.user_sessions WHERE id IN (SELECT id FROM sessao)`);
    await queryRunner.query(`DELETE FROM identity.user_verification_codes WHERE user_id IN (SELECT id FROM conta)`);
    await queryRunner.query(`DELETE FROM identity.user_auth_providers WHERE user_id IN (SELECT id FROM conta)`);
    await queryRunner.query(`DELETE FROM identity.user_preferences WHERE user_id IN (SELECT id FROM conta)`);
    await queryRunner.query(`DELETE FROM identity.user_profiles WHERE user_id IN (SELECT id FROM conta)`);
    await queryRunner.query(`DELETE FROM identity.users WHERE id IN (SELECT id FROM conta)`);
  }
}
