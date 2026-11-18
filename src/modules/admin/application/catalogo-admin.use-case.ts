import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ARMAZENAMENTO, ArmazenamentoDeArquivo } from '../../identidade/domain/ports/armazenamento.port';
import {
  CATALOGO_ADMIN,
  CatalogoAdminRepositorio,
  CategoriaAdmin,
  FalhaCatalogo,
  LugarAdmin,
  LugarResumo,
  SalvarCategoria,
  SalvarLugar,
  StatusLugar,
} from '../domain/ports/catalogo-admin.port';

const IDIOMAS = ['pt-BR', 'pt-PT', 'en', 'es'] as const;
const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']);
const LIMITE_BYTES = 10 * 1024 * 1024;

@Injectable()
export class CatalogoAdminUseCase {
  constructor(
    @Inject(CATALOGO_ADMIN) private readonly catalogo: CatalogoAdminRepositorio,
    @Inject(ARMAZENAMENTO) private readonly arquivos: ArmazenamentoDeArquivo,
  ) {}

  listar(texto: string | undefined, status: string | undefined): Promise<LugarResumo[] | 'invalido'> {
    const filtro = status?.trim() ?? '';
    if (filtro && filtro !== 'active' && filtro !== 'archived') return Promise.resolve('invalido');
    return this.catalogo.listar(texto?.trim().slice(0, 80) ?? '', filtro ? (filtro as StatusLugar) : null);
  }

  ficha(id: string): Promise<LugarAdmin | null> {
    return this.catalogo.ficha(id);
  }

  salvar(id: string | null, entrada: SalvarLugar): Promise<LugarAdmin | FalhaCatalogo> {
    const pronta = normalizarLugar(entrada);
    if (!pronta) return Promise.resolve('invalido');
    return this.catalogo.salvar(id, pronta);
  }

  arquivar(id: string): Promise<LugarAdmin | 'ausente'> {
    return this.catalogo.arquivar(id);
  }

  unificar(destinoId: string, origemId: string): Promise<LugarAdmin | 'ausente' | 'mesmo'> {
    return this.catalogo.unificar(destinoId, origemId);
  }

  categorias(): Promise<CategoriaAdmin[]> {
    return this.catalogo.categorias();
  }

  salvarCategoria(id: string | null, entrada: SalvarCategoria): Promise<CategoriaAdmin | FalhaCatalogo> {
    const traducoes = entrada.translations
      .filter((item) => item.name.trim())
      .map((item) => ({ locale: item.locale, name: item.name.trim() }));
    if (new Set(traducoes.map((item) => item.locale)).size !== traducoes.length) return Promise.resolve('invalido');
    return this.catalogo.salvarCategoria(id, {
      slug: entrada.slug.trim(),
      parentId: entrada.parentId,
      translations: traducoes,
    });
  }

  excluirCategoria(id: string): Promise<'ok' | 'ausente' | 'em_uso'> {
    return this.catalogo.excluirCategoria(id);
  }

  async adicionarMidia(
    lugarId: string,
    bytes: Buffer,
    mime: string,
    atribuicao: string | null,
    ordem: number | null,
  ): Promise<{ id: string; mediaType: 'photo' | 'video'; attribution: string | null; sortOrder: number | null } | 'ausente' | 'invalido'> {
    if (!MIMES.has(mime) || bytes.length === 0 || bytes.length > LIMITE_BYTES) return 'invalido';
    const tipo = mime === 'video/mp4' ? 'video' : 'photo';
    const chave = `catalogo/${lugarId}/${randomUUID()}`;
    await this.arquivos.guardar(chave, bytes, mime);
    const gravada = await this.catalogo.adicionarMidia(lugarId, chave, tipo, atribuicao?.trim() || null, ordem);
    if (gravada === 'ausente') {
      await this.arquivos.apagar(chave);
      return 'ausente';
    }
    return { id: gravada.id, mediaType: tipo, attribution: atribuicao?.trim() || null, sortOrder: ordem };
  }

  async removerMidia(lugarId: string, midiaId: string): Promise<'ok' | 'ausente'> {
    const removida = await this.catalogo.removerMidia(lugarId, midiaId);
    if (removida === 'ausente') return 'ausente';
    await this.arquivos.apagar(removida.chave);
    return 'ok';
  }
}

function normalizarLugar(entrada: SalvarLugar): SalvarLugar | null {
  const traducoes = entrada.translations.filter((item) => item.name?.trim() || item.description?.trim());
  if (new Set(traducoes.map((item) => item.locale)).size !== traducoes.length) return null;
  if (!traducoes.every((item) => (IDIOMAS as readonly string[]).includes(item.locale))) return null;
  for (const preco of entrada.prices) {
    if (preco.minimumPrice !== null && preco.maximumPrice !== null && preco.minimumPrice > preco.maximumPrice) return null;
  }
  const referencias = entrada.externalReferences.map((item) => `${item.provider.trim()}::${item.externalId.trim()}`);
  if (new Set(referencias).size !== referencias.length) return null;
  return {
    ...entrada,
    slug: entrada.slug.trim(),
    name: entrada.name.trim(),
    description: entrada.description?.trim() || null,
    websiteUrl: entrada.websiteUrl?.trim() || null,
    phone: entrada.phone?.trim() || null,
    translations: traducoes.map((item) => ({
      locale: item.locale,
      name: item.name?.trim() || null,
      description: item.description?.trim() || null,
    })),
    categoryIds: [...new Set(entrada.categoryIds)],
    externalReferences: entrada.externalReferences.map((item) => ({
      ...item,
      provider: item.provider.trim(),
      externalId: item.externalId.trim(),
      externalUrl: item.externalUrl?.trim() || null,
    })),
  };
}
