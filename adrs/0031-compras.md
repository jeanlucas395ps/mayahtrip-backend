# 0031 — Lista de compras

- Status: aceito
- Data: 2026-11-18

## Contexto

O item é da viagem. O preço entra na moeda de exibição, já convertido. Marcar comprado pode abrir o gasto. `expense_id` só fica quando a pessoa salva esse gasto.

## Decisão

1. Dono, supremo e experiente veem e editam a lista. O júnior não vê.
2. O preço gravado usa a moeda de exibição de quem salvou. Sem preço, a moeda fica vazia.
3. Marcar comprado não cria gasto. Abrir o gasto preenchido grava `expense_id` e impede outro gasto do mesmo item.

## Consequências

Atribuir o item a uma pessoa e abrir o link no app continuam abertos.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, `organization.shopping_items`
- `mayahtrip-base/.docs/BUSINESS/24-lista-de-compras.md`
