import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conta } from '../../../domain/entities/conta.entity';
import { ContaRepositorio } from '../../../domain/ports/conta-repositorio.port';
import { Email } from '../../../domain/value-objects/email.vo';
import { CodigoVerificacao } from '../../../domain/value-objects/codigo-verificacao.vo';
import { ContaOrmEntity } from '../entities/conta.orm-entity';

const TTL_CODIGO_MINUTOS = 10;

/**
 * `arch-use-repository-pattern` (nestjs-best-practices): adapter que
 * implementa a porta de domínio; nenhuma outra camada conhece TypeORM.
 */
@Injectable()
export class ContaTypeOrmRepositorio implements ContaRepositorio {
  constructor(
    @InjectRepository(ContaOrmEntity)
    private readonly repositorioOrm: Repository<ContaOrmEntity>,
  ) {}

  async existePorEmail(email: Email): Promise<boolean> {
    const total = await this.repositorioOrm.count({ where: { email: email.valor } });
    return total > 0;
  }

  async buscarPorEmail(email: Email): Promise<Conta | null> {
    const linha = await this.repositorioOrm.findOne({ where: { email: email.valor } });
    return linha ? this.paraDominio(linha) : null;
  }

  async buscarPorGoogleSub(googleSub: string): Promise<Conta | null> {
    const linha = await this.repositorioOrm.findOne({ where: { googleSub } });
    return linha ? this.paraDominio(linha) : null;
  }

  async salvar(conta: Conta): Promise<Conta> {
    const codigo = conta.codigoVerificacao;
    const linha = this.repositorioOrm.create({
      id: conta.id,
      nome: conta.nome,
      email: conta.email.valor,
      hashSenha: conta.obterHashSenhaParaPersistencia(),
      codigoVerificacao: codigo?.valor ?? null,
      codigoGeradoEm: codigo?.geradoEm ?? null,
      tentativasCodigo: conta.tentativasCodigo,
      googleSub: conta.googleSub,
      estado: conta.estado,
      origem: conta.origem,
      criadaEm: conta.criadaEm,
    });

    await this.repositorioOrm.save(linha);
    return conta;
  }

  private paraDominio(linha: ContaOrmEntity): Conta {
    const codigo =
      linha.codigoVerificacao && linha.codigoGeradoEm
        ? CodigoVerificacao.reconstituir(linha.codigoVerificacao, linha.codigoGeradoEm, TTL_CODIGO_MINUTOS)
        : null;

    return Conta.reconstituir({
      id: linha.id,
      nome: linha.nome,
      email: new Email(linha.email),
      hashSenha: linha.hashSenha,
      codigoVerificacao: codigo,
      estado: linha.estado,
      criadaEm: linha.criadaEm,
      tentativasCodigo: linha.tentativasCodigo,
      googleSub: linha.googleSub,
      origem: linha.origem,
    });
  }
}
