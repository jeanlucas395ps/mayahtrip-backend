# 0018 — Participantes da viagem

- Status: aceito
- Data: 2026-11-18

## Contexto

Criar a viagem conta adultos e crianças. O comentário de `travel.trip_participants` fecha o nome provisório e o papel de quem ainda não tem conta. A matriz de visão do dono, do supremo, do experiente e do júnior está em BUSINESS.md §4.3. Convite, troca de papel, remoção e passagem de posse ficam no item seguinte.

## Decisão

1. A criação grava o dono com a conta e o nome do perfil. Cada adulto além do dono nasce como `supreme_traveler`, sem conta, com o nome Viajante N. Cada criança nasce sem papel e sem conta. O número seguinte evita o nome de quem já está na viagem.
2. A carteira, a ficha e a capa aparecem para o dono e para quem está na viagem com `removed_at` vazio. Quem saiu deixa de ver a viagem.
3. A resposta traz a visão já fechada: dono e supremo veem roteiro, edição, gastos e documentos. O experiente vê roteiro, edição e gastos. O júnior vê só o roteiro. Gasto e documento ainda não têm endpoint.
4. Quem pode editar troca só o nome de exibição. O nome é único na viagem, sem distinguir maiúsculas. Papel, convite e saída não entram nesta entrega.
5. Viagem antiga, sem linha de participante, continua visível para o dono com a visão de dono.

## Consequências

O papel da criança sem conta continua nulo. O papel padrão do convite por e-mail continua aberto. O júnior não envia a capa.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, comentário de `travel.trip_participants`
- `mayahtrip-base/.docs/BUSINESS.md` §4.3
- `adrs/0017-viagem.md`
