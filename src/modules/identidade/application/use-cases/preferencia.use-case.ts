import { Inject, Injectable } from '@nestjs/common';
import {
  aplicarEscolha,
  EscolhaDePreferencia,
  Lugar,
  modoDe,
  ModoDePreferencia,
  PreferenciaGravada,
  refletir,
} from '../../domain/preferencia';
import { LOCALIZADOR, Localizador } from '../../domain/ports/localizador.port';
import { PREFERENCIA_REPOSITORIO, PreferenciaRepositorio } from '../../domain/ports/preferencia-repositorio.port';
import { LocaleOficial } from '../../domain/value-objects/idioma.vo';

export interface PreferenciaVisivel {
  idioma: LocaleOficial;
  moeda: string;
  idiomaSegueLocalizacao: boolean;
  moedaSegueLocalizacao: boolean;
  modo: ModoDePreferencia;
  fuso: string | null;
  cidade: string | null;
  pais: string | null;
}

@Injectable()
export class PreferenciaUseCase {
  constructor(
    @Inject(PREFERENCIA_REPOSITORIO) private readonly preferencias: PreferenciaRepositorio,
    @Inject(LOCALIZADOR) private readonly localizador: Localizador,
  ) {}

  async ver(userId: string, ip: string): Promise<PreferenciaVisivel> {
    const atual = await this.preferencias.buscar(userId);
    return this.resolver(atual, ip);
  }

  async editar(userId: string, escolha: EscolhaDePreferencia, ip: string): Promise<PreferenciaVisivel> {
    const atual = await this.preferencias.buscar(userId);
    const exibicao = await this.preferencias.moedasDeExibicao();
    const escolhida = aplicarEscolha(atual, escolha, exibicao);
    return this.resolver(escolhida, ip);
  }

  private async resolver(base: PreferenciaGravada, ip: string): Promise<PreferenciaVisivel> {
    const lugar = await this.localizador.porIp(ip);
    const exibicao = await this.preferencias.moedasDeExibicao();
    const gravada = refletir(base, lugar, exibicao);
    const armazenada = await this.preferencias.buscar(base.userId);
    if (mudou(armazenada, gravada)) {
      await this.preferencias.salvar(gravada);
    }
    return visao(gravada, lugar);
  }
}

function mudou(antes: PreferenciaGravada, depois: PreferenciaGravada): boolean {
  return (
    antes.segueIdioma !== depois.segueIdioma ||
    antes.idioma !== depois.idioma ||
    antes.segueMoeda !== depois.segueMoeda ||
    antes.moeda !== depois.moeda ||
    antes.fuso !== depois.fuso
  );
}

function visao(preferencia: PreferenciaGravada, lugar: Lugar | null): PreferenciaVisivel {
  return {
    idioma: preferencia.idioma,
    moeda: preferencia.moeda,
    idiomaSegueLocalizacao: preferencia.segueIdioma,
    moedaSegueLocalizacao: preferencia.segueMoeda,
    modo: modoDe(preferencia),
    fuso: preferencia.fuso,
    cidade: lugar?.cidade ?? null,
    pais: lugar?.paisNome ?? null,
  };
}
