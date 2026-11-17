# 0002 — Documentação pública da API

- Status: aceito
- Data: 2026-11-16

## Contexto

`049-swagger-api` e `050-readme-api` pedem Swagger e ReadMe para as rotas já implementadas, com visualização pública só em local e em teste. O caminho da URL e o nome do ambiente não estavam em `ARCHITECTURE.md`. `NODE_ENV` já estava no backend (`development`, `test`, `production`). O pedido de implementação fechou a escolha que a spec tinha deixado como pergunta não bloqueante.

## Decisão

1. Swagger fica em `GET /docs`. O JSON do contrato fica em `GET /docs-json`.
2. A visualização ReadMe fica em `GET /readme`, na própria API.
3. As duas só são montadas quando `NODE_ENV` é `development` (local, como no `.env.example`) ou `test`. Qualquer outro valor, inclusive `production`, não monta essas rotas.
4. O OpenAPI sai dos controllers registrados (`@nestjs/swagger`). Swagger e ReadMe leem o mesmo documento.
5. A publicação no ReadMe usa `POST https://api.readme.com/v2/branches/stable/apis` com a chave `README_API_KEY` (nome já usado pela documentação do ReadMe). Sem chave, nada é enviado. Falha do ReadMe não impede a API de subir. A publicação também só ocorre em `development` e `test`.

## Alternativas consideradas

- Uma única página com Swagger e ReadMe juntos: descartada. A spec `049` separa as duas URLs.
- Nova variável para ligar a documentação: descartada. `NODE_ENV` já distingue local, teste e produção.
- Servir a visualização só no domínio readme.com: descartada para o critério de aceite. Sem projeto e sem chave neste ambiente, o teste não teria o que abrir. A página `/readme` é a visualização. O POST é a publicação.

## Consequências

**Positivas**: rota nova registrada passa a aparecer nas duas páginas sem uma lista manual. Produção não publica o contrato.

**Negativas**: o branch `stable` do ReadMe fica fixo. Um projeto que use outro branch não recebe o upload até essa escolha existir. Quem abrir `/docs` ou `/readme` em local ou teste vê o contrato sem autenticação, como a spec pediu.

## Referências

- `mayahtrip-base/.specs/049-swagger-api.md`
- `mayahtrip-base/.specs/050-readme-api.md`
- https://docs.readme.com/main/reference/createapi
- https://docs.readme.com/main/docs/rdme
