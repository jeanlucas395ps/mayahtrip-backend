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
  async guardar(): Promise<void> {}
  async ler(): Promise<null> {
    return null;
  }
  async apagar(): Promise<void> {}
}

describe('Catálogo da mala (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;

  beforeAll(async () => {
    process.env.RATE_LIMIT_LIMITE = '1000';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao: vi.fn().mockResolvedValue({ entregue: true }), enviarConvite: vi.fn() })
      .overrideProvider(ARMAZENAMENTO)
      .useValue(new MemoriaArmazenamento())
      .compile();
    app = modulo.createNestApplication();
    prepararAplicacao(app);
    await app.init();
    dados = modulo.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lê os 30 itens e grava a edição do admin', async () => {
    const operador = await criarAdmin(dados);
    const entrada = await request(app.getHttpServer()).post('/v1/admin/sign-in').send({ email: operador.email, senha: operador.senha });
    const auth = { Authorization: `Bearer ${entrada.body.accessToken}` };
    expect((await request(app.getHttpServer()).get('/v1/admin/packing')).status).toBe(401);
    const lista = await request(app.getHttpServer()).get('/v1/admin/packing').set(auth);
    const nomes = lista.body.flatMap((categoria: { items: { name: string }[] }) => categoria.items.map((item) => item.name));
    expect(nomes).toHaveLength(30);
    expect(nomes).toContain('Passaporte');
    const documentos = lista.body.find((categoria: { name: string }) => categoria.name === 'Documentos');
    const passaporte = documentos.items.find((item: { name: string }) => item.name === 'Passaporte');
    const editado = await request(app.getHttpServer()).patch(`/v1/admin/packing/items/${passaporte.id}`).set(auth).send({
      name: 'Passaporte',
      description: 'Documento de viagem',
      sortOrder: passaporte.sortOrder,
      isDefault: true,
      categoryId: documentos.id,
    });
    expect(editado.status).toBe(200);
    const gravado = await dados.query<{ description: string; total: string }[]>(
      `SELECT i.description, (SELECT count(*)::text FROM organization.packing_catalog_items) AS total
       FROM organization.packing_catalog_items i WHERE i.id = $1`,
      [passaporte.id],
    );
    expect(gravado[0]).toMatchObject({ description: 'Documento de viagem', total: '30' });
    await request(app.getHttpServer()).patch(`/v1/admin/packing/items/${passaporte.id}`).set(auth).send({
      name: 'Passaporte',
      description: '',
      sortOrder: passaporte.sortOrder,
      isDefault: true,
      categoryId: documentos.id,
    });
    expect((await dados.query<{ description: string | null }[]>(`SELECT description FROM organization.packing_catalog_items WHERE id = $1`, [passaporte.id]))[0].description).toBeNull();
  });
});

async function criarAdmin(dados: DataSource): Promise<{ email: string; senha: string }> {
  const email = `mala-${randomUUID()}@exemplo.com`;
  const senha = 'painel-teste-1';
  await dados.query(`INSERT INTO admin.admin_users (name, email, password_hash) VALUES ('Operador', $1, $2)`, [email, await hash(senha, { type: argon2id })]);
  return { email, senha };
}
