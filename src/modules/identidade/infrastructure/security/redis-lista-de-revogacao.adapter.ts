import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { redisConfig } from '../../../../config/redis.config';
import { ListaDeRevogacao } from '../../domain/ports/lista-de-revogacao.port';

@Injectable()
export class RedisListaDeRevogacao implements ListaDeRevogacao, OnModuleDestroy {
  private readonly cliente: Redis;

  constructor(@Inject(redisConfig.KEY) config: ConfigType<typeof redisConfig>) {
    this.cliente = new Redis(config.url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
    this.cliente.on('error', () => undefined);
  }

  async revogar(jti: string, ttlSegundos: number): Promise<void> {
    if (ttlSegundos <= 0) {
      return;
    }

    await this.cliente.set(chave(jti), '1', 'EX', ttlSegundos);
  }

  async estaRevogado(jti: string): Promise<boolean> {
    const valor = await this.cliente.get(chave(jti));
    return valor !== null;
  }

  async lembrarJti(familiaId: string, jti: string, ttlSegundos: number): Promise<void> {
    if (ttlSegundos <= 0) return;
    const chaveFamilia = familia(familiaId);
    await this.cliente.sadd(chaveFamilia, jti);
    await this.cliente.expire(chaveFamilia, ttlSegundos);
  }

  async jtisDaFamilia(familiaId: string): Promise<string[]> {
    return this.cliente.smembers(familia(familiaId));
  }

  async onModuleDestroy(): Promise<void> {
    this.cliente.disconnect();
  }
}

function chave(jti: string): string {
  return `jti:revogado:${jti}`;
}

function familia(familiaId: string): string {
  return `familia:jti:${familiaId}`;
}
