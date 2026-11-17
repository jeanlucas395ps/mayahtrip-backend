import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CodigoHandoffGravado, CodigoHandoffRepositorio } from '../../../domain/ports/codigo-handoff-repositorio.port';
import { CodigoHandoffOrmEntity } from '../entities/codigo-handoff.orm-entity';

@Injectable()
export class CodigoHandoffTypeOrmRepositorio implements CodigoHandoffRepositorio {
  constructor(
    @InjectRepository(CodigoHandoffOrmEntity)
    private readonly repositorioOrm: Repository<CodigoHandoffOrmEntity>,
  ) {}

  async salvar(codigo: CodigoHandoffGravado): Promise<void> {
    await this.repositorioOrm.save(this.repositorioOrm.create(codigo));
  }

  async buscarPorHash(hashCodigo: string): Promise<CodigoHandoffGravado | null> {
    const linha = await this.repositorioOrm.findOne({ where: { hashCodigo } });
    if (!linha) {
      return null;
    }

    return {
      id: linha.id,
      contaId: linha.contaId,
      hashCodigo: linha.hashCodigo,
      expiraEm: linha.expiraEm,
      usadoEm: linha.usadoEm,
    };
  }

  async marcarUsado(id: string, quando: Date): Promise<void> {
    await this.repositorioOrm.update({ id }, { usadoEm: quando });
  }
}
