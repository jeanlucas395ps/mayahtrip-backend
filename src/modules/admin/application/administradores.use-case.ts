import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AdministradorGravado, ADMINISTRADORES, AdministradoresRepositorio } from '../domain/ports/administradores.port';
import { SESSAO_ADMIN, SessaoAdminRepositorio } from '../domain/ports/sessao-admin.port';
import { podeDesativar, podeExcluir } from '../domain/regras-de-administrador';

export class EmailDeAdministradorEmUsoError extends Error {
  constructor() {
    super('email');
    this.name = 'EmailDeAdministradorEmUsoError';
  }
}

export class AdministradorAusenteError extends Error {
  constructor() {
    super('ausente');
    this.name = 'AdministradorAusenteError';
  }
}

export class AdministradorUnicoError extends Error {
  constructor() {
    super('unico');
    this.name = 'AdministradorUnicoError';
  }
}

export interface DadosDeAdministrador {
  nome: string;
  email: string;
  senha?: string;
}

@Injectable()
export class AdministradoresUseCase {
  constructor(
    @Inject(ADMINISTRADORES) private readonly administradores: AdministradoresRepositorio,
    @Inject(SESSAO_ADMIN) private readonly sessoes: SessaoAdminRepositorio,
  ) {}

  listar(): Promise<AdministradorGravado[]> {
    return this.administradores.listar();
  }

  async criar(entrada: DadosDeAdministrador): Promise<AdministradorGravado> {
    const senha = entrada.senha ?? '';
    return this.gravarNovo(entrada.nome, entrada.email, await hashDe(senha));
  }

  async editar(id: string, entrada: DadosDeAdministrador): Promise<{ administrador: AdministradorGravado; anterior: AdministradorGravado; senhaTrocada: boolean }> {
    if (!uuid(id)) throw new AdministradorAusenteError();
    const anterior = await this.administradores.porId(id);
    if (!anterior) throw new AdministradorAusenteError();
    const senhaTrocada = Boolean(entrada.senha?.trim());
    const hash = senhaTrocada ? await hashDe(entrada.senha as string) : null;
    try {
      const administrador = await this.administradores.editar(id, {
        name: entrada.nome.trim(),
        email: entrada.email.trim().toLowerCase(),
        passwordHash: hash,
      });
      if (!administrador) throw new AdministradorAusenteError();
      if (senhaTrocada) await this.sessoes.revogarDoAdministrador(id);
      return { administrador, anterior, senhaTrocada };
    } catch (erro) {
      if (chaveUnica(erro)) throw new EmailDeAdministradorEmUsoError();
      throw erro;
    }
  }

  async definirAtivo(id: string, ativo: boolean): Promise<{ administrador: AdministradorGravado; anterior: boolean }> {
    if (!uuid(id)) throw new AdministradorAusenteError();
    const atual = await this.administradores.porId(id);
    if (!atual) throw new AdministradorAusenteError();
    if (!ativo && podeDesativar(atual.isActive, await this.administradores.contarAtivos())) {
      throw new AdministradorUnicoError();
    }
    const gravou = await this.administradores.definirAtivo(id, ativo);
    if (!gravou) throw new AdministradorAusenteError();
    if (!ativo) await this.sessoes.revogarDoAdministrador(id);
    return { administrador: { ...atual, isActive: ativo }, anterior: atual.isActive };
  }

  async excluir(id: string, autorId: string): Promise<AdministradorGravado> {
    if (!uuid(id)) throw new AdministradorAusenteError();
    const atual = await this.administradores.porId(id);
    if (!atual) throw new AdministradorAusenteError();
    if (podeExcluir(id, autorId, await this.administradores.contarAtivos())) throw new AdministradorUnicoError();
    const gravou = await this.administradores.excluir(id);
    if (!gravou) throw new AdministradorAusenteError();
    await this.sessoes.revogarDoAdministrador(id);
    return atual;
  }

  private async gravarNovo(nome: string, email: string, passwordHash: string): Promise<AdministradorGravado> {
    try {
      return await this.administradores.criar({
        name: nome.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
      });
    } catch (erro) {
      if (chaveUnica(erro)) throw new EmailDeAdministradorEmUsoError();
      throw erro;
    }
  }
}

async function hashDe(senha: string): Promise<string> {
  return argon2.hash(senha, { type: argon2.argon2id });
}

function uuid(valor: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
}

function chaveUnica(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false;
  const candidato = erro as { code?: string; driverError?: { code?: string } };
  return candidato.code === '23505' || candidato.driverError?.code === '23505';
}
