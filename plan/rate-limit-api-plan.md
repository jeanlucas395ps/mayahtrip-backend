# Plano — rate-limit-api

## Contexto e problema

`048-rate-limit-api` pede um único teto para toda rota HTTP, inclusive saúde e métricas. Os limites por rota de 042, 043 e 044 não viram um segundo guarda.

## Objetivo e critérios de aceite

Uma rejeição 429 com a mensagem "Limite de taxa excedido." em qualquer rota depois do teto, com a métrica `http_rate_limit_rejections_total` sem rótulo de usuário.

## Escopo

Dentro: `ThrottlerGuard` global e uma chave compartilhada (`nome` + rastreador do cliente), ignorando a rota. O teste injeta `RATE_LIMIT_LIMITE=1`.

Fora: escolher o número de produção, a janela de produto e a chave (IP, conta ou token). Store continua o throttler em memória. Redis segue só para `jti` (ADR 0001).

## Abordagem

O boot mantém 120 pedidos / 60 s, que já era o valor compilado. Isso não fecha o número de produto. `@SkipThrottle` saiu de `GET /metrics`.

## Como testar

`npm test` — `test/sign-up-rate-limit.e2e.spec.ts`.

## Riscos

O scrape de métricas pode levar 429. O número de produção continua aberto.
