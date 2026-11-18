import { Inject, Injectable } from '@nestjs/common';
import { SessaoDeAcesso } from '../../identidade/application/sessao-de-acesso';
import { FiltroDeUsuarios, UsuarioDoApp, USUARIOS, UsuariosRepositorio } from '../domain/ports/usuarios.port';

export class UsuarioAusenteError extends Error {
  constructor() {
    super('ausente');
    this.name = 'UsuarioAusenteError';
  }
}

export class UsuarioExcluidoError extends Error {
  constructor() {
    super('excluido');
    this.name = 'UsuarioExcluidoError';
  }
}

export class FiltroInvalidoError extends Error {
  constructor() {
    super('filtro');
    this.name = 'FiltroInvalidoError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class UsuariosUseCase {
  constructor(
    @Inject(USUARIOS) private readonly usuarios: UsuariosRepositorio,
    @Inject(SessaoDeAcesso) private readonly sessoes: SessaoDeAcesso,
  ) {}

  listar(bruto: Record<string, string | undefined>): Promise<UsuarioDoApp[]> {
    return this.usuarios.listar(filtroDe(bruto));
  }

  async porId(id: string): Promise<UsuarioDoApp> {
    if (!UUID.test(id)) throw new UsuarioAusenteError();
    const usuario = await this.usuarios.porId(id);
    if (!usuario) throw new UsuarioAusenteError();
    return usuario;
  }

  async definirAtivo(id: string, ativo: boolean): Promise<UsuarioDoApp> {
    if (!UUID.test(id)) throw new UsuarioAusenteError();
    const efeito = await this.usuarios.definirStatus(id, ativo ? 'active' : 'inactive');
    if (efeito === 'excluido') throw new UsuarioExcluidoError();
    if (efeito === 'ausente') throw new UsuarioAusenteError();
    if (!ativo) await this.sessoes.encerrarTodas(id);
    const usuario = await this.usuarios.porId(id);
    if (!usuario) throw new UsuarioAusenteError();
    return usuario;
  }

  async excluir(id: string): Promise<UsuarioDoApp> {
    if (!UUID.test(id)) throw new UsuarioAusenteError();
    const usuario = await this.usuarios.excluir(id);
    if (!usuario) throw new UsuarioAusenteError();
    await this.sessoes.encerrarTodas(id);
    return usuario;
  }

  async restaurar(id: string): Promise<UsuarioDoApp> {
    if (!UUID.test(id)) throw new UsuarioAusenteError();
    const usuario = await this.usuarios.restaurar(id);
    if (!usuario) throw new UsuarioAusenteError();
    return usuario;
  }
}

function filtroDe(bruto: Record<string, string | undefined>): FiltroDeUsuarios {
  const ativo = opcionalBooleano(bruto.ativo);
  const verificado = opcionalBooleano(bruto.verificado);
  const entradaBruta = bruto.entrada?.trim() || null;
  const entrada = entradaBruta === 'google' || entradaBruta === 'senha' ? entradaBruta : null;
  if (entradaBruta && !entrada) throw new FiltroInvalidoError();
  const pais = bruto.pais?.trim() || null;
  if (pais && !UUID.test(pais)) throw new FiltroInvalidoError();
  const cadastroDe = bruto.cadastroDe?.trim() || null;
  const cadastroAte = bruto.cadastroAte?.trim() || null;
  if ((cadastroDe && !DIA.test(cadastroDe)) || (cadastroAte && !DIA.test(cadastroAte))) throw new FiltroInvalidoError();
  return {
    q: bruto.q?.trim() || null,
    ativo,
    verificado,
    entrada,
    pais,
    cadastroDe,
    cadastroAte,
  };
}

function opcionalBooleano(valor: string | undefined): boolean | null {
  if (valor === undefined || valor.trim() === '') return null;
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  throw new FiltroInvalidoError();
}
