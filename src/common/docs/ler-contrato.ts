import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const STATUS: Record<string, number> = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BAD_GATEWAY: 502,
  INTERNAL_SERVER_ERROR: 500,
};

const UUID = '3f1c2a40-7b6e-4d1a-9c20-1a2b3c4d5e6f';
const CORRELATION = '71e3cb72-1d2e-4563-bc80-7e4ce36f4ac2';

export interface CampoContrato {
  nome: string;
  obrigatorio: boolean;
  regra: string;
  exemplo: unknown;
}

export interface RespostaContrato {
  status: number;
  descricao: string;
  exemplo: unknown;
  vazio?: boolean;
  texto?: boolean;
  binario?: boolean;
}

export interface OperacaoContrato {
  chave: string;
  resumo: string;
  descricao: string;
  auth: 'publica' | 'viajante' | 'admin' | 'opcional' | 'webhook';
  parametros: { nome: string; em: 'path' | 'query' | 'header'; obrigatorio: boolean; descricao: string; exemplo: string }[];
  corpo?: CampoContrato[];
  exemploCorpo?: unknown;
  respostas: RespostaContrato[];
}

interface Excecao {
  status: number;
  mensagem: string;
  extra?: Record<string, unknown>;
}

interface MapaDeFalha {
  pares: { codigo: string; excecao: Excecao }[];
  sobra?: Excecao;
  todas: Excecao[];
}

const arquivos = new Map<string, string>();

export function lerContrato(raiz = join(process.cwd(), 'src')): Map<string, OperacaoContrato> {
  arquivos.clear();
  indexar(raiz);
  const mensagens = lerMensagens();
  const mapa = new Map<string, OperacaoContrato>();
  for (const [caminho, texto] of arquivos) {
    if (!caminho.endsWith('.controller.ts')) continue;
    for (const operacao of operacoesDoArquivo(caminho, texto, mensagens)) {
      mapa.set(operacao.chave, operacao);
    }
  }
  return mapa;
}

function indexar(diretorio: string): void {
  for (const nome of readdirSync(diretorio)) {
    const caminho = join(diretorio, nome);
    if (statSync(caminho).isDirectory()) {
      indexar(caminho);
      continue;
    }
    if (nome.endsWith('.ts')) arquivos.set(caminho, readFileSync(caminho, 'utf8'));
  }
}

function textoDe(caminho: string): string {
  return arquivos.get(caminho) ?? '';
}

function lerMensagens(): Record<string, Record<string, string>> {
  const arquivo = [...arquivos.keys()].find((caminho) => caminho.endsWith('mensagens-identidade.ts'));
  if (!arquivo) return {};
  const texto = textoDe(arquivo);
  const saida: Record<string, Record<string, string>> = {};
  const blocos = texto.split(/\n  ([a-zA-Z]+): \{/).slice(1);
  for (let i = 0; i < blocos.length; i += 2) {
    const chave = blocos[i];
    const corpo = blocos[i + 1] ?? '';
    const fim = corpo.indexOf('\n  }');
    const miolo = fim >= 0 ? corpo.slice(0, fim) : corpo;
    saida[chave] = {};
    for (const achado of miolo.matchAll(/'([^']+)': '([^']+)'/g)) {
      saida[chave][achado[1]] = achado[2];
    }
  }
  return saida;
}

function operacoesDoArquivo(
  caminho: string,
  texto: string,
  mensagens: Record<string, Record<string, string>>,
): OperacaoContrato[] {
  const saida: OperacaoContrato[] = [];
  const classes = fatiarClasses(texto);
  for (const classe of classes) {
    const controlador = classe.decoradores.join('\n').match(/@Controller\(([\s\S]*?)\)/);
    if (!controlador) continue;
    const { prefixo, neutro } = lerControlador(controlador[1]);
    const guardasDaClasse = guardasDe(classe.decoradores.join('\n'));
    for (const metodo of classe.metodos) {
      const verbo = metodo.decoradores.join('\n').match(/@(Get|Post|Put|Patch|Delete)\(([^)]*)\)/);
      if (!verbo) continue;
      const sub = lerArgumento(verbo[2]);
      const caminhoHttp = montarCaminho(neutro, prefixo, sub);
      const http = metodo.decoradores.join('\n').match(/@HttpCode\(HttpStatus\.([A-Z_]+)\)/);
      const statusOk = http ? STATUS[http[1]] : verbo[1] === 'Post' ? 201 : 200;
      const guardas = [...guardasDaClasse, ...guardasDe(metodo.decoradores.join('\n'))];
      const auth = autenticacao(guardas, caminhoHttp, metodo.corpo);
      const trecho = `${metodo.assinatura}\n${metodo.corpo}`;
      const dto = trecho.match(/@Body\(corpo\(([A-Za-z0-9_]+)\)\)/)?.[1];
      const campos = dto ? lerDto(dto) : [];
      const exemploCorpo = dto ? exemploDoDto(campos) : exemploSolto(trecho);
      const parametros = parametrosDe(caminhoHttp, trecho);
      const excecoes = excecoesDoMetodo(caminho, metodo, mensagens);
      const retorno = tipoDeRetorno(metodo.assinatura) || tipoDelegado(caminho, metodo.corpo);
      const literal = literalDeRetorno(metodo.corpo, texto, mensagens) ?? (retorno ? undefined : literalDelegado(caminho, metodo.corpo));
      const respostas = respostasDe(statusOk, retorno, literal, excecoes, caminhoHttp, auth);
      const acaoDeJob = metodo.corpo.match(/transitar\(id, '(\w+)'\)/)?.[1];
      const statusDeJob = { run: 'running', pause: 'pending', cancel: 'cancelled', finish: 'completed' }[acaoDeJob ?? ''];
      const sucesso = respostas.find((resposta) => resposta.status < 300);
      if (statusDeJob && sucesso?.exemplo && typeof sucesso.exemplo === 'object' && 'status' in sucesso.exemplo) {
        sucesso.exemplo = { ...(sucesso.exemplo as Record<string, unknown>), status: statusDeJob };
      }
      const validacao = mensagensDeValidacao(campos);
      if (validacao.length > 0 && !respostas.some((resposta) => resposta.status === 400)) {
        respostas.push({
          status: 400,
          descricao: `O ValidationPipe recusou o corpo. ${validacao.map((mensagem) => `«${mensagem}»`).join(' ')}`,
          exemplo: {
            message: validacao,
            error: 'Bad Request',
            statusCode: 400,
            correlationId: CORRELATION,
            timestamp: '2026-11-19T07:27:00.000Z',
            path: caminhoHttp.replace(/:([A-Za-z0-9_]+)/g, UUID),
          },
        });
      }
      saida.push({
        chave: `${verbo[1].toUpperCase()} ${caminhoHttp}`,
        resumo: resumoDe(verbo[1].toUpperCase(), caminhoHttp, retorno),
        descricao: descrever({
          auth,
          caminho: caminhoHttp,
          verbo: verbo[1].toUpperCase(),
          campos,
          parametros,
          statusOk,
          retorno,
          literal,
          excecoes,
          webhook: caminhoHttp === '/webhooks/asaas',
          idempotente: trecho.includes('idempotency-key'),
        }),
        auth,
        parametros,
        corpo: campos.length > 0 ? campos : undefined,
        exemploCorpo: campos.length > 0 || exemploCorpo ? exemploCorpo : undefined,
        respostas,
      });
    }
  }
  return saida;
}

