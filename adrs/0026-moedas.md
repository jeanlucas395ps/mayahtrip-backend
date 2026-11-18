# 0026 — Moedas e categorias de gasto

- Status: aceito
- Data: 2026-11-18

## Contexto

O perfil mostra dez moedas. O gasto aceita qualquer moeda ativa. As categorias são as dez de BUSINESS.md §4.6 e não formam um catálogo livre.

## Decisão

1. `GET /v1/finance/currencies` devolve as dez de exibição. `uso=gasto` devolve toda moeda ativa.
2. `GET /v1/finance/expense-categories` devolve as dez, na ordem gravada.
3. Esta rota só lê. Quem grava as dez é o seed.

## Consequências

Lançar o gasto usa essas listas. A taxa do dia fica na rota seguinte.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, `finance.currency_definitions`
