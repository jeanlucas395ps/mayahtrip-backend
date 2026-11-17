# Plano — Swagger e ReadMe da API

## Contexto e problema

As specs `049-swagger-api` e `050-readme-api` pedem duas URLs públicas, só em local e em teste, listando as rotas HTTP já registradas. Hoje são `POST /auth/sign-up` e `GET /metrics`. O caminho e o nome do ambiente estavam em aberto. `NODE_ENV` já existe no backend, com `development`, `test` e `production`.

## Objetivo e critérios de aceite

- `GET /docs` serve o Swagger quando `NODE_ENV` é `development` ou `test`.
- `GET /readme` serve a página do contrato ReadMe nos mesmos ambientes.
- Nos dois, a lista é a das rotas registradas, sem rota que não existe.
- Com `NODE_ENV=production`, as duas URLs não devolvem o contrato.
- Com `README_API_KEY` preenchida, e só em `development` ou `test`, a API envia o mesmo OpenAPI para `POST https://api.readme.com/v2/branches/stable/apis`. Sem a chave, a página local continua e a API sobe.

## Escopo

Dentro: geração do OpenAPI a partir dos controllers, as duas URLs, a publicação opcional, testes.

Fora: criar conta no ReadMe, escolher o subdomínio do projeto, documentar rota que ainda não existe, tela de app, site ou painel.

## Abordagem e alternativas descartadas

- `@nestjs/swagger` gera o contrato a partir das rotas Nest. Descartado escrever o OpenAPI à mão, porque a lista divergiria do código.
- Local é `NODE_ENV=development`, que o `.env.example` já usa. Descartado criar outra variável de ambiente.
- A página `/readme` é servida pela API. A publicação no ReadMe é um POST separado e não derruba o processo se o fornecedor falhar. Descartado depender do site do ReadMe para o teste de visualização, porque a chave do projeto não está neste ambiente.
- A chave usa o nome `README_API_KEY`, que a documentação do ReadMe já usa. Não é um nome criado para este repositório.

## Impacto em arquitetura, dados, UI e segurança

- Arquitetura: duas URLs novas, só fora de produção. ADR `0002-documentacao-publica.md`.
- Dados: nenhum schema.
- UI: página de contrato, não tela de produto.
- Segurança: produção não monta as URLs. A chave não entra no Git, no HTML nem no log.

## Como testar

`npm run test` e `npm run typecheck`. O teste HTTP sobe a API em `development`, `test` e `production`. O teste da publicação usa um `fetch` dublê e não chama o ReadMe.

## Riscos e como desfazer

Se a URL aparecer em produção, o teste AC-3 falha. Desfazer: remover a chamada `montarDocumentacao` em `main.ts`. As rotas de negócio não mudam.
