# Plano — sign-in-api

## Contexto e problema

Conta confirmada precisa entrar com e-mail e senha ou com Google, e renovar a sessão. ADR `0001-identidade-tokens-persistencia.md` já fecha access JWT de 15 min, refresh opaco no Postgres e Redis só para a lista de `jti`.

## Objetivo e critérios de aceite

`POST /v1/auth/sign-in`, `POST /v1/auth/google` e `POST /v1/auth/refresh` cobrindo os AC de `044-sign-in-api.md`.

## Escopo

Dentro: login indistinguível para senha errada, conta ausente e conta pendente; Google cria conta confirmada sem senha ou reaproveita o e-mail; rotação do refresh; reuso de refresh consumido revoga a família e grava os `jti` no Redis.

Fora: cópia de UI de login (`A DEFINIR`), duração fechada do refresh, comportamento de produto quando o Redis cai.

## Abordagem

Refresh de 32 bytes, guardado como sha256. `manterConectado` fica na linha da sessão. TTL proposto: 30 dias com manter conectado, 1 dia sem. Google valida em `https://oauth2.googleapis.com/tokeninfo`. Sem `GOOGLE_CLIENT_ID` no docs, a audiência não é checada; `email_verified` precisa ser a string `"true"`. Redis indisponível na leitura do `jti` recusa o access (fail-closed). Isso continua pergunta aberta.

## Como testar

`npm test` — `test/identidade.e2e.spec.ts`.

## Riscos

Fail-closed derruba login se o Redis cair. Desfazer é remover as rotas e a tabela `sessao`.
