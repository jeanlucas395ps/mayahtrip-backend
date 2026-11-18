import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { argon2id, hash } from 'argon2';
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

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe('Comunidade e moderação (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  const armazenamento = new MemoriaArmazenamento();
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    process.env.RATE_LIMIT_LIMITE = '1000';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao, enviarConvite: vi.fn() })
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

  it('publica, marca lugar, guarda a capa, menciona e salva', async () => {
    const autor = await entrar(app, enviarCodigoDeVerificacao);
    const citado = await entrar(app, enviarCodigoDeVerificacao);
    const leitor = await entrar(app, enviarCodigoDeVerificacao);
    const lugarA = await lugar(dados);
    const lugarB = await lugar(dados);
    const criado = await request(app.getHttpServer())
      .post('/v1/posts')
      .set(auth(autor))
      .send({ content: 'Manhã no mercado', visibility: 'public', placeIds: [lugarA, lugarB], mentionIds: [citado.userId] });
    expect(criado.status).toBe(201);
    expect(criado.body.places).toHaveLength(2);
    expect(criado.body.mentions).toEqual([expect.objectContaining({ userId: citado.userId })]);
    const privado = await request(app.getHttpServer())
      .post('/v1/posts')
      .set(auth(autor))
      .send({ content: 'Só eu', visibility: 'private', placeIds: [lugarA] });
    expect(privado.status).toBe(201);
    const capa = await request(app.getHttpServer())
      .post(`/v1/posts/${criado.body.id}/media`)
      .set(auth(autor))
      .field('width', '1')
      .field('height', '1')
      .attach('arquivo', PNG, { filename: 'capa.png', contentType: 'image/png' });
    expect(capa.status).toBe(201);
    expect(JSON.stringify(capa.body)).not.toContain('comunidade/');
    const segunda = await request(app.getHttpServer())
      .post(`/v1/posts/${criado.body.id}/media`)
      .set(auth(autor))
      .field('width', '1')
      .field('height', '1')
      .attach('arquivo', PNG, { filename: 'extra.png', contentType: 'image/png' });
    expect(segunda.status).toBe(201);
    const midias = await dados.query<{ is_cover: boolean; storage_key: string }[]>(
      `SELECT is_cover, storage_key FROM community.post_media WHERE post_id = $1 ORDER BY is_cover DESC`,
      [criado.body.id],
    );
    expect(midias.filter((midia) => midia.is_cover)).toHaveLength(1);
    expect(midias[0].storage_key.startsWith(`comunidade/${criado.body.id}/midia-`)).toBe(true);
    const mencao = await dados.query(`SELECT 1 FROM community.post_mentions WHERE post_id = $1 AND mentioned_user_id = $2`, [criado.body.id, citado.userId]);
    expect(mencao).toHaveLength(1);
    expect((await request(app.getHttpServer()).post(`/v1/posts/${criado.body.id}/save`).set(auth(leitor))).status).toBe(201);
    const salvos = await request(app.getHttpServer()).get('/v1/feed').query({ aba: 'salvos' }).set(auth(leitor));
    expect(salvos.body.map((item: { id: string }) => item.id)).toContain(criado.body.id);
    const salvo = await dados.query(`SELECT 1 FROM community.saved_posts WHERE user_id = $1 AND post_id = $2`, [leitor.userId, criado.body.id]);
    expect(salvo).toHaveLength(1);
    const feed = await request(app.getHttpServer()).get('/v1/feed').set(auth(leitor));
    const ids = feed.body.map((item: { id: string }) => item.id);
    expect(ids).toContain(criado.body.id);
    expect(ids).not.toContain(privado.body.id);
    expect((await request(app.getHttpServer()).post(`/v1/posts/${criado.body.id}/media`).set(auth(autor)).field('width', '1921').field('height', '1').attach('arquivo', PNG, { filename: 'grande.png', contentType: 'image/png' })).status).toBe(400);
  });

  it('avalia o mesmo lugar duas vezes e nasce um post público', async () => {
    const autor = await entrar(app, enviarCodigoDeVerificacao);
    const lugarId = await lugar(dados);
    const primeira = await avaliar(app, autor.access, lugarId, '5', 'Vista boa');
    const segunda = await avaliar(app, autor.access, lugarId, '4', '');
    expect(primeira.status).toBe(201);
    expect(segunda.status).toBe(201);
    expect(primeira.body.origin).toBe('review');
    expect(segunda.body.content).toBe('Sem legenda.');
    expect(JSON.stringify(primeira.body)).not.toContain('comunidade/');
    const linhas = await dados.query<{ rating: number; review_text: string; is_cover: boolean }[]>(
      `SELECT avaliacao.rating, avaliacao.review_text, midia.is_cover
       FROM community.place_reviews avaliacao
       JOIN community.place_review_media midia ON midia.review_id = avaliacao.id
       WHERE avaliacao.place_id = $1 AND avaliacao.user_id = $2
       ORDER BY avaliacao.created_at`,
      [lugarId, autor.userId],
    );
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({ rating: 5, review_text: 'Vista boa', is_cover: true });
    expect(linhas[1].review_text).toBe('Sem legenda.');
    const posts = await dados.query<{ visibility: string; origin: string }[]>(
      `SELECT visibility::text AS visibility, origin::text AS origin FROM community.posts WHERE id = ANY($1::uuid[])`,
      [[primeira.body.id, segunda.body.id]],
    );
    expect(posts.every((post) => post.visibility === 'public' && post.origin === 'review')).toBe(true);
  });

  it('comenta em um nível e curte publicação e comentário', async () => {
    const autor = await entrar(app, enviarCodigoDeVerificacao);
    const leitor = await entrar(app, enviarCodigoDeVerificacao);
    const lugarId = await lugar(dados);
    const post = await request(app.getHttpServer()).post('/v1/posts').set(auth(autor)).send({ visibility: 'public', placeIds: [lugarId], content: 'Praça' });
    const comentario = await request(app.getHttpServer()).post(`/v1/posts/${post.body.id}/comments`).set(auth(leitor)).send({ content: 'Fui ontem' });
    expect(comentario.status).toBe(201);
    const pai = comentario.body[0].id as string;
    const resposta = await request(app.getHttpServer()).post(`/v1/posts/${post.body.id}/comments`).set(auth(autor)).send({ content: 'Volta', parentId: pai });
    expect(resposta.status).toBe(201);
    expect(resposta.body[0].replies).toHaveLength(1);
    expect((await request(app.getHttpServer()).post(`/v1/posts/${post.body.id}/comments`).set(auth(leitor)).send({ content: 'Demais', parentId: resposta.body[0].replies[0].id })).status).toBe(400);
    expect((await request(app.getHttpServer()).post(`/v1/posts/${post.body.id}/likes`).set(auth(leitor))).body.likeCount).toBe(1);
    expect((await request(app.getHttpServer()).delete(`/v1/posts/${post.body.id}/likes`).set(auth(leitor))).body.likeCount).toBe(0);
    expect((await request(app.getHttpServer()).post(`/v1/comments/${pai}/likes`).set(auth(autor))).status).toBe(204);
    const curtidas = await dados.query(`SELECT 1 FROM community.comment_likes WHERE comment_id = $1 AND user_id = $2`, [pai, autor.userId]);
    expect(curtidas).toHaveLength(1);
    const lista = await request(app.getHttpServer()).get(`/v1/posts/${post.body.id}/comments`).set(auth(autor));
    expect(lista.body[0].commentCount).toBeUndefined();
    expect(lista.body[0].likeCount).toBe(1);
    expect((await request(app.getHttpServer()).delete(`/v1/comments/${pai}`).set(auth(autor))).status).toBe(204);
    const apagados = await dados.query<{ deleted_at: Date | null }[]>(`SELECT deleted_at FROM community.comments WHERE post_id = $1`, [post.body.id]);
    expect(apagados.every((linha) => linha.deleted_at)).toBe(true);
    const contagem = await dados.query<{ comments: string }[]>(
      `SELECT (SELECT count(*) FROM community.comments WHERE post_id = $1 AND parent_comment_id IS NULL AND deleted_at IS NULL)::text AS comments`,
      [post.body.id],
    );
    expect(contagem[0].comments).toBe('0');
  });

  it('segue o perfil público e pede o privado', async () => {
    const leitor = await entrar(app, enviarCodigoDeVerificacao);
    const publico = await entrar(app, enviarCodigoDeVerificacao);
    const privado = await entrar(app, enviarCodigoDeVerificacao);
    await dados.query(`UPDATE identity.user_profiles SET visibility = 'private' WHERE user_id = $1`, [privado.userId]);
    expect((await request(app.getHttpServer()).post(`/v1/people/${publico.userId}/follow`).set(auth(leitor))).body.status).toBe('segue');
    const segue = await dados.query(`SELECT 1 FROM community.user_follows WHERE follower_user_id = $1 AND followed_user_id = $2`, [leitor.userId, publico.userId]);
    expect(segue).toHaveLength(1);
    expect((await request(app.getHttpServer()).post(`/v1/people/${privado.userId}/follow`).set(auth(leitor))).body.status).toBe('pedido');
    const antes = await dados.query(`SELECT 1 FROM community.user_follows WHERE follower_user_id = $1 AND followed_user_id = $2`, [leitor.userId, privado.userId]);
    expect(antes).toHaveLength(0);
    expect((await request(app.getHttpServer()).post(`/v1/people/${leitor.userId}/follow-request/accept`).set(auth(privado))).status).toBe(204);
    const pedido = await dados.query<{ status: string }[]>(
      `SELECT status::text AS status FROM community.user_follow_requests WHERE requester_user_id = $1 AND target_user_id = $2`,
      [leitor.userId, privado.userId],
    );
    expect(pedido[0].status).toBe('accepted');
    const depois = await dados.query(`SELECT 1 FROM community.user_follows WHERE follower_user_id = $1 AND followed_user_id = $2`, [leitor.userId, privado.userId]);
    expect(depois).toHaveLength(1);
  });

  it('bloqueia nos dois sentidos e silencia só o feed de quem silenciou', async () => {
    const ana = await entrar(app, enviarCodigoDeVerificacao);
    const bia = await entrar(app, enviarCodigoDeVerificacao);
    const lugarId = await lugar(dados);
    const daAna = await request(app.getHttpServer()).post('/v1/posts').set(auth(ana)).send({ visibility: 'public', placeIds: [lugarId], content: 'Ana' });
    const daBia = await request(app.getHttpServer()).post('/v1/posts').set(auth(bia)).send({ visibility: 'public', placeIds: [lugarId], content: 'Bia' });
    expect((await request(app.getHttpServer()).post(`/v1/people/${bia.userId}/follow`).set(auth(ana))).body.status).toBe('segue');
    expect((await request(app.getHttpServer()).post(`/v1/people/${bia.userId}/mute`).set(auth(ana))).status).toBe(204);
    const silenciada = await request(app.getHttpServer()).get('/v1/feed').set(auth(ana));
    expect(silenciada.body.map((item: { id: string }) => item.id)).not.toContain(daBia.body.id);
    const aindaVe = await request(app.getHttpServer()).get('/v1/feed').set(auth(bia));
    expect(aindaVe.body.map((item: { id: string }) => item.id)).toContain(daAna.body.id);
    const segue = await dados.query(`SELECT 1 FROM community.user_follows WHERE follower_user_id = $1 AND followed_user_id = $2`, [ana.userId, bia.userId]);
    expect(segue).toHaveLength(1);
    expect((await request(app.getHttpServer()).post(`/v1/people/${bia.userId}/block`).set(auth(ana))).status).toBe(204);
    const bloqueio = await dados.query(`SELECT 1 FROM community.user_blocks WHERE blocker_user_id = $1 AND blocked_user_id = $2`, [ana.userId, bia.userId]);
    expect(bloqueio).toHaveLength(1);
    expect(await dados.query(`SELECT 1 FROM community.user_follows WHERE follower_user_id = $1 AND followed_user_id = $2`, [ana.userId, bia.userId])).toHaveLength(0);
    const sumiu = await request(app.getHttpServer()).get('/v1/feed').set(auth(bia));
    expect(sumiu.body.map((item: { id: string }) => item.id)).not.toContain(daAna.body.id);
    const avisos = await dados.query(`SELECT 1 FROM notification.notifications WHERE user_id = $1`, [bia.userId]);
    expect(avisos).toHaveLength(0);
  });

  it('julga a denúncia, avisa só quem denunciou e registra o recurso por e-mail', async () => {
    const autor = await entrar(app, enviarCodigoDeVerificacao);
    const leitor = await entrar(app, enviarCodigoDeVerificacao);
    const operador = await criarAdmin(dados);
    const lugarId = await lugar(dados);
    const post = await request(app.getHttpServer()).post('/v1/posts').set(auth(autor)).send({ visibility: 'public', placeIds: [lugarId], content: 'Golpe' });
    const categorias = await request(app.getHttpServer()).get('/v1/report-categories').set(auth(leitor));
    expect(categorias.body).toHaveLength(6);
    const denuncia = await request(app.getHttpServer()).post('/v1/reports').set(auth(leitor)).send({ categoryId: categorias.body[0].id, postId: post.body.id, description: 'Parece golpe' });
    expect(denuncia.status).toBe(201);
    const entrada = await request(app.getHttpServer()).post('/v1/admin/sign-in').send(operador);
    const admin = { Authorization: `Bearer ${entrada.body.accessToken}` };
    expect((await request(app.getHttpServer()).post(`/v1/admin/reports/${denuncia.body.id}/claim`).set(admin)).status).toBe(204);
    const lida = await request(app.getHttpServer()).get('/v1/admin/reports').query({ status: 'reviewing' }).set(admin);
    expect(lida.body.map((item: { id: string }) => item.id)).toContain(denuncia.body.id);
    const julgada = await request(app.getHttpServer())
      .post(`/v1/admin/reports/${denuncia.body.id}/resolve`)
      .set(admin)
      .send({ decision: 'resolved', removeContent: true, deactivateAccount: true, reason: 'interno' });
    expect(julgada.status).toBe(201);
    expect((await dados.query<{ status: string }[]>(`SELECT status::text AS status FROM community.posts WHERE id = $1`, [post.body.id]))[0].status).toBe('removed');
    expect((await dados.query<{ status: string }[]>(`SELECT status FROM identity.users WHERE id = $1`, [autor.userId]))[0].status).toBe('inactive');
    const acao = await dados.query<{ id: string; action_type: string }[]>(`SELECT id, action_type FROM moderation.moderation_actions WHERE id = $1`, [julgada.body.actionId]);
    expect(acao[0].action_type).toBe('report.resolved');
    const avisos = await dados.query<{ user_id: string; message: string }[]>(`SELECT user_id, message FROM notification.notifications WHERE payload->>'reportId' = $1`, [denuncia.body.id]);
    expect(avisos).toEqual([{ user_id: leitor.userId, message: 'Sua denúncia foi aceita.' }]);
    expect(JSON.stringify(avisos)).not.toContain('interno');
    const recurso = await request(app.getHttpServer()).post('/v1/admin/appeals').set(admin).send({ moderationActionId: julgada.body.actionId, requesterEmail: 'recurso@exemplo.com', reason: 'Não fui eu' });
    expect(recurso.status).toBe(201);
    const gravado = await dados.query<{ channel: string }[]>(`SELECT channel::text AS channel FROM moderation.moderation_appeals WHERE id = $1`, [recurso.body.id]);
    expect(gravado[0].channel).toBe('email');
    expect((await request(app.getHttpServer()).get(`/v1/admin/appeals/${recurso.body.id}`).set(admin)).body.channel).toBe('email');
  });

  it('remove e restaura a publicação sem apagar a curtida', async () => {
    const autor = await entrar(app, enviarCodigoDeVerificacao);
    const leitor = await entrar(app, enviarCodigoDeVerificacao);
    const operador = await criarAdmin(dados);
    const lugarId = await lugar(dados);
    const post = await avaliar(app, autor.access, lugarId, '5', 'Fila');
    expect((await request(app.getHttpServer()).post(`/v1/posts/${post.body.id}/likes`).set(auth(leitor))).body.likeCount).toBe(1);
    const comentario = await request(app.getHttpServer()).post(`/v1/posts/${post.body.id}/comments`).set(auth(leitor)).send({ content: 'Concordo' });
    const entrada = await request(app.getHttpServer()).post('/v1/admin/sign-in').send(operador);
    const admin = { Authorization: `Bearer ${entrada.body.accessToken}` };
    const ficha = await request(app.getHttpServer()).get('/v1/admin/publications').query({ q: 'Fila' }).set(admin);
    const item = ficha.body.find((publicacao: { id: string }) => publicacao.id === post.body.id);
    expect(item.likeCount).toBe(1);
    expect(item.comments[0].content).toBe('Concordo');
    expect((await request(app.getHttpServer()).post(`/v1/admin/publications/${post.body.id}/remove`).set(admin)).status).toBe(204);
    expect((await dados.query<{ status: string }[]>(`SELECT status::text AS status FROM community.place_reviews WHERE post_id = $1`, [post.body.id]))[0].status).toBe('removed');
    expect(await dados.query(`SELECT 1 FROM community.post_likes WHERE post_id = $1`, [post.body.id])).toHaveLength(1);
    expect((await request(app.getHttpServer()).post(`/v1/admin/publications/${post.body.id}/restore`).set(admin)).status).toBe(204);
    expect((await dados.query<{ status: string }[]>(`SELECT status::text AS status FROM community.posts WHERE id = $1`, [post.body.id]))[0].status).toBe('published');
    expect((await request(app.getHttpServer()).post(`/v1/admin/comments/${comentario.body[0].id}/remove`).set(admin)).status).toBe(204);
    expect((await dados.query<{ deleted_at: Date | null }[]>(`SELECT deleted_at FROM community.comments WHERE id = $1`, [comentario.body[0].id]))[0].deleted_at).not.toBeNull();
    expect((await request(app.getHttpServer()).post(`/v1/admin/comments/${comentario.body[0].id}/restore`).set(admin)).status).toBe(204);
  });

  it('revisa o item de fora e tira a publicação do catálogo', async () => {
    const operador = await criarAdmin(dados);
    const fonte = randomUUID();
    const item = randomUUID();
    await dados.query(`INSERT INTO ingestion.content_sources (id, name, source_type) VALUES ($1, $2, 'guide')`, [fonte, `Fonte ${fonte.slice(0, 8)}`]);
    await dados.query(`INSERT INTO ingestion.ingestion_items (id, source_id, title, status) VALUES ($1, $2, 'Guia', 'pending_review')`, [item, fonte]);
    const entrada = await request(app.getHttpServer()).post('/v1/admin/sign-in').send(operador);
    const admin = { Authorization: `Bearer ${entrada.body.accessToken}` };
    const tarefa = await request(app.getHttpServer()).post('/v1/admin/content-reviews').set(admin).send({ ingestionItemId: item });
    expect(tarefa.status).toBe(201);
    const decidida = await request(app.getHttpServer()).post(`/v1/admin/content-reviews/${tarefa.body.id}/decisions`).set(admin).send({ decision: 'approved', reason: 'Cabe no lugar' });
    expect(decidida.body.decision).toBe('approved');
    expect(decidida.body.publicationId).toBeTruthy();
    const publicacao = await dados.query<{ published_at: Date | null }[]>(`SELECT published_at FROM moderation.content_publications WHERE id = $1`, [decidida.body.publicationId]);
    expect(publicacao[0].published_at).not.toBeNull();
    const decisao = await dados.query<{ decision: string }[]>(`SELECT decision::text AS decision FROM moderation.content_review_decisions WHERE task_id = $1`, [tarefa.body.id]);
    expect(decisao[0].decision).toBe('approved');
    const remocao = await request(app.getHttpServer()).post(`/v1/admin/content-publications/${decidida.body.publicationId}/removals`).set(admin).send({ requesterEmail: 'fonte@exemplo.com', reason: 'Licença' });
    expect(remocao.status).toBe(201);
    const pedido = await dados.query<{ status: string }[]>(`SELECT status FROM moderation.content_removal_requests WHERE id = $1`, [remocao.body.id]);
    expect(pedido[0].status).toBe('resolved');
    const itemLido = await dados.query<{ status: string }[]>(`SELECT status::text AS status FROM ingestion.ingestion_items WHERE id = $1`, [item]);
    expect(itemLido[0].status).toBe('removed');
  });
});

