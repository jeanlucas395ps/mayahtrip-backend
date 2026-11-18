# 0021 — Viagem pública e clone

- Status: aceito
- Data: 2026-11-18

## Contexto

A viagem pública pode ser clonada. O clone copia o roteiro. Gasto e documento ficam de fora. Onde a viagem pública aparece no app continua aberto.

## Decisão

1. Só o dono publica ou volta a viagem para privada.
2. Clonar exige a viagem pública. A cópia nasce privada, do quem clonou, com os mesmos destinos e o roteiro ativo. Parada feita não copia.
3. A linha fica em `trip_clones`. Gasto e documento da origem permanecem só nela.

## Consequências

A vitrine da viagem pública não existe nesta entrega.

## Referências

- `mayahtrip-base/.docs/BUSINESS/26-compartilhar-viagem-e-papeis.md`
- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, `travel.trip_clones`
