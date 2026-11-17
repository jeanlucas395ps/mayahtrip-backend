import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Conta } from '../../../domain/entities/conta.entity';
import { CodigoVerificacao } from '../../../domain/value-objects/codigo-verificacao.vo';
import { Email } from '../../../domain/value-objects/email.vo';
import { ContaOrmEntity } from '../entities/conta.orm-entity';
import { ContaTypeOrmRepositorio } from './conta-typeorm.repositorio';

/**
 * Teste de integração real contra o Postgres do Compose local
 * (`127.0.0.1:5432`, ver `plan/sign-up-api-plan.md`). Sem mock de banco.
 */
describe('ContaTypeOrmRepositorio (integração, Postgres real)', () => {
  let repositorio: ContaTypeOrmRepositorio;
  let repositorioOrm: Repository<ContaOrmEntity>;

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
          entities: [ContaOrmEntity],
          synchronize: false,
        }),
        TypeOrmModule.forFeature([ContaOrmEntity]),
      ],
      providers: [ContaTypeOrmRepositorio],
    }).compile();

    repositorio = moduloDeTeste.get(ContaTypeOrmRepositorio);
    repositorioOrm = moduloDeTeste.get(getRepositoryToken(ContaOrmEntity));
  });

  afterAll(async () => {
    await repositorioOrm.manager.connection.destroy();
  });

  it('salva uma conta pendente e consegue encontrá-la por e-mail depois', async () => {
    const emailUnico = `teste-${randomUUID()}@exemplo.com`;
    const email = new Email(emailUnico);
    const agora = new Date();
    const codigo = CodigoVerificacao.gerar(agora, 10);

    const conta = Conta.criarPendente({
      id: randomUUID(),
      nome: 'Pessoa de Teste',
      email,
      hashSenha: 'hash-nao-interessa-neste-teste',
      codigoVerificacao: codigo,
      criadaEm: agora,
    });

    await repositorio.salvar(conta);

    const existe = await repositorio.existePorEmail(email);
    expect(existe).toBe(true);

    const linha = await repositorioOrm.findOne({ where: { email: emailUnico } });
    expect(linha?.estado).toBe('pendente');
    expect(linha?.codigoVerificacao).toBe(codigo.valor);
    expect(linha?.hashSenha).toBe('hash-nao-interessa-neste-teste');
  });

  it('existePorEmail devolve falso para um e-mail nunca cadastrado', async () => {
    const existe = await repositorio.existePorEmail(new Email(`nunca-existiu-${randomUUID()}@exemplo.com`));
    expect(existe).toBe(false);
  });
});