async function entrar(app: INestApplication, enviar: ReturnType<typeof vi.fn>): Promise<{ access: string; userId: string }> {
  const email = `comunidade-${randomUUID()}@exemplo.com`;
  expect((await request(app.getHttpServer()).post('/v1/auth/sign-up').send({ nome: 'Pessoa E2E', email, senha: 'umaSenhaForte123', aceitouTermos: true })).status).toBe(202);
  const codigo = enviar.mock.calls.at(-1)?.[0].codigo as string;
  expect((await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo })).status).toBe(200);
  const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
  const dados = app.get(DataSource);
  const usuarios = await dados.query<{ id: string }[]>(`SELECT id FROM identity.users WHERE email = $1`, [email]);
  return { access: login.body.accessToken as string, userId: usuarios[0].id };
}

async function lugar(dados: DataSource): Promise<string> {
  const id = randomUUID();
  const marca = id.slice(0, 8);
  const pais = randomUUID();
  const cidade = randomUUID();
  await dados.query(`INSERT INTO geography.countries (id, name) VALUES ($1, $2)`, [pais, `Pais ${marca}`]);
  await dados.query(`INSERT INTO geography.cities (id, country_id, name) VALUES ($1, $2, $3)`, [cidade, pais, `Cidade ${marca}`]);
  await dados.query(`INSERT INTO catalog.places (id, city_id, slug, name) VALUES ($1, $2, $3, $4)`, [id, cidade, `lugar-${marca}`, `Lugar ${marca}`]);
  return id;
}

function avaliar(app: INestApplication, access: string, placeId: string, rating: string, reviewText: string) {
  return request(app.getHttpServer())
    .post(`/v1/places/${placeId}/reviews`)
    .set({ Authorization: `Bearer ${access}` })
    .field('rating', rating)
    .field('reviewText', reviewText)
    .field('width', '1')
    .field('height', '1')
    .attach('arquivo', PNG, { filename: 'avaliacao.png', contentType: 'image/png' });
}

function auth(pessoa: { access: string }): { Authorization: string } {
  return { Authorization: `Bearer ${pessoa.access}` };
}

async function criarAdmin(dados: DataSource): Promise<{ email: string; senha: string }> {
  const email = `mod-${randomUUID()}@exemplo.com`;
  const senha = 'painel-teste-1';
  await dados.query(`INSERT INTO admin.admin_users (name, email, password_hash) VALUES ('Operador', $1, $2)`, [email, await hash(senha, { type: argon2id })]);
  return { email, senha };
}
