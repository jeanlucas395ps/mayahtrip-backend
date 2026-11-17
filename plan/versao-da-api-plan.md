# Plano — versão da API

## Contexto e problema

A API não tinha versão. O pedido é versionar o contrato e ficar na v1, nas rotas já criadas e nas futuras.

## Objetivo e critérios de aceite

`POST /v1/auth/sign-up` cria a conta. `POST /auth/sign-up` não encontra a rota e não cria conta. Uma rota registrada sem versão própria aparece em `/v1`. `GET /metrics` continua em `/metrics`.

## Escopo

Dentro: versão no caminho com padrão `1`, cadastro sob `/v1`, métrica neutra, specs e docs.

Fora: v2, mudar o corpo do cadastro, versionar `/docs` e `/readme`.

## Abordagem e alternativas descartadas

Versão padrão da aplicação, não prefixo manual em cada controller. Header e media type ficam de fora. Métrica fica neutra para não mudar o scrape.

## Impacto em arquitetura, dados, UI e segurança

O contrato passa a exigir `/v1`. Não há schema novo nem tela. O caso de uso não roda fora da versão.

## Como testar

`npm test` e `npm run typecheck`.

## Riscos e como desfazer

Cliente no caminho antigo recebe 404. Desfazer é tirar a versão do caminho.
