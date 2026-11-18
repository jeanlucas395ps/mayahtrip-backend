# 0027 — Taxa do dia

- Status: aceito
- Data: 2026-11-18

## Contexto

O gasto usa a taxa do dia em que foi lançado. A fonte é a Frankfurter. Uma data já gravada não é reescrita.

## Decisão

1. A rota pede origem, destino e data.
2. Se a linha existe, ela volta sem chamar a Frankfurter.
3. Se não existe, a taxa entra com o provedor `frankfurter`. Uma corrida que grava a mesma data lê a linha que ganhou.

## Consequências

O lançamento do gasto reutiliza esta leitura. O teste troca a fonte e confirma que a segunda chamada não altera a taxa.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, `finance.exchange_rates`
