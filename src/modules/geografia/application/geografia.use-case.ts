import { Inject, Injectable } from '@nestjs/common';
import {
  CidadeLida,
  ContinenteLido,
  DestinoLido,
  GEOGRAFIA,
  GeografiaRepositorio,
  IdiomaGeografia,
  PaisLido,
} from '../domain/ports/geografia.port';

export class CidadeAusenteError extends Error {
  constructor() {
    super('ausente');
    this.name = 'CidadeAusenteError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDIOMAS = ['pt-BR', 'pt-PT', 'en', 'es'] as const;

@Injectable()
export class GeografiaUseCase {
  constructor(@Inject(GEOGRAFIA) private readonly geografia: GeografiaRepositorio) {}

  destinos(texto: string | undefined, idioma: string | undefined): Promise<DestinoLido[]> {
    const busca = texto?.trim().slice(0, 80) ?? '';
    if (!busca) return Promise.resolve([]);
    return this.geografia.buscarDestinos(busca, idiomaDe(idioma));
  }

  async cidade(id: string, idioma: string | undefined): Promise<CidadeLida> {
    if (!UUID.test(id)) throw new CidadeAusenteError();
    const cidade = await this.geografia.cidade(id, idiomaDe(idioma));
    if (!cidade) throw new CidadeAusenteError();
    return cidade;
  }

  paises(idioma: string | undefined): Promise<PaisLido[]> {
    return this.geografia.paises(idiomaDe(idioma));
  }

  continentes(idioma: string | undefined): Promise<ContinenteLido[]> {
    return this.geografia.continentes(idiomaDe(idioma));
  }
}

function idiomaDe(valor: string | undefined): IdiomaGeografia {
  if (valor && (IDIOMAS as readonly string[]).includes(valor)) return valor as IdiomaGeografia;
  return 'pt-BR';
}