interface MetodoFonte {
  decoradores: string[];
  assinatura: string;
  corpo: string;
}

interface ClasseFonte {
  decoradores: string[];
  metodos: MetodoFonte[];
  corpo: string;
}

function fatiarClasses(texto: string): ClasseFonte[] {
  const classes: ClasseFonte[] = [];
  const marcas = [...texto.matchAll(/\nexport class /g)].map((achado) => achado.index ?? 0);
  for (let i = 0; i < marcas.length; i += 1) {
    const inicio = marcas[i];
    const fim = marcas[i + 1] ?? texto.length;
    const pedaco = texto.slice(inicio, fim);
    const abre = pedaco.indexOf('{');
    if (abre < 0) continue;
    const corpo = bloco(pedaco, abre);
    const antes = texto.slice(Math.max(0, inicio - 400), inicio);
    const decoradores = decoradoresImediatos(antes);
    classes.push({ decoradores, metodos: metodosDaClasse(corpo), corpo });
  }
  return classes;
}

function metodosDaClasse(corpo: string): MetodoFonte[] {
  const metodos: MetodoFonte[] = [];
  const marcas = [...corpo.matchAll(/\n  (?:async )?[a-zA-Z0-9_]+\(/g)];
  for (const marca of marcas) {
    const inicio = marca.index ?? 0;
    const abreParen = corpo.indexOf('(', inicio);
    const fechaParen = fechar(corpo, abreParen, '(', ')');
    const abre = abreDoCorpo(corpo, fechaParen);
    if (abre < 0 || abre - fechaParen > 80) continue;
    const miolo = bloco(corpo, abre);
    const antes = corpo.slice(Math.max(0, inicio - 500), inicio);
    metodos.push({
      decoradores: decoradoresImediatos(antes),
      assinatura: corpo.slice(inicio, abre),
      corpo: miolo,
    });
  }
  return metodos;
}

function decoradoresImediatos(antes: string): string[] {
  const linhas = antes.trimEnd().split('\n').reverse();
  const pegos: string[] = [];
  for (const linha of linhas) {
    const limpa = linha.trim();
    if (limpa.startsWith('@')) pegos.push(limpa);
    else if (limpa === '' || limpa.startsWith('*') || limpa.startsWith('//') || limpa.startsWith('/*')) continue;
    else break;
  }
  return pegos.reverse();
}

function partirPorVirgula(texto: string): string[] {
  const partes: string[] = [];
  let atual = '';
  let nivel = 0;
  for (const char of texto) {
    if (char === '(' || char === '{' || char === '[') nivel += 1;
    else if (char === ')' || char === '}' || char === ']') nivel -= 1;
    if (char === ',' && nivel === 0) {
      partes.push(atual);
      atual = '';
    } else atual += char;
  }
  if (atual.trim()) partes.push(atual);
  return partes;
}

function abreDoCorpo(texto: string, desde: number): number {
  let angulo = 0;
  let parentese = 0;
  for (let i = desde; i < texto.length; i += 1) {
    const char = texto[i];
    if (char === '<') angulo += 1;
    else if (char === '>') angulo = Math.max(0, angulo - 1);
    else if (char === '(') parentese += 1;
    else if (char === ')') parentese = Math.max(0, parentese - 1);
    else if (char === '{' && angulo === 0 && parentese === 0) return i;
  }
  return texto.length - 1;
}

function bloco(texto: string, abre: number): string {
  return texto.slice(abre, fechar(texto, abre, '{', '}') + 1);
}

function fechar(texto: string, abre: number, esq: string, dir: string): number {
  let nivel = 0;
  for (let i = abre; i < texto.length; i += 1) {
    const char = texto[i];
    if (char === esq) nivel += 1;
    else if (char === dir) {
      nivel -= 1;
      if (nivel === 0) return i;
    }
  }
  return texto.length - 1;
}

function lerControlador(argumento: string): { prefixo: string; neutro: boolean } {
  const cru = argumento.trim();
  if (cru.startsWith('{')) {
    const path = cru.match(/path:\s*'([^']*)'/)?.[1] ?? '';
    return { prefixo: path, neutro: cru.includes('VERSION_NEUTRAL') };
  }
  return { prefixo: lerArgumento(cru), neutro: false };
}

function lerArgumento(cru: string): string {
  const aspas = cru.match(/'([^']*)'/);
  return aspas ? aspas[1] : '';
}

function montarCaminho(neutro: boolean, prefixo: string, sub: string): string {
  const partes = [neutro ? '' : 'v1', prefixo, sub].flatMap((parte) => parte.split('/')).filter((parte) => parte.length > 0);
  return `/${partes.join('/')}`;
}

function guardasDe(texto: string): string[] {
  const achado = texto.match(/@UseGuards\(([^)]*)\)/);
  if (!achado) return [];
  return achado[1].split(',').map((item) => item.trim()).filter(Boolean);
}

function autenticacao(guardas: string[], caminho: string, corpo: string): OperacaoContrato['auth'] {
  if (caminho === '/webhooks/asaas' || corpo.includes('asaas-access-token')) return 'webhook';
  if (guardas.some((guarda) => guarda.includes('AdminGuard'))) return 'admin';
  if (guardas.some((guarda) => guarda.includes('Opcional'))) return 'opcional';
  if (guardas.some((guarda) => guarda.includes('AccessTokenGuard'))) return 'viajante';
  return 'publica';
}

function parametrosDe(caminho: string, corpo: string): OperacaoContrato['parametros'] {
  const lista: OperacaoContrato['parametros'] = [];
  for (const nome of caminho.match(/:([A-Za-z0-9_]+)/g) ?? []) {
    const limpo = nome.slice(1);
    lista.push({
      nome: limpo,
      em: 'path',
      obrigatorio: true,
      descricao: limpo.toLowerCase().includes('id') ? 'UUID do registro.' : 'Trecho do caminho.',
      exemplo: limpo.toLowerCase().includes('id') ? UUID : 'lisboa',
    });
  }
  for (const achado of corpo.matchAll(/@Query\('([^']+)'\)(?:\s+[a-zA-Z0-9_]+)?(\?)?/g)) {
    lista.push({
      nome: achado[1],
      em: 'query',
      obrigatorio: !achado[2],
      descricao: `Consulta \`${achado[1]}\`.`,
      exemplo: achado[1] === 'filtro' ? 'proximas' : 'ana',
    });
  }
  for (const achado of corpo.matchAll(/@Headers\('([^']+)'\)/g)) {
    lista.push({
      nome: achado[1],
      em: 'header',
      obrigatorio: achado[1] === 'asaas-access-token',
      descricao:
        achado[1] === 'idempotency-key'
          ? 'Opcional. Se vier, precisa casar com ^[A-Za-z0-9._:-]{8,255}$. A mesma chave no mesmo escopo devolve a resposta gravada. Em outro escopo, 409.'
          : 'Segredo configurado em ASAAS_WEBHOOK_TOKEN. A comparação é em tempo constante.',
      exemplo: achado[1] === 'idempotency-key' ? 'coleta-2026-11-19' : 'token-do-webhook',
    });
  }
  if (corpo.includes("FileInterceptor('arquivo'")) {
    lista.push({
      nome: 'arquivo',
      em: 'query',
      obrigatorio: true,
      descricao: 'Campo multipart arquivo. JPG, PNG ou WebP, até 10 MB.',
      exemplo: 'capa.webp',
    });
  }
  return lista;
}

