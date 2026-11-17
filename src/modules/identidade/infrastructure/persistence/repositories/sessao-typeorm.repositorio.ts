import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessaoGravada, SessaoRepositorio } from '../../../domain/ports/sessao-repositorio.port';
import { SessaoOrmEntity } from '../entities/sessao.orm-entity';

@Injectable()
export class SessaoTypeOrmRepositorio implements SessaoRepositorio {
  constructor(
    @InjectRepository(SessaoOrmEntity)
    private readonly repositorioOrm: Repository<SessaoOrmEntity>,
  ) {}

  async salvar(sessao: SessaoGravada): Promise<void> {
    await this.repositorioOrm.save(this.repositorioOrm.create(sessao));
  }

  async buscarPorHashRefresh(hashRefresh: string): Promise<SessaoGravada | null> {
    const linha = await this.repositorioOrm.findOne({ where: { hashRefresh } });
    return linha ? this.paraDominio(linha) : null;
  }

  async marcarConsumida(id: string, quando: Date): Promise<void> {
    await this.repositorioOrm.update({ id }, { consumidaEm: quando });
  }

  async revogarFamilia(familiaId: string): Promise<SessaoGravada[]> {
    const linhas = await this.repositorioOrm.find({ where: { familiaId } });
    if (linhas.length > 0) {
      await this.repositorioOrm.update({ familiaId }, { revogada: true });
    }
    return linhas.map((linha) => ({ ...this.paraDominio(linha), revogada: true }));
  }

  private paraDominio(linha: SessaoOrmEntity): SessaoGravada {
    return {
      id: linha.id,
      contaId: linha.contaId,
      familiaId: linha.familiaId,
      hashRefresh: linha.hashRefresh,
      accessJti: linha.accessJti,
      manterConectado: linha.manterConectado,
      expiraEm: linha.expiraEm,
      consumidaEm: linha.consumidaEm,
      revogada: linha.revogada,
    };
  }
}
