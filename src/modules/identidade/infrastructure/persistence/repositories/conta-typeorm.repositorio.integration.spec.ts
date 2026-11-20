import { createHash, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Conta } from '../../../domain/entities/conta.entity';
import { CodigoVerificacao } from '../../../domain/value-objects/codigo-verificacao.vo';
import { Email } from '../../../domain/value-objects/email.vo';
import { ContaTypeOrmRepositorio } from './conta-typeorm.repositorio';

describe('ContaTypeOrmRepositorio (integração, Postgres real)', () => {
  let repositorio: ContaTypeOrmRepositorio;
  let dados: DataSource;

  beforeAll(async () => {
    const moduloDeTeste = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST ?? '127.0.0.1',
          port: Number(process.env.DB_PORT ?? 5432),
          username: process.env.DB_USERNAME ?? 'mayahtrip',
          password: process.env.DB_PASSWORD ?? 'mayahtrip',
          database: process.env.DB_NAME ?? 'mayahtrip',
          synchronize: false,
        }),
      ],
      providers: [ContaTypeOrmRepositorio],
    }).compile();

    repositorio = moduloDeTeste.get(ContaTypeOrmRepositorio);
    dados = moduloDeTeste.get(DataSource);
  });

  afterAll(async () => {
    await dados.destroy();
  });

  it('salva uma conta pendente em identity.users e guarda o código só como hash', async () => {
    const emailUnico = `teste-${randomUUID()}@exemplo.com`;
    const email = new Email(emailUnico);
    const agora = new Date();
    const codigo = CodigoVerificacao.gerar(agora, 10);

    const conta = Conta.criarPendente({
      id: randomUUID(),
      nome: 'Pessoa de Teste',
      email,
      username: 'pessoa.teste',
      hashSenha: 'hash-nao-interessa-neste-teste',
      codigoVerificacao: codigo,
      criadaEm: agora,
    });

    await repositorio.salvar(conta);

    expect(await repositorio.existePorEmail(email)).toBe(true);
    const linhas = await dados.query<{ status: string; password_hash: string; code_hash: string }[]>(
      `SELECT u.status, u.password_hash, c.code_hash
       FROM identity.users u
       JOIN identity.user_verification_codes c ON c.user_id = u.id
       WHERE u.email = $1`,
      [emailUnico],
    );
    expect(linhas[0]?.status).toBe('pending');
    expect(linhas[0]?.code_hash).toBe(createHash('sha256').update(codigo.valor).digest('hex'));
    expect(linhas[0]?.code_hash).not.toBe(codigo.valor);
    expect(linhas[0]?.password_hash).toBe('hash-nao-interessa-neste-teste');
  });

  it('existePorEmail devolve falso para um e-mail nunca cadastrado', async () => {
    const existe = await repositorio.existePorEmail(new Email(`nunca-existiu-${randomUUID()}@exemplo.com`));
    expect(existe).toBe(false);
  });
});
