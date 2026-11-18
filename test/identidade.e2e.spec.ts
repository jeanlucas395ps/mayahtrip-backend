import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { Relogio } from '../src/modules/identidade/domain/ports/relogio.port';
import { RELOGIO } from '../src/modules/identidade/domain/ports/relogio.port';
import { REMETENTE_DE_EMAIL } from '../src/modules/identidade/domain/ports/remetente-de-email.port';
import { VALIDADOR_TOKEN_GOOGLE } from '../src/modules/identidade/domain/ports/validador-token-google.port';
import { LISTA_DE_REVOGACAO, ListaDeRevogacao } from '../src/modules/identidade/domain/ports/lista-de-revogacao.port';
import { contarContas, lerConta } from './ler-conta';

class RelogioControlado implements Relogio {
  constructor(public instante = new Date('2026-11-17T12:00:00.000Z')) {}

  agora(): Date {
    return this.instante;
  }

  avancar(ms: number): void {
    this.instante = new Date(this.instante.getTime() + ms);
  }
}

describe('Identidade 043, 044 e 047 (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  const relogio = new RelogioControlado();
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue(undefined);
  const validarGoogle = vi.fn();
  let revogacao: ListaDeRevogacao;

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
    revogacao = modulo.get(LISTA_DE_REVOGACAO);
  });

  afterAll(async () => {
    await app.close();
  });

  async function cadastrar(email = `e2e-${randomUUID()}@exemplo.com`): Promise<{ email: string; codigo: string }> {
    const resposta = await request(app.getHttpServer())
      .post('/v1/auth/sign-up')
      .send({ nome: 'Pessoa E2E', email, senha: 'umaSenhaForte123', aceitouTermos: true });
    expect(resposta.status).toBe(202);
    const codigo = enviarCodigoDeVerificacao.mock.calls.at(-1)?.[0].codigo as string;
    return { email, codigo };
  }

  it('AC-1 a AC-3 da confirmação: código certo ativa, errado informa o resto, a 6ª não olha o código', async () => {
    const { email, codigo } = await cadastrar();

    const errado = await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo: '0000' });
    expect(errado.status).toBe(400);
    expect(errado.body.tentativasRestantes).toBe(4);
    expect(errado.body.message).toContain('4 tentativas');

    const certo = await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo });
    expect(certo.status).toBe(200);
    expect((await lerConta(dados, email))?.status).toBe('active');

    const outro = await cadastrar();
    for (let i = 0; i < 5; i += 1) {
      await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email: outro.email, codigo: '0000' });
    }
    const antes = (await lerConta(dados, outro.email))?.attempts;
    const sexta = await request(app.getHttpServer())
      .post('/v1/auth/confirm')
      .send({ email: outro.email, codigo: outro.codigo });
    expect(sexta.status).toBe(400);
    expect(sexta.body.tentativasRestantes).toBe(0);
    expect((await lerConta(dados, outro.email))?.attempts).toBe(antes);
    expect((await lerConta(dados, outro.email))?.status).toBe('pending');
  });

  it('AC-4: código vencido consome uma tentativa', async () => {
    const { email, codigo } = await cadastrar();
    relogio.avancar(10 * 60_000 + 1);
    const vencido = await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo });
    expect(vencido.status).toBe(400);
    expect((await lerConta(dados, email))?.attempts).toBe(1);
    expect((await lerConta(dados, email))?.status).toBe('pending');
  });

  it('AC-5 e AC-6: reenvio antes de 30 s é recusado e no limite zera as tentativas', async () => {
    const { email, codigo } = await cadastrar();
    await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo: '0000' });

    const cedo = await request(app.getHttpServer()).post('/v1/auth/resend-code').send({ email, idioma: 'en' });
    expect(cedo.status).toBe(400);

    relogio.avancar(30_000);
    const reenvio = await request(app.getHttpServer()).post('/v1/auth/resend-code').send({ email, idioma: 'en' });
    expect(reenvio.status).toBe(202);
    const linha = await lerConta(dados, email);
    expect(linha?.attempts).toBe(0);
    expect(linha?.code_hash).not.toBe(codigo);
    expect(enviarCodigoDeVerificacao).toHaveBeenCalledWith(
      expect.objectContaining({ paraEmail: email, idioma: expect.objectContaining({ valor: 'en' }) }),
    );
  });

  it('AC-1 a AC-3 e AC-9 a AC-13 do login, mais o handoff', async () => {
    const { email, codigo } = await cadastrar();
    await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo });

    const pendente = await cadastrar();
    const recusaPendente = await request(app.getHttpServer())
      .post('/v1/auth/sign-in')
      .send({ email: pendente.email, senha: 'umaSenhaForte123' });
    const recusaSenha = await request(app.getHttpServer())
      .post('/v1/auth/sign-in')
      .send({ email, senha: 'senhaErrada1' });
    const recusaInexistente = await request(app.getHttpServer())
      .post('/v1/auth/sign-in')
      .send({ email: `nao-${randomUUID()}@exemplo.com`, senha: 'umaSenhaForte123' });
    expect(recusaPendente.status).toBe(401);
    expect(recusaSenha.body.message).toBe(recusaPendente.body.message);
    expect(recusaSenha.body.statusCode).toBe(recusaPendente.body.statusCode);
    expect(recusaInexistente.body.message).toBe(recusaPendente.body.message);

    const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
    expect(login.status).toBe(200);
    expect(login.body.accessToken).toEqual(expect.any(String));
    expect(login.body.refreshToken).toEqual(expect.any(String));

    const renovado = await request(app.getHttpServer()).post('/v1/auth/refresh').send({ refreshToken: login.body.refreshToken });
    expect(renovado.status).toBe(200);
    expect(renovado.body.refreshToken).not.toBe(login.body.refreshToken);

    const reuso = await request(app.getHttpServer()).post('/v1/auth/refresh').send({ refreshToken: login.body.refreshToken });
    expect(reuso.status).toBe(401);
    const cadeiaRevogada = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: renovado.body.refreshToken });
    expect(cadeiaRevogada.status).toBe(401);

    const lixo = await request(app.getHttpServer()).post('/v1/auth/refresh').send({ refreshToken: 'nao-existe' });
    expect(lixo.status).toBe(401);

    const segundoLogin = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
    await dados.query(`DELETE FROM identity.user_sessions`);
    const handoff = await request(app.getHttpServer())
      .post('/v1/auth/handoff')
      .set('Authorization', `Bearer ${segundoLogin.body.accessToken}`);
    expect(handoff.status).toBe(201);
    expect(handoff.body.codigo).toEqual(expect.any(String));
    expect(JSON.stringify(handoff.body)).not.toContain(segundoLogin.body.accessToken);

    const troca = await request(app.getHttpServer()).post('/v1/auth/handoff/exchange').send({ codigo: handoff.body.codigo });
    expect(troca.status).toBe(200);
    expect(troca.body.accessToken).toEqual(expect.any(String));
    const reusoCodigo = await request(app.getHttpServer()).post('/v1/auth/handoff/exchange').send({ codigo: handoff.body.codigo });
    expect(reusoCodigo.status).toBe(401);

    const payload = JSON.parse(Buffer.from(segundoLogin.body.accessToken.split('.')[1], 'base64url').toString());
    await revogacao.revogar(payload.jti, 60);
    const revogado = await request(app.getHttpServer())
      .post('/v1/auth/handoff')
      .set('Authorization', `Bearer ${segundoLogin.body.accessToken}`);
    expect(revogado.status).toBe(401);
  });

  it('AC-4 a AC-6 do Google: cria, reaproveita e recusa token inválido', async () => {
    const email = `google-${randomUUID()}@exemplo.com`;
    const sub = `sub-${randomUUID()}`;
    validarGoogle.mockResolvedValueOnce({ sub, email, nome: 'Pessoa Google' });
    const primeira = await request(app.getHttpServer()).post('/v1/auth/google').send({ token: 'token-valido' });
    expect(primeira.status).toBe(200);
    expect((await lerConta(dados, email))?.status).toBe('active');
    expect((await lerConta(dados, email))?.password_hash).toBeNull();

    validarGoogle.mockResolvedValueOnce({ sub, email, nome: 'Pessoa Google' });
    const segunda = await request(app.getHttpServer()).post('/v1/auth/google').send({ token: 'token-valido' });
    expect(segunda.status).toBe(200);
    expect(await contarContas(dados, email)).toBe(1);

    validarGoogle.mockResolvedValueOnce(null);
    const invalido = await request(app.getHttpServer()).post('/v1/auth/google').send({ token: 'token-ruim' });
    expect(invalido.status).toBe(401);
  });

  it('AC-5 do handoff: código vencido não cria sessão', async () => {
    const { email, codigo } = await cadastrar();
    await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo });
    const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
    const emitido = await request(app.getHttpServer())
      .post('/v1/auth/handoff')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    relogio.avancar(61_000);
    const troca = await request(app.getHttpServer()).post('/v1/auth/handoff/exchange').send({ codigo: emitido.body.codigo });
    expect(troca.status).toBe(401);
  });
});
