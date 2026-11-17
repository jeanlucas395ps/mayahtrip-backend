# 0003 — Versão da API

- Status: aceito
- Data: 2026-11-16

## Contexto

O pedido fecha que a API é versionada e que a versão atual é a v1, nas rotas já criadas e nas futuras. O contrato entre app, site, painel e API ainda não tinha versão. A única rota de produto no ar é o cadastro. `GET /metrics` é o scrape do Prometheus.

## Decisão

1. A versão vai no caminho. A versão atual é `1`, então a rota de produto fica em `/v1/...`.
2. Rota de produto que não declara versão entra em `v1`. Declarar outra versão é o que tira a rota da v1. Não há v2 nesta decisão.
3. `GET /metrics` fica fora da versão. `GET /docs` e `GET /readme` também, porque são páginas de visualização, não a API de produto.

## Alternativas consideradas

- Versão em header ou no media type: descartada. O pedido fala da API versionada no uso normal do caminho, e o caminho é o que o cliente e o teste enxergam.
- Prefixo escrito à mão em cada controller (`@Controller('v1/auth')`): descartado. Uma rota nova esqueceria o prefixo. A versão padrão da aplicação coloca a rota em `/v1`.
- Versionar `GET /metrics`: descartado. O scrape já está descrito em `OBSERVABILITY.md` nesse caminho.

## Consequências

**Positivas**: o cadastro e qualquer rota nova nascem em `/v1`. O caminho antigo não executa o caso de uso.

**Negativas**: quem chamar `/auth/sign-up` recebe não encontrado. Não há cliente publicado nesse caminho.

## Referências

- `mayahtrip-base/.specs/051-versao-da-api.md`
- `mayahtrip-base/.docs/ARCHITECTURE.md` §3
- `mayahtrip-base/.docs/DEVELOPMENT.md` §3
- `mayahtrip-base/.docs/OBSERVABILITY.md`
