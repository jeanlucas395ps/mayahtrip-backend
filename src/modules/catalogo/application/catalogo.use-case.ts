import { Inject, Injectable } from '@nestjs/common';
import { ARMAZENAMENTO, ArmazenamentoDeArquivo } from '../../identidade/domain/ports/armazenamento.port';
import { CATALOGO, CatalogoRepositorio, IdiomaCatalogo, LugarBuscado, LugarLido } from '../domain/ports/catalogo.port';

export class LugarAusenteError extends Error {
  constructor() {
    super('ausente');
    this.name = 'LugarAusenteError';
  }
}

export class MidiaAusenteError extends Error {
  constructor() {
    super('ausente');
    this.name = 'MidiaAusenteError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDIOMAS = ['pt-BR', 'pt-PT', 'en', 'es'] as const;

@Injectable()
export class CatalogoUseCase {
  constructor(
    @Inject(CATALOGO) private readonly catalogo: CatalogoRepositorio,
    @Inject(ARMAZENAMENTO) private readonly arquivos: ArmazenamentoDeArquivo,
  ) {}

  buscar(texto: string | undefined, idioma: string | undefined): Promise<LugarBuscado[]> {
    const busca = texto?.trim().slice(0, 80) ?? '';
    if (!busca) return Promise.resolve([]);
    return this.catalogo.buscar(busca, idiomaDe(idioma));
  }

  async lugar(id: string, idioma: string | undefined): Promise<LugarLido> {
    if (!UUID.test(id)) throw new LugarAusenteError();
    const lugar = await this.catalogo.lugar(id, idiomaDe(idioma));
    if (!lugar) throw new LugarAusenteError();
    return lugar;
  }

  async midia(lugarId: string, midiaId: string): Promise<{ bytes: Buffer; mime: string }> {
    if (!UUID.test(lugarId) || !UUID.test(midiaId)) throw new MidiaAusenteError();
    const chave = await this.catalogo.chaveDeMidia(lugarId, midiaId);
    if (!chave) throw new MidiaAusenteError();
    const arquivo = await this.arquivos.ler(chave);
    if (!arquivo) throw new MidiaAusenteError();
    return arquivo;
  }
}

function idiomaDe(valor: string | undefined): IdiomaCatalogo {
  if (valor && (IDIOMAS as readonly string[]).includes(valor)) return valor as IdiomaCatalogo;
  return 'pt-BR';
}