function lerDto(nome: string): CampoContrato[] {
  const arquivo = [...arquivos.keys()].find((caminho) => textoDe(caminho).includes(`export class ${nome} `) || textoDe(caminho).includes(`export class ${nome}{`));
  if (!arquivo) return [];
  const texto = textoDe(arquivo);
  const inicio = texto.indexOf(`export class ${nome}`);
  const abre = texto.indexOf('{', inicio);
  const corpo = bloco(texto, abre);
  const campos: CampoContrato[] = [];
  let decoradores = '';
  for (const linha of corpo.split('\n')) {
    if (linha.trim().startsWith('@') || (decoradores && linha.trim().startsWith(')'))) {
      decoradores += `\n${linha}`;
      continue;
    }
    const nomeCampo = linha.match(/^\s{2}([A-Za-z0-9_]+)[?!]/)?.[1];
    if (!nomeCampo) continue;
    const aninhado = decoradores.match(/@Type\(\(\) => ([A-Za-z0-9_]+)\)/)?.[1];
    const filhos = aninhado ? lerDto(aninhado) : [];
    const obrigatorio = !decoradores.includes('@IsOptional()');
    const regra = regraDoCampo(decoradores, filhos);
    campos.push({
      nome: nomeCampo,
      obrigatorio,
      regra,
      exemplo: exemploDeCampo(nomeCampo, decoradores, filhos, obrigatorio),
    });
    decoradores = '';
  }
  return campos;
}

function mensagensDeValidacao(campos: CampoContrato[]): string[] {
  const saida: string[] = [];
  for (const campo of campos) {
    for (const parte of campo.regra.split('; ')) {
      if (/[.!?]$/.test(parte) && !saida.includes(parte)) saida.push(parte);
    }
  }
  return saida;
}

function regraDoCampo(decoradores: string, filhos: CampoContrato[]): string {
  const partes: string[] = [];
  if (decoradores.includes('@IsOptional()')) partes.push('opcional');
  const email = decoradores.match(/@IsEmail\(\{\}, \{ message: '([^']+)' \}\)/);
  if (email) partes.push(email[1]);
  else if (decoradores.includes('@IsEmail')) partes.push('e-mail válido');
  for (const mensagem of decoradores.matchAll(/message: '([^']+)'/g)) {
    if (!partes.includes(mensagem[1])) partes.push(mensagem[1]);
  }
  const lista = decoradores.match(/@IsIn\(\[([^\]]+)\]/);
  if (lista) partes.push(`um de ${lista[1].replaceAll("'", '')}`);
  const min = decoradores.match(/@MinLength\((\d+)\)/);
  if (min && !partes.some((parte) => parte.includes(min[1]))) partes.push(`mínimo de ${min[1]} caracteres`);
  const max = decoradores.match(/@MaxLength\((\d+)\)/);
  if (max) partes.push(`máximo de ${max[1]} caracteres`);
  const minimo = decoradores.match(/@Min\((\d+)\)/);
  if (minimo) partes.push(`mínimo ${minimo[1]}`);
  const maximo = decoradores.match(/@Max\((\d+)\)/);
  if (maximo) partes.push(`máximo ${maximo[1]}`);
  if (decoradores.includes('@IsUUID')) partes.push('UUID');
  if (decoradores.includes('@IsInt')) partes.push('inteiro');
  if (decoradores.includes('@IsBoolean') || decoradores.includes('@Equals(true')) partes.push('booleano');
  if (decoradores.includes('@IsArray')) partes.push(filhos.length > 0 ? `lista de ${filhos.map((filho) => filho.nome).join(', ')}` : 'lista');
  if (partes.length === 0) partes.push('texto');
  return partes.join('; ');
}

function exemploDeCampo(nome: string, decoradores: string, filhos: CampoContrato[], obrigatorio: boolean): unknown {
  const lista = decoradores.match(/@IsIn\(\[([^\]]+)\]\)/);
  if (lista) return lista[1].split(',')[0].replaceAll("'", '').trim();
  if (decoradores.includes('@Equals(true')) return true;
  if (decoradores.includes('@IsBoolean')) return true;
  if (decoradores.includes('@IsEmail') || nome.toLowerCase().includes('email')) return 'ana.lima@exemplo.com';
  if (decoradores.includes('@IsUUID') || nome.endsWith('Id')) return UUID;
  if (decoradores.includes('@IsInt') || decoradores.includes('@IsNumber')) {
    const min = decoradores.match(/@Min\((\d+)\)/);
    return min ? Number(min[1]) : 1;
  }
  if (decoradores.includes('@IsArray')) {
    if (filhos.length === 0) return [];
    const item: Record<string, unknown> = {};
    for (const filho of filhos) {
      if (filho.obrigatorio || filho.nome === 'customName') item[filho.nome] = filho.exemplo;
    }
    return [item];
  }
  if (nome === 'senha' || nome.toLowerCase().includes('senha')) return 'umaSenhaForte123';
  if (nome === 'customName') return 'Alfama';
  if (nome === 'nome' || nome === 'name' || nome === 'displayName' || nome === 'title') return nome === 'title' ? 'Lisboa em novembro' : 'Ana Lima';
  if (nome.toLowerCase().includes('date') || decoradores.includes('DATA')) return '2026-11-19';
  if (nome.toLowerCase().includes('currency') || nome === 'moeda') return 'BRL';
  if (nome === 'codigo') return '1234';
  if (nome === 'idioma' || nome === 'locale') return 'pt-BR';
  if (!obrigatorio) return undefined;
  return 'texto';
}

function exemploDoDto(campos: CampoContrato[]): Record<string, unknown> {
  const exemplo: Record<string, unknown> = {};
  for (const campo of campos) {
    if (campo.exemplo !== undefined) exemplo[campo.nome] = campo.exemplo;
  }
  return exemplo;
}

