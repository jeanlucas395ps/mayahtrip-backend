import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { RELOGIO, Relogio } from '../src/modules/identidade/domain/ports/relogio.port';
import { REMETENTE_DE_EMAIL } from '../src/modules/identidade/domain/ports/remetente-de-email.port';
import { VALIDADOR_TOKEN_GOOGLE } from '../src/modules/identidade/domain/ports/validador-token-google.port';
import { hashDeCodigo } from '../src/modules/identidade/domain/value-objects/codigo-verificacao.vo';

class RelogioControlado implements Relogio {
  constructor(public instante = new Date('2026-11-18T12:00:00.000Z')) {}

  agora(): Date {
    return this.instante;
  }

  avancar(ms: number): void {
    this.instante = new Date(this.instante.getTime() + ms);
  }
}

describe('Sair e senha nova (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  const relogio = new RelogioControlado();
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue({ entregue: true });
  const validarGoogle = vi.fn();

  beforeAll(async () => {
    process.env.RATE_LIMIT_LIMITE = '1000';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao })
      .overrideProvider(RELOGIO)
      .useValue(relogio)
      .overrideProvider(VALIDADOR_TOKEN_GOOGLE)
      .useValue({ validar: validarGoogle })
      .compile();

    app = modulo.createNestApplication();
    prepararAplicacao(app);
    await app.init();
    dados = modulo.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  async function cadastrar(email = `senha-${randomUUID()}@exemplo.com`): Promise<{ email: string; codigo: string }> {
    const resposta = await request(app.getHttpServer())
      .post('/v1/auth/sign-up')
      .send({ nome: 'Pessoa E2E', usuario: email.split('@')[0].replace(/[^a-zA-Z0-9._$#&-]+/g, '').slice(0, 60) || 'viajante', email, senha: 'umaSenhaForte123', aceitouTermos: true });
    expect(resposta.status).toBe(202);
    const codigo = enviarCodigoDeVerificacao.mock.calls.at(-1)?.[0].codigo as string;
    return { email, codigo };
  }

  async function ativar(): Promise<string> {
    const { email, codigo } = await cadastrar();
    const confirmacao = await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo });
    expect(confirmacao.status).toBe(200);
    return email;
  }

  async function entrar(email: string, senha = 'umaSenhaForte123') {
    return request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha });
  }

  it('encerra só a família do refresh apresentado', async () => {
    const email = await ativar();
    const local = await entrar(email);
    const outro = await entrar(email);
    expect(local.status).toBe(200);
    expect(outro.status).toBe(200);

    const cruzado = await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${local.body.accessToken}`)
      .send({ refreshToken: outro.body.refreshToken });
    expect(cruzado.status).toBe(401);

    const saiu = await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${local.body.accessToken}`)
      .send({ refreshToken: local.body.refreshToken });
    expect(saiu.status).toBe(204);

    const localMorta = await request(app.getHttpServer()).post('/v1/auth/refresh').send({ refreshToken: local.body.refreshToken });
    const outraViva = await request(app.getHttpServer()).post('/v1/auth/refresh').send({ refreshToken: outro.body.refreshToken });
    const accessLocal = await request(app.getHttpServer())
      .post('/v1/auth/handoff')
      .set('Authorization', `Bearer ${local.body.accessToken}`);
    const accessOutro = await request(app.getHttpServer())
      .post('/v1/auth/handoff')
      .set('Authorization', `Bearer ${outro.body.accessToken}`);

    expect(localMorta.status).toBe(401);
    expect(outraViva.status).toBe(200);
    expect(accessLocal.status).toBe(401);
    expect(accessOutro.status).toBe(201);
  });

  it('grava o código como hash, troca a senha e derruba as sessões da conta', async () => {
    const email = await ativar();
    const local = await entrar(email);
    const outro = await entrar(email);
    const chamadas = enviarCodigoDeVerificacao.mock.calls.length;

    const pedido = await request(app.getHttpServer()).post('/v1/auth/forgot-password').send({ email, idioma: 'en' });
    expect(pedido.status).toBe(202);
    expect(pedido.body.mensagem).toContain('If an account exists');
    const codigo = enviarCodigoDeVerificacao.mock.calls.at(-1)?.[0].codigo as string;
    const gravado = await lerCodigoSenha(dados, email);
    expect(gravado?.purpose).toBe('password_reset');
    expect(gravado?.code_hash).toBe(hashDeCodigo(codigo));
    expect(gravado?.code_hash).not.toBe(codigo);
    expect(gravado?.used_at).toBeNull();

    const curto = await request(app.getHttpServer())
      .post('/v1/auth/reset-password')
      .send({ email, codigo, senha: 'curta' });
    expect(curto.status).toBe(400);
    expect(JSON.stringify(curto.body)).toContain('pelo menos 8 caracteres');
    expect((await lerCodigoSenha(dados, email))?.used_at).toBeNull();

    const conferencia = await request(app.getHttpServer()).post('/v1/auth/forgot-password/confirm').send({ email, codigo });
    expect(conferencia.status).toBe(204);
    expect((await entrar(email)).status).toBe(200);

    const troca = await request(app.getHttpServer())
      .post('/v1/auth/reset-password')
      .send({ email, codigo, senha: 'senhaNova123', idioma: 'pt-BR' });
    expect(troca.status).toBe(200);
    expect(troca.body.mensagem).toContain('Senha alterada');
    expect((await lerCodigoSenha(dados, email))?.used_at).not.toBeNull();
    expect(enviarCodigoDeVerificacao.mock.calls.length).toBe(chamadas + 1);

    const localMorta = await request(app.getHttpServer()).post('/v1/auth/refresh').send({ refreshToken: local.body.refreshToken });
    const outraMorta = await request(app.getHttpServer()).post('/v1/auth/refresh').send({ refreshToken: outro.body.refreshToken });
    const accessMorto = await request(app.getHttpServer())
      .post('/v1/auth/handoff')
      .set('Authorization', `Bearer ${local.body.accessToken}`);
    expect(localMorta.status).toBe(401);
    expect(outraMorta.status).toBe(401);
    expect(accessMorto.status).toBe(401);
    expect((await entrar(email)).status).toBe(401);
    expect((await entrar(email, 'senhaNova123')).status).toBe(200);
    expect(await sessoesAbertas(dados, email)).toBe(1);
  });

  it('não revela e-mail desconhecido nem conta pendente, e o reenvio obedece os 30 segundos', async () => {
    const chamadas = enviarCodigoDeVerificacao.mock.calls.length;
    const desconhecido = await request(app.getHttpServer())
      .post('/v1/auth/forgot-password')
      .send({ email: `ninguem-${randomUUID()}@exemplo.com` });
    expect(desconhecido.status).toBe(202);
    expect(enviarCodigoDeVerificacao.mock.calls.length).toBe(chamadas);

    const pendente = await cadastrar();
    const semContaAtiva = await request(app.getHttpServer()).post('/v1/auth/forgot-password').send({ email: pendente.email });
    expect(semContaAtiva.status).toBe(202);
    expect(enviarCodigoDeVerificacao.mock.calls.length).toBe(chamadas + 1);

    const email = await ativar();
    await request(app.getHttpServer()).post('/v1/auth/forgot-password').send({ email });
    const codigo = enviarCodigoDeVerificacao.mock.calls.at(-1)?.[0].codigo as string;
    const repetido = await request(app.getHttpServer()).post('/v1/auth/forgot-password').send({ email });
    expect(repetido.status).toBe(202);
    expect(enviarCodigoDeVerificacao.mock.calls.at(-1)?.[0].codigo).toBe(codigo);

    for (let i = 0; i < 5; i += 1) {
      await request(app.getHttpServer()).post('/v1/auth/forgot-password/confirm').send({ email, codigo: '0000' });
    }
    const bloqueado = await request(app.getHttpServer()).post('/v1/auth/forgot-password/confirm').send({ email, codigo });
    expect(bloqueado.status).toBe(400);
    expect(bloqueado.body.tentativasRestantes).toBe(0);
    expect((await lerCodigoSenha(dados, email))?.attempts).toBe(5);

    const cedo = await request(app.getHttpServer()).post('/v1/auth/forgot-password/resend').send({ email });
    expect(cedo.status).toBe(400);
    relogio.avancar(30_000);
    const reenvio = await request(app.getHttpServer()).post('/v1/auth/forgot-password/resend').send({ email, idioma: 'es' });
    expect(reenvio.status).toBe(202);
    const novo = await lerCodigoSenha(dados, email);
    expect(novo?.attempts).toBe(0);
    expect(novo?.code_hash).not.toBe(hashDeCodigo(codigo));
  });

  it('deixa uma conta Google entrar com a senha definida na recuperação', async () => {
    const email = `google-senha-${randomUUID()}@exemplo.com`;
    validarGoogle.mockResolvedValueOnce({ sub: `sub-${randomUUID()}`, email, nome: 'Pessoa Google' });
    expect((await request(app.getHttpServer()).post('/v1/auth/google').send({ token: 'token-valido' })).status).toBe(200);

    await request(app.getHttpServer()).post('/v1/auth/forgot-password').send({ email });
    const codigo = enviarCodigoDeVerificacao.mock.calls.at(-1)?.[0].codigo as string;
    const troca = await request(app.getHttpServer())
      .post('/v1/auth/reset-password')
      .send({ email, codigo, senha: 'senhaNova123' });
    expect(troca.status).toBe(200);
    expect((await entrar(email, 'senhaNova123')).status).toBe(200);
  });
});

interface CodigoSenhaLido {
  purpose: string;
  code_hash: string;
  attempts: number;
  used_at: Date | null;
}

async function lerCodigoSenha(dados: DataSource, email: string): Promise<CodigoSenhaLido | null> {
  const linhas = await dados.query<CodigoSenhaLido[]>(
    `SELECT c.purpose, c.code_hash, c.attempts, c.used_at
     FROM identity.user_verification_codes c
     JOIN identity.users u ON u.id = c.user_id
     WHERE lower(u.email) = lower($1) AND c.purpose = 'password_reset'
     ORDER BY c.created_at DESC
     LIMIT 1`,
    [email],
  );
  const linha = linhas[0];
  if (!linha) return null;
  return { ...linha, attempts: Number(linha.attempts) };
}

async function sessoesAbertas(dados: DataSource, email: string): Promise<number> {
  const linhas = await dados.query<{ total: string }[]>(
    `SELECT count(*)::text AS total
     FROM identity.user_sessions s
     JOIN identity.users u ON u.id = s.user_id
     WHERE lower(u.email) = lower($1) AND s.revoked_at IS NULL AND s.consumed_at IS NULL`,
    [email],
  );
  return Number(linhas[0]?.total ?? 0);
}
