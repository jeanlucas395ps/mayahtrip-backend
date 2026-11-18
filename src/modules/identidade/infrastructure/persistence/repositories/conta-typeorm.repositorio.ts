import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Conta, OrigemConta } from '../../../domain/entities/conta.entity';
import { ContaRepositorio } from '../../../domain/ports/conta-repositorio.port';
import { Email } from '../../../domain/value-objects/email.vo';
import { CodigoVerificacao, hashDeCodigo } from '../../../domain/value-objects/codigo-verificacao.vo';

const TTL_CODIGO_MINUTOS = 10;

interface LinhaConta {
  id: string;
  email: string;
  password_hash: string | null;
  status: 'pending' | 'active' | 'inactive';
  created_at: Date;
  display_name: string | null;
  code_hash: string | null;
  last_sent_at: Date | null;
  attempts: number | null;
  provider_user_id: string | null;
}

/**
 * Persiste a conta em identity.users e nas tabelas irmãs.
 * O código de 4 dígitos fica só como sha256.
 */
@Injectable()
export class ContaTypeOrmRepositorio implements ContaRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async existePorEmail(email: Email): Promise<boolean> {
    const linhas = await this.dados.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM identity.users WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
      [email.valor],
    );
    return Number(linhas[0]?.total ?? 0) > 0;
  }

  async buscarPorEmail(email: Email): Promise<Conta | null> {
    const linhas = await this.dados.query<LinhaConta[]>(`${consulta} WHERE lower(u.email) = lower($1) AND u.deleted_at IS NULL AND u.status <> 'inactive'`, [
      email.valor,
    ]);
    return linhas[0] ? paraDominio(linhas[0]) : null;
  }

  async buscarPorGoogleSub(googleSub: string): Promise<Conta | null> {
    const linhas = await this.dados.query<LinhaConta[]>(
      `${consulta} WHERE g.provider_user_id = $1 AND u.deleted_at IS NULL AND u.status <> 'inactive'`,
      [googleSub],
    );
    return linhas[0] ? paraDominio(linhas[0]) : null;
  }

  async salvar(conta: Conta): Promise<Conta> {
    const codigo = conta.codigoVerificacao;
    const status = conta.estado === 'confirmada' ? 'active' : 'pending';
    const username = usernameDe(conta.email.valor, conta.id);

    await this.dados.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO identity.users (id, email, password_hash, status, email_verified_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4::identity.user_status, CASE WHEN $5 = 'active' THEN now() ELSE NULL END, $6, now())
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash,
           status = EXCLUDED.status,
           email_verified_at = COALESCE(identity.users.email_verified_at, EXCLUDED.email_verified_at),
           updated_at = now()`,
        [conta.id, conta.email.valor, conta.obterHashSenhaParaPersistencia(), status, status, conta.criadaEm],
      );
      await tx.query(
        `INSERT INTO identity.user_profiles (user_id, display_name, username)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()`,
        [conta.id, conta.nome.slice(0, 120), username],
      );
      await tx.query(
        `INSERT INTO identity.user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
        [conta.id],
      );
      if (conta.googleSub) {
        await tx.query(
          `INSERT INTO identity.user_auth_providers (user_id, provider, provider_user_id)
           VALUES ($1, 'google', $2)
           ON CONFLICT (provider, provider_user_id) DO NOTHING`,
          [conta.id, conta.googleSub],
        );
      }
      await tx.query(
        `DELETE FROM identity.user_verification_codes WHERE user_id = $1 AND purpose = 'sign_up' AND used_at IS NULL`,
        [conta.id],
      );
      if (codigo) {
        const usado = conta.estado === 'confirmada' ? new Date() : null;
        await tx.query(
          `INSERT INTO identity.user_verification_codes
             (user_id, code_hash, purpose, attempts, expires_at, last_sent_at, used_at)
           VALUES ($1, $2, 'sign_up', $3, $4, $5, $6)`,
          [
            conta.id,
            hashParaGravar(codigo.valor),
            conta.tentativasCodigo,
            new Date(codigo.geradoEm.getTime() + TTL_CODIGO_MINUTOS * 60_000),
            codigo.geradoEm,
            usado,
          ],
        );
      }
    });

    return conta;
  }
}

const consulta = `
  SELECT u.id, u.email, u.password_hash, u.status, u.created_at,
         p.display_name,
         c.code_hash, c.last_sent_at, c.attempts,
         g.provider_user_id
  FROM identity.users u
  LEFT JOIN identity.user_profiles p ON p.user_id = u.id
  LEFT JOIN LATERAL (
    SELECT code_hash, last_sent_at, attempts
    FROM identity.user_verification_codes
    WHERE user_id = u.id AND purpose = 'sign_up' AND used_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  ) c ON true
  LEFT JOIN identity.user_auth_providers g ON g.user_id = u.id AND g.provider = 'google'
`;

function paraDominio(linha: LinhaConta): Conta {
  const codigo =
    linha.code_hash && linha.last_sent_at
      ? CodigoVerificacao.reconstituir(linha.code_hash, new Date(linha.last_sent_at), TTL_CODIGO_MINUTOS)
      : null;
  const origem: OrigemConta = linha.provider_user_id ? 'google' : 'senha';
  return Conta.reconstituir({
    id: linha.id,
    nome: linha.display_name ?? linha.email,
    email: new Email(linha.email),
    hashSenha: linha.password_hash,
    codigoVerificacao: codigo,
    estado: linha.status === 'active' ? 'confirmada' : 'pendente',
    criadaEm: new Date(linha.created_at),
    tentativasCodigo: linha.attempts ?? 0,
    googleSub: linha.provider_user_id,
    origem,
  });
}

function hashParaGravar(valor: string): string {
  return /^[0-9a-f]{64}$/.test(valor) ? valor : hashDeCodigo(valor);
}

export function usernameDe(email: string, id: string): string {
  const local = email.split('@')[0] ?? '';
  const limpo = local.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 60);
  const sufixo = id.replace(/-/g, '').slice(0, 8);
  const base = limpo.length > 0 ? limpo : 'viajante';
  return `${base}.${sufixo}`;
}
