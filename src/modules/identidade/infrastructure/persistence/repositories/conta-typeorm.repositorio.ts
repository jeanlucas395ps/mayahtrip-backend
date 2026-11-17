import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conta } from '../../../domain/entities/conta.entity';
import { ContaRepositorio } from '../../../domain/ports/conta-repositorio.port';
import { Email } from '../../../domain/value-objects/email.vo';
import { ContaOrmEntity } from '../entities/conta.orm-entity';

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

  async salvar(conta: Conta): Promise<Conta> {
    const linha = this.repositorioOrm.create({
      id: conta.id,
      nome: conta.nome,
      email: conta.email.valor,
      hashSenha: conta.obterHashSenhaParaPersistencia(),
      codigoVerificacao: conta.codigoVerificacao.valor,
      codigoGeradoEm: conta.codigoVerificacao.geradoEm,
      estado: conta.estado,
      criadaEm: conta.criadaEm,
    });

    await this.repositorioOrm.save(linha);
    return conta;
  }

}
