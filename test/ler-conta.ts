import { DataSource } from 'typeorm';

export interface ContaLida {
  status: string;
  password_hash: string | null;
  display_name: string | null;
  attempts: number;
  code_hash: string | null;
}

export async function lerConta(dados: DataSource, email: string): Promise<ContaLida | null> {
  const linhas = await dados.query<ContaLida[]>(
    `SELECT u.status, u.password_hash, p.display_name,
            COALESCE(c.attempts, 0)::int AS attempts, c.code_hash
     FROM identity.users u
     LEFT JOIN identity.user_profiles p ON p.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT attempts, code_hash
       FROM identity.user_verification_codes
       WHERE user_id = u.id AND purpose = 'sign_up' AND used_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1
     ) c ON true
     WHERE lower(u.email) = lower($1) AND u.deleted_at IS NULL`,
    [email],
  );
  const linha = linhas[0];
  if (!linha) return null;
  return { ...linha, attempts: Number(linha.attempts) };
}

export async function contarContas(dados: DataSource, email: string): Promise<number> {
  const linhas = await dados.query<{ total: string }[]>(
    `SELECT count(*)::text AS total FROM identity.users WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
    [email],
  );
  return Number(linhas[0]?.total ?? 0);
}