function exemploSolto(corpo: string): unknown {
  if (!corpo.includes('corpo.event') && !corpo.includes('asaas-access-token')) return undefined;
  return { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_001' } };
}

function tipoDelegado(arquivo: string, corpo: string, profundidade = 0): string {
  if (profundidade > 2) return '';
  const direto = corpo.match(/return (?:await )?(?:responder\w*\(|executar(?:Admin)?\(\(\) => )?this\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\(/);
  if (direto) {
    const sucesso = parteDeSucesso(tipoDoMetodo(arquivo, direto[1], direto[2]));
    if (sucesso) return sucesso;
  }
  const local = corpo.match(/return this\.([A-Za-z0-9_]+)\(/);
  if (local) {
    const interno = corpoDoMetodo(textoDe(arquivo), local[1]);
    if (interno) {
      const seguido = tipoDelegado(arquivo, interno, profundidade + 1);
      if (seguido) return seguido;
    }
  }
  const atribuido = corpo.match(/const (\w+) = await (?:responder\w*\(|executar(?:Admin)?\(\(\) => )?this\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\(/);
  if (!atribuido) return '';
  const sucesso = parteDeSucesso(tipoDoMetodo(arquivo, atribuido[2], atribuido[3]));
  const devolvido = corpo.match(new RegExp(`return ${atribuido[1]}(?:\\.([A-Za-z0-9_]+))?`));
  if (!sucesso || !devolvido) return sucesso;
  return devolvido[1] ? campoDoTipo(sucesso, devolvido[1]) || sucesso : sucesso;
}

function tipoDoMetodo(arquivo: string, campo: string, metodo: string): string {
  const texto = textoDe(arquivo);
  const classe = texto.match(new RegExp(`readonly ${campo}:\\s*([A-Za-z0-9_]+)`))?.[1];
  if (!classe) return '';
  const origem = arquivoDoTipo(texto, arquivo, classe);
  if (!origem) return '';
  const fonte = textoDe(origem);
  const marca = fonte.match(new RegExp(`\\n  (?:(?:public|private|protected|async|override)\\s+)*${metodo}\\(`));
  if (!marca || marca.index === undefined) return '';
  return tipoDeRetorno(fonte.slice(marca.index, abreDoCorpo(fonte, marca.index)));
}

function parteDeSucesso(tipo: string): string {
  const uteis = partirUniao(tipo).filter((parte) => {
    if (!parte || parte === 'null' || parte === 'void' || parte.startsWith("'")) return false;
    const nome = parte.replaceAll('[]', '').trim();
    if (!/^[A-Za-z0-9_]+$/.test(nome)) return true;
    return !ehAliasDeFalha(nome);
  });
  return uteis[0] ?? '';
}

function partirUniao(tipo: string): string[] {
  const partes: string[] = [];
  let inicio = 0;
  let angulo = 0;
  let chave = 0;
  for (let i = 0; i < tipo.length; i += 1) {
    if (tipo[i] === '<') angulo += 1;
    else if (tipo[i] === '>') angulo -= 1;
    else if (tipo[i] === '{') chave += 1;
    else if (tipo[i] === '}') chave -= 1;
    else if (tipo[i] === '|' && angulo === 0 && chave === 0) {
      partes.push(tipo.slice(inicio, i).trim());
      inicio = i + 1;
    }
  }
  partes.push(tipo.slice(inicio).trim());
  return partes.filter(Boolean);
}

function ehAliasDeFalha(nome: string): boolean {
  const alias = textoComTipo(nome);
  if (!alias) return false;
  return partirUniao(alias).every((parte) => parte.startsWith("'") || parte === 'string');
}

function campoDoTipo(tipo: string, campo: string): string {
  const objeto = tipo.includes('{') ? tipo : '';
  if (!objeto) return '';
  const embrulhado = objeto.trim().startsWith('{') ? objeto : `{${objeto}}`;
  return camposDaInterface(embrulhado).find(([nome]) => nome === campo)?.[1] ?? '';
}

function literalDelegado(arquivo: string, corpo: string): unknown {
  const chamada = corpo.match(/(?:return |const \w+ = await |responder\w*\(|executar(?:Admin)?\(\(\) => )this\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\(/);
  if (!chamada) return undefined;
  const texto = textoDe(arquivo);
  const tipo = texto.match(new RegExp(`readonly ${chamada[1]}:\\s*([A-Za-z0-9_]+)`))?.[1];
  if (!tipo) return undefined;
  const origem = arquivoDoTipo(texto, arquivo, tipo);
  if (!origem) return undefined;
  const metodo = corpoDoMetodo(textoDe(origem), chamada[2]);
  if (!metodo) return undefined;
  return exemploDoCorpo(metodo, origem, 0);
}

function exemploDoCorpo(metodo: string, origem: string, profundidade: number): unknown {
  if (metodo.includes('activePro:') && metodo.includes('workers: filas.workers')) {
    return {
      totals: { trips: 1, users: 1, admins: 1, itineraries: 1, agents: 1 },
      users: [{ day: '2026-11-19', total: 1 }],
      trips: [{ day: '2026-11-19', total: 1 }],
      acquisitions: { free: 0, pro: 0 },
      activePro: 0,
      queues: {
        itinerary: { pending: 1, processing: 1, failed: 1 },
        notification: { pending: 1, processing: 1, failed: 1 },
        ingestion: { pending: 1, processing: 1, failed: 1 },
      },
      workers: { itinerary: 'parado', notification: 'parado', ingestion: 'parado' },
    };
  }
  if (metodo.includes('currencies: moedas.map')) {
    return {
      currencies: [{ currency: 'BRL', paid: 0, pending: 0, refunded: 0, net: 0 }],
      subscriptions: ['trialing', 'active', 'past_due', 'cancelled', 'expired'].map((status) => ({ status, total: 0 })),
      months: [{ currency: 'BRL', month: 11, total: 0, projected: false }],
    };
  }
  const objeto = metodo.lastIndexOf('return {');
  const consulta = Math.max(metodo.lastIndexOf('return this.dados.query'), metodo.lastIndexOf('return this.dados\n'));
  const salto = metodo.lastIndexOf('return this.');
  if (objeto >= consulta && objeto >= salto && objeto >= 0) {
    const json = jsonSolto(bloco(metodo, metodo.indexOf('{', objeto)));
    return json && metodo.slice(0, objeto).includes('.map(') ? [json] : json;
  }
  if (consulta >= salto && consulta >= 0) return exemploDaConsulta(metodo.slice(consulta));
  if (salto >= 0 && profundidade < 2) {
    const nome = metodo.slice(salto).match(/return this\.([A-Za-z0-9_]+)\(/)?.[1];
    const interno = nome ? corpoDoMetodo(textoDe(origem), nome) : undefined;
    if (interno) return exemploDoCorpo(interno, origem, profundidade + 1);
  }
  const devolvido = metodo.match(/return (\w+);/)?.[1];
  const chamado = devolvido ? metodo.match(new RegExp(`const ${devolvido} = await this\\.([A-Za-z0-9_]+)\\(`))?.[1] : undefined;
  if (chamado && profundidade < 2) {
    const interno = corpoDoMetodo(textoDe(origem), chamado);
    if (interno) return exemploDoCorpo(interno, origem, profundidade + 1);
  }
  return undefined;
}

function exemploDaConsulta(trecho: string): unknown {
  const generico = trecho.match(/^return this\.dados\s*\.\s*query<([\s\S]+?)>\(/);
  if (generico) {
    const tipo = generico[1].trim().replace(/\[\]$/, '');
    const item = tipo.includes('{') ? exemploDoTipo('linha', tipo, 1) : exemploPorNome('id');
    return [item];
  }
  const sql = trecho.match(/^return this\.dados\s*\.\s*query\(\s*`([\s\S]*?)`/);
  return sql ? [exemploSelect(sql[1])] : undefined;
}

function exemploSelect(sql: string): Record<string, unknown> {
  const lista = sql.match(/select\s+([\s\S]+?)\s+from\s/i)?.[1] ?? '';
  const objeto: Record<string, unknown> = {};
  for (const coluna of partirPorVirgula(lista)) {
    const alias = coluna.match(/\bas\s+"?([A-Za-z0-9_]+)"?\s*$/i)?.[1];
    const cru = alias ?? coluna.trim().split('.').pop()?.match(/[A-Za-z_][A-Za-z0-9_]*/)?.[0];
    if (cru) objeto[cru] = exemploPorNome(cru);
  }
  return objeto;
}

function jsonSolto(bruto: string): unknown {
  const direto = tentarJson(bruto);
  if (direto !== undefined) return direto;
  const frouxo = bruto.replace(/:\s*([^,\n}]+)/g, (_, valor: string) => (/^('.*'|".*"|-?\d+|true|false|null)$/.test(valor.trim()) ? `: ${valor.trim()}` : ': null'));
  return tentarJson(frouxo);
}

function tentarJson(bruto: string): unknown {
  const preparado = bruto
    .replace(/\.\.\.contagem\([^)]*\)/g, 'pending: 1, processing: 1, failed: 1')
    .replace(/:\s*[^,\n]*\?\?\s*(\{[^}]*\}|\[[^\]]*\]|-?\d+|true|false|null|'[^']*')/g, ': $1')
    .replace(/ as const/g, '')
    .replace(/ as \{[^}]*\}(?:\[\])?/g, '')
    .replace(/'([^'\\]*)'/g, '"$1"')
    .replace(/[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z0-9_.]+(?:\([^)]*\))?(?:\.[A-Za-z0-9_]+(?:\([^)]*\))?)*\s*\?[^,\n}]*/g, 'null')
    .replace(/[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z0-9_.]+/g, 'null')
    .replace(/new\s+[A-Za-z0-9_.]+(?:\([^)]*\))?/g, 'null')
    .replace(/(^|[,{]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*(?=[,}])/g, '$1"$2": null')
    .replace(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '"$1":')
    .replace(/:\s*([A-Za-z_][A-Za-z0-9_]*)\b/g, ': null')
    .replace(/,\s*([}\]])/g, '$1');
  try {
    return preencher(JSON.parse(preparado));
  } catch {
    return undefined;
  }
}

function preencher(valor: unknown, chave = ''): unknown {
  if (Array.isArray(valor)) return valor.map((item) => preencher(item));
  if (valor && typeof valor === 'object') {
    const objeto = Object.fromEntries(Object.entries(valor).map(([nome, item]) => [nome, preencher(item, nome)]));
    if ('min' in objeto && 'max' in objeto && objeto.key == null) {
      objeto.key = 'trip_calendar_max_days';
      objeto.value = 90;
      objeto.description = 'Teto do calendário, cerca de 3 meses.';
      objeto.min = 1;
      objeto.max = 366;
    }
    return objeto;
  }
  if (valor !== null || !chave) return valor;
  if (chave === 'jobs') return [{ id: UUID, status: 'pending', createdAt: '2026-11-19T07:27:00.000Z' }];
  if (['id', 'code', 'name', 'status', 'source', 'currency', 'email', 'title', 'slug'].includes(chave)) return exemploPorNome(chave);
  return null;
}

function tipoDeRetorno(assinatura: string): string {
  const marca = assinatura.match(/:\s*Promise</);
  if (marca && marca.index !== undefined) {
    let nivel = 1;
    const inicio = marca.index + marca[0].length;
    for (let i = inicio; i < assinatura.length; i += 1) {
      if (assinatura[i] === '<') nivel += 1;
      else if (assinatura[i] === '>') {
        nivel -= 1;
        if (nivel === 0) return assinatura.slice(inicio, i).replace(/\s+/g, ' ').trim();
      }
    }
  }
  return assinatura.match(/:\s*([A-Za-z0-9_<>|[\]. ]+)\s*$/)?.[1]?.trim() ?? '';
}

function literalDeRetorno(
  corpo: string,
  arquivo: string,
  mensagens: Record<string, Record<string, string>>,
): unknown {
  const simples = corpo.match(/return \{([\s\S]*?)\};/);
  if (!simples) return undefined;
  const objeto: Record<string, unknown> = {};
  for (const par of partirPorVirgula(simples[1])) {
    const separador = par.indexOf(':');
    if (separador < 0) {
      if (/^[A-Za-z0-9_]+$/.test(par.trim())) objeto[par.trim()] = exemploPorNome(par.trim());
      continue;
    }
    const chave = par.slice(0, separador).trim();
    const valor = par.slice(separador + 1).trim();
    if (!chave || chave.includes('\n')) continue;
    if (valor.startsWith("'") || valor.startsWith('"')) objeto[chave] = valor.slice(1, -1);
    else if (valor === 'true' || valor === 'false') objeto[chave] = valor === 'true';
    else if (/^\d+$/.test(valor)) objeto[chave] = Number(valor);
    else if (valor.includes("mensagem(")) {
      const chaveMensagem = valor.match(/mensagem\(\s*'([^']+)'/)?.[1];
      objeto[chave] = (chaveMensagem && mensagens[chaveMensagem]?.['pt-BR']) || exemploPorNome(chave);
    } else if (/^[A-Za-z0-9_]+$/.test(valor)) {
      const constante = arquivo.match(new RegExp(`const ${valor} =\\s*'([^']*)'`))?.[1] ?? arquivo.match(new RegExp(`const ${valor} =\\s*\\n\\s*'([^']*)'`))?.[1];
      objeto[chave] = constante ?? exemploPorNome(chave);
    } else objeto[chave] = exemploPorNome(chave);
  }
  return objeto;
}

function excecoesDoMetodo(arquivo: string, metodo: MetodoFonte, mensagens: Record<string, Record<string, string>>): Excecao[] {
  const texto = textoDe(arquivo);
  const diretas = extrairExcecoes(metodo.corpo, mensagens);
  const ajudantes = new Set<string>();
  for (const nome of metodo.corpo.matchAll(/\b(responder|httpDe|recusarCodigo|falhaDe|erroDe|naoAutorizado)\(/g)) {
    ajudantes.add(nome[1]);
  }
  const daAjuda: Excecao[] = [];
  for (const nome of ajudantes) {
    const mapa = resolverAjuda(texto, nome, mensagens, new Set());
    if (!mapa) continue;
    if (mapa.pares.length === 0) {
      daAjuda.push(...mapa.todas);
      continue;
    }
    const codigos = codigosDoMetodo(arquivo, metodo.corpo);
    for (const codigo of codigos) {
      const par = mapa.pares.find((item) => item.codigo === codigo);
      if (par) daAjuda.push(par.excecao);
      else if (mapa.sobra) daAjuda.push(mapa.sobra);
    }
    if (codigos.length === 0) daAjuda.push(...mapa.todas);
  }
  return deduplicar([...diretas, ...daAjuda]);
}

function resolverAjuda(
  texto: string,
  nome: string,
  mensagens: Record<string, Record<string, string>>,
  vistos: Set<string>,
): MapaDeFalha | undefined {
  if (vistos.has(nome)) return undefined;
  vistos.add(nome);
  const funcao = corpoDaFuncao(texto, nome);
  if (!funcao) return undefined;
  const mapa = mapaDeFalha(funcao, mensagens);
  if (mapa.pares.length > 0) return mapa;
  for (const interno of funcao.matchAll(/\b(httpDe|recusarCodigo|falhaDe|erroDe)\(/g)) {
    const seguido = resolverAjuda(texto, interno[1], mensagens, vistos);
    if (seguido && seguido.pares.length > 0) return seguido;
  }
  return mapa;
}

function extrairExcecoes(corpo: string, mensagens: Record<string, Record<string, string>>): Excecao[] {
  const lista: Excecao[] = [];
  for (const achado of corpo.matchAll(/new HttpException\(\s*\{([\s\S]*?)\}\s*,\s*HttpStatus\.([A-Z_]+)\s*\)/g)) {
    const miolo = achado[1];
    const status = STATUS[achado[2]] ?? 500;
    const fixa = miolo.match(/message:\s*'([^']+)'/)?.[1];
    const chave = miolo.match(/message:\s*mensagem\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/);
    const locale = miolo.match(/message:\s*mensagem\(\s*'([^']+)'\s*,\s*locale\s*\)/);
    const incorreto = miolo.includes('mensagemCodigoIncorreto');
    if (fixa) lista.push({ status, mensagem: fixa, extra: extraDe(miolo) });
    if (chave) lista.push({ status, mensagem: mensagens[chave[1]]?.[chave[2]] ?? chave[1], extra: extraDe(miolo) });
    if (locale) {
      lista.push({ status, mensagem: mensagens[locale[1]]?.['pt-BR'] ?? locale[1], extra: extraDe(miolo) });
    }
    if (incorreto) lista.push({ status, mensagem: 'Código incorreto. Você ainda tem 1 tentativa.', extra: { tentativasRestantes: 1 } });
  }
  return lista;
}

function extraDe(miolo: string): Record<string, unknown> | undefined {
  if (miolo.includes('tentativasRestantes: 0')) return { tentativasRestantes: 0 };
  if (miolo.includes('tentativasRestantes')) return { tentativasRestantes: 4 };
  return undefined;
}

function mapaDeFalha(corpo: string, mensagens: Record<string, Record<string, string>>): MapaDeFalha {
  const pares: MapaDeFalha['pares'] = [];
  for (const achado of corpo.matchAll(/if\s*\([^)]*=== '([^']+)'[^)]*\)[\s\S]*?return new HttpException\(\s*\{([\s\S]*?)\}\s*,\s*HttpStatus\.([A-Z_]+)\)/g)) {
    const excecao = extrairExcecoes(`new HttpException({${achado[2]}}, HttpStatus.${achado[3]})`, mensagens)[0];
    if (excecao) pares.push({ codigo: achado[1], excecao });
  }
  const todas = extrairExcecoes(corpo, mensagens);
  const ultima = todas.at(-1);
  const sobra = pares.length > 0 && ultima && !pares.some((par) => par.excecao.mensagem === ultima.mensagem) ? ultima : undefined;
  return { pares, sobra, todas };
}

function corpoDaFuncao(texto: string, nome: string): string | undefined {
  const marca = texto.match(new RegExp(`function ${nome}\\s*\\(`));
  if (!marca || marca.index === undefined) return undefined;
  const abre = abreDoCorpo(texto, marca.index);
  return bloco(texto, abre);
}

function codigosDoMetodo(arquivoControlador: string, corpoMetodo: string): string[] {
  const chamadas = [...corpoMetodo.matchAll(/this\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\(/g)];
  if (chamadas.length === 0) return [];
  const texto = textoDe(arquivoControlador);
  const imports = new Map<string, string>();
  for (const achado of texto.matchAll(/import \{([^}]+)\} from '(\.[^']+)'/g)) {
    const origem = resolve(dirname(arquivoControlador), achado[2] + (achado[2].endsWith('.ts') ? '' : '.ts'));
    for (const nome of achado[1].split(',')) {
      const limpo = nome.trim().split(' as ').pop()?.trim();
      if (limpo) imports.set(limpo, origem);
    }
  }
  const codigos = new Set<string>();
  for (const chamada of chamadas) {
    const campo = chamada[1];
    const metodo = chamada[2];
    const tipo = texto.match(new RegExp(`readonly ${campo}:\\s*([A-Za-z0-9_]+)`))?.[1];
    if (!tipo) continue;
    const arquivo = imports.get(tipo);
    if (!arquivo || !arquivos.has(arquivo)) continue;
    coletarCodigos(arquivo, metodo, codigos, 0);
  }
  return [...codigos].filter((codigo) => codigo !== 'ok');
}

function coletarCodigos(arquivo: string, metodo: string, codigos: Set<string>, profundidade: number): void {
  if (profundidade > 4) return;
  const texto = textoDe(arquivo);
  const corpo = corpoDoMetodo(texto, metodo);
  if (!corpo) {
    uniaoDoRetorno(texto, metodo, codigos);
    return;
  }
  for (const achado of corpo.matchAll(/return '([^']+)'|\?\? '([^']+)'/g)) codigos.add(achado[1] ?? achado[2]);
  for (const achado of corpo.matchAll(/this\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\(/g)) {
    const campo = achado[1];
    const nome = achado[2];
    const tipo = texto.match(new RegExp(`readonly ${campo}:\\s*([A-Za-z0-9_]+)`))?.[1];
    if (!tipo) continue;
    const origem = arquivoDoTipo(texto, arquivo, tipo);
    if (origem) uniaoDoRetorno(textoDe(origem), nome, codigos);
  }
  for (const achado of corpo.matchAll(/this\.([A-Za-z0-9_]+)\(/g)) {
    coletarCodigos(arquivo, achado[1], codigos, profundidade + 1);
  }
}

function corpoDoMetodo(texto: string, metodo: string): string | undefined {
  const marca = texto.match(new RegExp(`\\n  (?:(?:public|private|protected|async|override)\\s+)*${metodo}\\(`));
  if (!marca || marca.index === undefined) return undefined;
  const abre = abreDoCorpo(texto, marca.index);
  const antes = texto.slice(marca.index, abre);
  if (antes.includes(';') && !antes.includes('{')) return undefined;
  return bloco(texto, abre);
}

function uniaoDoRetorno(texto: string, metodo: string, codigos: Set<string>): void {
  const assinatura = texto.match(new RegExp(`${metodo}\\([^;]*\\):\\s*Promise<([^>]+)>`))?.[1] ?? '';
  for (const achado of assinatura.matchAll(/'([^']+)'/g)) codigos.add(achado[1]);
}

function arquivoDoTipo(texto: string, arquivo: string, tipo: string): string | undefined {
  for (const achado of texto.matchAll(/import \{([^}]+)\} from '(\.[^']+)'/g)) {
    if (!achado[1].split(',').some((nome) => nome.trim().split(' as ').pop()?.trim() === tipo)) continue;
    const origem = resolve(dirname(arquivo), `${achado[2]}.ts`);
    if (arquivos.has(origem)) return origem;
  }
  return [...arquivos.keys()].find((caminho) => textoDe(caminho).includes(`export interface ${tipo} `));
}

function deduplicar(lista: Excecao[]): Excecao[] {
  const vistos = new Set<string>();
  return lista.filter((item) => {
    const chave = `${item.status}:${item.mensagem}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

function respostasDe(
  statusOk: number,
  retorno: string,
  literal: unknown,
  excecoes: Excecao[],
  caminho: string,
  auth: OperacaoContrato['auth'],
): RespostaContrato[] {
  const respostas: RespostaContrato[] = [];
  if (statusOk === 204 || retorno === 'void') {
    respostas.push({ status: statusOk, descricao: 'Sem corpo.', exemplo: null, vazio: true });
  } else if (retorno.includes('StreamableFile')) {
    respostas.push({ status: statusOk, descricao: 'Bytes da imagem, com Content-Type do arquivo.', exemplo: null, binario: true });
  } else if (caminho === '/metrics') {
    respostas.push({
      status: 200,
      descricao: 'Texto do Prometheus. Os nomes abaixo são os contadores e o histograma gravados pelo processo.',
      exemplo:
        '# HELP http_request_duration_seconds Duração das requisições HTTP, em segundos.\n# TYPE http_request_duration_seconds histogram\nhttp_request_duration_seconds_count{method="GET",route="/metrics",status_code="200"} 1\n# HELP http_request_errors_total Total de requisições HTTP que terminaram em erro (status >= 400).\n# TYPE http_request_errors_total counter\n# HELP http_rate_limit_rejections_total Requisições rejeitadas pelo guard único de limite de taxa.\n# TYPE http_rate_limit_rejections_total counter\n# HELP auth_revogacao_rejeicoes_total Access tokens recusados pela lista de revogação.\n# TYPE auth_revogacao_rejeicoes_total counter\n',
      texto: true,
    });
  } else {
    const exemplo = exemploDeSucesso(retorno, literal);
    respostas.push({
      status: statusOk,
      descricao: exemplo ? 'Corpo devolvido no sucesso.' : 'Sucesso.',
      exemplo,
    });
  }
  const porStatus = new Map<number, Excecao[]>();
  for (const excecao of excecoes) {
    const grupo = porStatus.get(excecao.status) ?? [];
    grupo.push(excecao);
    porStatus.set(excecao.status, grupo);
  }
  if (auth === 'viajante' || auth === 'admin' || auth === 'webhook') {
    const grupo = porStatus.get(401) ?? [];
    if (!grupo.some((item) => item.mensagem === 'Não foi possível entrar.')) {
      grupo.unshift({ status: 401, mensagem: 'Não foi possível entrar.' });
      porStatus.set(401, grupo);
    }
  }
  if (auth === 'opcional') {
    const grupo = porStatus.get(401) ?? [];
    grupo.unshift({ status: 401, mensagem: 'Não foi possível entrar.' });
    porStatus.set(401, grupo);
  }
  for (const [status, grupo] of [...porStatus.entries()].sort((a, b) => a[0] - b[0])) {
    respostas.push({
      status,
      descricao: grupo.map((item) => `«${item.mensagem}»`).join(' ou '),
      exemplo: envelope(caminho, status, grupo[0]),
    });
  }
  respostas.push({
    status: 429,
    descricao: '«Limite de taxa excedido.» O guard único de taxa respondeu. O número do limite de produção não está fechado.',
    exemplo: envelope(caminho, 429, { status: 429, mensagem: 'Limite de taxa excedido.' }),
  });
  if (!porStatus.has(500)) {
    respostas.push({
      status: 500,
      descricao: 'Falha não prevista. O filtro único não devolve stack.',
      exemplo: envelope(caminho, 500, { status: 500, mensagem: 'Erro interno. Tente novamente mais tarde.' }),
    });
  }
  return respostas;
}

function exemploDeSucesso(retorno: string, literal: unknown): unknown {
  if (literal && typeof literal === 'object') return literal;
  const limpo = retorno.replace(/^\{|\}$/g, '').trim();
  if (limpo.startsWith('{') || retorno.includes('{')) {
    const campos = [...retorno.matchAll(/([A-Za-z0-9_]+)\s*:/g)].map((achado) => achado[1]);
    if (campos.length > 0) {
      const objeto: Record<string, unknown> = {};
      for (const campo of campos) objeto[campo] = exemploPorNome(campo);
      return objeto;
    }
  }
  const nome = retorno.replace('[]', '').replace(/ \| null/g, '').trim();
  if (!nome || nome === 'void' || nome === 'string') return literal;
  const varios = retorno.endsWith('[]') || retorno.includes('[]');
  const base = nome.split('|')[0].trim();
  const exemplo = exemploDaInterface(base, 0);
  if (!exemplo) return literal;
  return varios ? [exemplo] : exemplo;
}

const interfacesVistas = new Set<string>();

function exemploDaInterface(nome: string, profundidade: number): Record<string, unknown> | undefined {
  if (profundidade > 3 || interfacesVistas.has(nome)) return undefined;
  const arquivo = [...arquivos.keys()].find((caminho) => textoDe(caminho).includes(`export interface ${nome} `));
  if (!arquivo) return undefined;
  const texto = textoDe(arquivo);
  const inicio = texto.indexOf(`export interface ${nome} `);
  const abre = texto.indexOf('{', inicio);
  const corpo = bloco(texto, abre);
  interfacesVistas.add(nome);
  const objeto: Record<string, unknown> = {};
  const pai = texto.slice(inicio, abre).match(/extends ([A-Za-z0-9_]+)/)?.[1];
  if (pai) Object.assign(objeto, exemploDaInterface(pai, profundidade + 1) ?? {});
  for (const [nome, tipo] of camposDaInterface(corpo)) {
    objeto[nome] = exemploDoTipo(nome, tipo, profundidade + 1);
  }
  interfacesVistas.delete(nome);
  return objeto;
}

function camposDaInterface(corpo: string): Array<[string, string]> {
  const campos: Array<[string, string]> = [];
  let i = 0;
  let nivel = 0;
  while (i < corpo.length) {
    const caractere = corpo[i];
    if (caractere === '{') {
      nivel += 1;
      i += 1;
      continue;
    }
    if (caractere === '}') {
      nivel -= 1;
      i += 1;
      continue;
    }
    if (nivel !== 1) {
      i += 1;
      continue;
    }
    const campo = corpo.slice(i).match(/^[\s,]*([A-Za-z0-9_]+)\??:\s*/);
    if (!campo) {
      i += 1;
      continue;
    }
    const inicioTipo = i + campo[0].length;
    let fim = inicioTipo;
    let aninhado = 0;
    while (fim < corpo.length) {
      if (corpo[fim] === '{') aninhado += 1;
      else if (corpo[fim] === '}') {
        if (aninhado === 0) break;
        aninhado -= 1;
      } else if (corpo[fim] === ';' && aninhado === 0) break;
      fim += 1;
    }
    campos.push([campo[1], corpo.slice(inicioTipo, fim).replace(/\s+/g, ' ').trim()]);
    i = corpo[fim] === '}' ? fim : fim + 1;
  }
  return campos;
}

function exemploDoTipo(nome: string, tipo: string, profundidade: number): unknown {
  const uniao = [...tipo.matchAll(/'([^']+)'/g)].map((achado) => achado[1]);
  if (uniao.length > 0 && !tipo.includes('{')) return uniao[0];
  if (tipo.includes('[]')) {
    const interno = tipo.replace('[]', '').replace(' | null', '').trim();
    const item = interno.includes('{')
      ? exemploDoTipo(nome, interno, profundidade + 1)
      : (exemploDaInterface(interno, profundidade) ?? exemploPorNome(nome));
    return [item];
  }
  if (tipo.includes('{')) {
    const objeto: Record<string, unknown> = {};
    for (const campo of tipo.matchAll(/([A-Za-z0-9_]+)\s*:\s*([^;}]+)/g)) {
      objeto[campo[1]] = exemploDoTipo(campo[1], campo[2].trim(), profundidade + 1);
    }
    return objeto;
  }
  const base = tipo.split('|')[0].trim();
  if (base === 'string') return exemploPorNome(nome);
  if (base === 'number') return 1;
  if (base === 'boolean') return nome.startsWith('has') || nome.startsWith('is') ? true : false;
  if (base === 'null') return null;
  const aninhado = exemploDaInterface(base, profundidade);
  if (aninhado) return aninhado;
  const apelido = textoComTipo(base);
  if (apelido) return exemploDoTipo(nome, apelido, profundidade);
  return exemploPorNome(nome);
}

function textoComTipo(nome: string): string | undefined {
  for (const texto of arquivos.values()) {
    const achado = texto.match(new RegExp(`export type ${nome} = ([^;]+);`));
    if (achado?.[1] && !achado[1].includes('Exclude') && !achado[1].includes('Omit')) return achado[1].trim();
  }
  return undefined;
}

function exemploPorNome(nome: string): unknown {
  const chave = nome.toLowerCase();
  if (chave === 'id' || chave.endsWith('id')) return UUID;
  if (chave.includes('email')) return 'ana.lima@exemplo.com';
  if (chave === 'description' || chave === 'descricao') return 'Notas da viagem.';
  if (chave.includes('title') || chave === 'titulo') return 'Lisboa em novembro';
  if (chave.includes('name') || chave === 'nome') return 'Ana Lima';
  if (chave.includes('date')) return '2026-11-19';
  if (chave.includes('currency') || chave === 'moeda') return 'BRL';
  if (chave === 'accesstoken') return 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIzZjFjMmE0MC03YjZlLTRkMWEtOWMyMC0xYTJiM2M0ZDVlNmYifQ.assinatura';
  if (chave.includes('token')) return 'refresh-opaco';
  if (chave.includes('message') || chave === 'mensagem') return 'Texto devolvido pela rota.';
  if (chave.includes('count') || chave.includes('total') || chave.includes('amount')) return 1;
  if (chave.startsWith('is') || chave.startsWith('has')) return true;
  if (chave === 'status') return 'active';
  if (chave === 'source') return 'paid';
  if (chave === 'code') return 'plus';
  if (chave === 'slug') return 'alfama';
  if (chave === 'billingperiod') return 'monthly';
  if (chave === 'username') return 'ana-lima';
  if (chave === 'locale' || chave === 'idioma') return 'pt-BR';
  return chave;
}

function envelope(caminho: string, status: number, excecao: Excecao): Record<string, unknown> {
  return {
    message: excecao.mensagem,
    ...(excecao.extra ?? {}),
    statusCode: status,
    correlationId: CORRELATION,
    timestamp: '2026-11-19T07:27:00.000Z',
    path: caminho.replace(/:([A-Za-z0-9_]+)/g, UUID),
  };
}

function resumoDe(verbo: string, caminho: string, retorno: string): string {
  const recurso = caminho.replace('/v1/', '').replaceAll(':', '');
  if (caminho === '/metrics') return 'Expõe as métricas do processo em texto Prometheus';
  if (caminho === '/webhooks/asaas') return 'Grava o evento da Asaas e confirma pagamento recebido';
  const acao = { GET: 'Lê', POST: 'Grava', PUT: 'Substitui', PATCH: 'Atualiza', DELETE: 'Remove' }[verbo.toUpperCase()] ?? 'Atende';
  const devolve = retorno && retorno !== 'void' ? ` e devolve ${retorno.replace('Promise<', '').replace('>', '')}` : '';
  return `${acao} ${recurso}${devolve}`.slice(0, 120);
}

function descrever(entrada: {
  auth: OperacaoContrato['auth'];
  caminho: string;
  verbo: string;
  campos: CampoContrato[];
  parametros: OperacaoContrato['parametros'];
  statusOk: number;
  retorno: string;
  literal: unknown;
  excecoes: Excecao[];
  webhook: boolean;
  idempotente: boolean;
}): string {
  const quem: Record<OperacaoContrato['auth'], string> = {
    publica: 'Rota pública, sem Bearer.',
    viajante: 'Exige Authorization Bearer com JWT de viajante (sub e jti). Ausente, inválido, expirado ou revogado: 401 «Não foi possível entrar.». O Redis fora do ar também recusa.',
    admin: 'Exige Authorization Bearer com JWT de administrador (tipo admin) e sessão ainda aberta. Qualquer outra coisa: 401 «Não foi possível entrar.».',
    opcional: 'Bearer é opcional. Sem o cabeçalho, segue anônimo. Token presente e inválido: 401 «Não foi possível entrar.».',
    webhook: 'Exige o cabeçalho asaas-access-token igual ao ASAAS_WEBHOOK_TOKEN. Token vazio no servidor ou diferente: 401 «Não foi possível entrar.». creditCard, creditCardToken e token são retirados antes de gravar o payload.',
  };
  const campos = entrada.campos
    .map((campo) => `${campo.nome}${campo.obrigatorio ? '' : '?'} (${campo.regra})`)
    .join('; ');
  const corpo = campos
    ? `Corpo: ${campos}. Campo fora da lista responde 400.`
    : entrada.webhook
      ? 'O corpo é o JSON enviado pela Asaas. event e payment.id são os campos lidos. PAYMENT_CONFIRMED e PAYMENT_RECEIVED marcam o pagamento pendente como pago e reativam assinatura past_due.'
      : 'Sem corpo JSON.';
  const sucesso =
    entrada.statusOk === 204
      ? 'Sucesso sem corpo.'
      : entrada.caminho === '/metrics'
        ? 'Sucesso 200 com text/plain; version=0.0.4. Não entra na versão /v1.'
        : `Sucesso ${entrada.statusOk}${entrada.retorno ? ` (${entrada.retorno})` : ''}${entrada.literal ? `: ${JSON.stringify(entrada.literal)}` : ''}.`;
  const erros = entrada.excecoes.map((item) => `${item.status} «${item.mensagem}»`).join('; ');
  const taxa = '429 «Limite de taxa excedido.» em qualquer rota, pelo guard único. 500 «Erro interno. Tente novamente mais tarde.» quando a falha não é HttpException.';
  const idempotencia = entrada.idempotente
    ? ' Cabeçalho idempotency-key ausente não muda o fluxo. Formato inválido: 400 «A chave de idempotência é inválida.».'
    : '';
  return [quem[entrada.auth], corpo, entrada.parametros.filter((item) => item.em !== 'path').map((item) => `${item.nome}: ${item.descricao}`).join(' '), sucesso, erros, taxa + idempotencia]
    .filter((parte) => parte.length > 0)
    .join(' ');
}
