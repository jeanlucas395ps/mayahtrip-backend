import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { ARMAZENAMENTO, ArmazenamentoDeArquivo } from '../src/modules/identidade/domain/ports/armazenamento.port';
import { REMETENTE_DE_EMAIL } from '../src/modules/identidade/domain/ports/remetente-de-email.port';

class MemoriaArmazenamento implements ArmazenamentoDeArquivo {
  readonly objetos = new Map<string, { bytes: Buffer; mime: string }>();

  async guardar(chave: string, bytes: Buffer, mime: string): Promise<void> {
    this.objetos.set(chave, { bytes: Buffer.from(bytes), mime });
  }

  async ler(chave: string): Promise<{ bytes: Buffer; mime: string } | null> {
    return this.objetos.get(chave) ?? null;
  }

  async apagar(chave: string): Promise<void> {
    this.objetos.delete(chave);
  }
}

describe('Perfil (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  const armazenamento = new MemoriaArmazenamento();
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    process.env.RATE_LIMIT_LIMITE = '1000';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao })
      .overrideProvider(ARMAZENAMENTO)
      .useValue(armazenamento)
      .compile();

    app = modulo.createNestApplication();
    prepararAplicacao(app);
    await app.init();
    dados = modulo.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  async function entrar(nome = 'Pessoa E2E'): Promise<{ email: string; access: string }> {
    const email = `perfil-${randomUUID()}@exemplo.com`;
    const cadastro = await request(app.getHttpServer())
      .post('/v1/auth/sign-up')
      .send({ nome, email, senha: 'umaSenhaForte123', aceitouTermos: true });
    expect(cadastro.status).toBe(202);
    const codigo = enviarCodigoDeVerificacao.mock.calls.at(-1)?.[0].codigo as string;
    expect((await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo })).status).toBe(200);
    const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
    expect(login.status).toBe(200);
    return { email, access: login.body.accessToken as string };
  }

  it('grava nome, usuário, cidade, link, bio e visibilidade, e esconde o privado de quem não segue', async () => {
    const dono = await entrar();
    const outro = await entrar('Outra Pessoa');
    const usuario = `ana.${randomUUID().slice(0, 8)}`;
    const semToken = await request(app.getHttpServer()).get('/v1/me/profile');
    expect(semToken.status).toBe(401);

    const inicial = await request(app.getHttpServer()).get('/v1/me/profile').set('Authorization', `Bearer ${dono.access}`);
    expect(inicial.status).toBe(200);
    expect(inicial.body.nome).toBe('Pessoa E2E');
    expect(inicial.body.visibilidade).toBe('publico');
    expect(inicial.body.bio).toBeNull();
    expect(inicial.body.temAvatar).toBe(false);

    const vazio = await request(app.getHttpServer())
      .patch('/v1/me/profile')
      .set('Authorization', `Bearer ${dono.access}`)
      .send({ nome: '', usuario: '@', cidade: '', bio: '' });
    expect(vazio.status).toBe(200);
    expect(vazio.body.usuario).toBe(inicial.body.usuario);
    expect(vazio.body.nome).toBe('Pessoa E2E');

    const salvo = await request(app.getHttpServer())
      .patch('/v1/me/profile')
      .set('Authorization', `Bearer ${dono.access}`)
      .query({ idioma: 'en' })
      .send({
        nome: 'Ana Silva',
        usuario: `@${usuario}`,
        cidade: 'Lisboa',
        link: 'https://ana.example',
        bio: 'Viajo devagar',
      });
    expect(salvo.status).toBe(200);
    expect(salvo.body).toMatchObject({
      nome: 'Ana Silva',
      usuario,
      cidade: 'Lisboa',
      link: 'https://ana.example',
      bio: 'Viajo devagar',
      visibilidade: 'publico',
      conteudoVisivel: true,
    });

    const linha = await lerPerfil(dados, dono.email);
    expect(linha).toMatchObject({
      display_name: 'Ana Silva',
      username: usuario,
      home_city_label: 'Lisboa',
      website_url: 'https://ana.example',
      bio: 'Viajo devagar',
      visibility: 'public',
    });

    const longo = await request(app.getHttpServer())
      .patch('/v1/me/profile')
      .set('Authorization', `Bearer ${dono.access}`)
      .send({ bio: 'a'.repeat(151) });
    expect(longo.status).toBe(400);
    expect(longo.body.message).toContain('150');

    const invalido = await request(app.getHttpServer())
      .patch('/v1/me/profile')
      .set('Authorization', `Bearer ${dono.access}`)
      .send({ usuario: 'ana silva' });
    expect(invalido.status).toBe(400);

    const conflito = await request(app.getHttpServer())
      .patch('/v1/me/profile')
      .set('Authorization', `Bearer ${outro.access}`)
      .send({ usuario: usuario.toUpperCase() });
    expect(conflito.status).toBe(409);

    const publico = await request(app.getHttpServer()).get(`/v1/profiles/${usuario}`);
    expect(publico.status).toBe(200);
    expect(publico.body.bio).toBe('Viajo devagar');

    const privado = await request(app.getHttpServer())
      .patch('/v1/me/profile')
      .set('Authorization', `Bearer ${dono.access}`)
      .send({ visibilidade: 'privado' });
    expect(privado.body.visibilidade).toBe('privado');
    expect((await lerPerfil(dados, dono.email))?.visibility).toBe('private');

    const escondido = await request(app.getHttpServer()).get(`/v1/profiles/${usuario}`);
    expect(escondido.body).toMatchObject({
      nome: 'Ana Silva',
      usuario,
      bio: null,
      cidade: null,
      link: null,
      temAvatar: false,
      conteudoVisivel: false,
    });

    const donoVe = await request(app.getHttpServer())
      .get(`/v1/profiles/${usuario}`)
      .set('Authorization', `Bearer ${dono.access}`);
    expect(donoVe.body.bio).toBe('Viajo devagar');
    expect(donoVe.body.conteudoVisivel).toBe(true);

    await seguir(dados, outro.email, dono.email);
    const seguidorVe = await request(app.getHttpServer())
      .get(`/v1/profiles/${usuario}`)
      .set('Authorization', `Bearer ${outro.access}`);
    expect(seguidorVe.body.bio).toBe('Viajo devagar');
    expect(seguidorVe.body.conteudoVisivel).toBe(true);
  });

  it('recorta a foto no centro, guarda a chave e não entrega o arquivo de um perfil privado', async () => {
    const dono = await entrar();
    const jpeg = await sharp({
      create: { width: 400, height: 200, channels: 3, background: { r: 20, g: 30, b: 40 } },
    })
      .jpeg()
      .toBuffer();

    const texto = await request(app.getHttpServer())
      .post('/v1/me/profile/avatar')
      .set('Authorization', `Bearer ${dono.access}`)
      .attach('arquivo', Buffer.from('nao-e-imagem'), { filename: 'nota.txt', contentType: 'text/plain' });
    expect(texto.status).toBe(400);

    const foto = await request(app.getHttpServer())
      .post('/v1/me/profile/avatar')
      .set('Authorization', `Bearer ${dono.access}`)
      .attach('arquivo', jpeg, { filename: 'foto.jpg', contentType: 'image/jpeg' });
    expect(foto.status).toBe(201);
    expect(foto.body.mensagem).toBe('Foto atualizada.');

    const gravado = await lerPerfil(dados, dono.email);
    expect(gravado?.avatar_storage_key).toMatch(/^avatars\//);
    const objeto = armazenamento.objetos.get(gravado?.avatar_storage_key ?? '');
    const meta = await sharp(objeto?.bytes).metadata();
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);

    const meu = await request(app.getHttpServer()).get('/v1/me/profile').set('Authorization', `Bearer ${dono.access}`);
    const baixado = await request(app.getHttpServer()).get(`/v1/profiles/${meu.body.usuario}/avatar`);
    expect(baixado.status).toBe(200);
    expect(baixado.headers['content-type']).toContain('image/jpeg');

    await request(app.getHttpServer())
      .patch('/v1/me/profile')
      .set('Authorization', `Bearer ${dono.access}`)
      .send({ visibilidade: 'privado' });
    const escondido = await request(app.getHttpServer()).get(`/v1/profiles/${meu.body.usuario}/avatar`);
    expect(escondido.status).toBe(404);
    const proprio = await request(app.getHttpServer())
      .get('/v1/me/profile/avatar')
      .set('Authorization', `Bearer ${dono.access}`);
    expect(proprio.status).toBe(200);
  });
});

interface PerfilLido {
  display_name: string;
  username: string;
  home_city_label: string | null;
  website_url: string | null;
  bio: string | null;
  visibility: string;
  avatar_storage_key: string | null;
}

async function lerPerfil(dados: DataSource, email: string): Promise<PerfilLido | null> {
  const linhas = await dados.query<PerfilLido[]>(
    `SELECT p.display_name, p.username, p.home_city_label, p.website_url, p.bio, p.visibility, p.avatar_storage_key
     FROM identity.user_profiles p
     JOIN identity.users u ON u.id = p.user_id
     WHERE lower(u.email) = lower($1)`,
    [email],
  );
  return linhas[0] ?? null;
}

async function seguir(dados: DataSource, seguidorEmail: string, seguidoEmail: string): Promise<void> {
  await dados.query(
    `INSERT INTO community.user_follows (follower_user_id, followed_user_id)
     SELECT seguidor.id, seguido.id
     FROM identity.users seguidor, identity.users seguido
     WHERE lower(seguidor.email) = lower($1) AND lower(seguido.email) = lower($2)`,
    [seguidorEmail, seguidoEmail],
  );
}
