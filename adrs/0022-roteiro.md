# 0022 — Roteiro da viagem

- Status: aceito
- Data: 2026-11-18

## Contexto

A lista e o mapa leem o mesmo roteiro. A parada marca Feito e desfaz. O júnior vê e não edita.

## Decisão

1. O primeiro dia cria o roteiro ativo da viagem.
2. Dia, parada e deslocamento exigem quem pode editar. Feito e desfazer ficam com quem vê a viagem, inclusive o júnior.
3. Desfazer zera `completed_at`.

## Consequências

Gerar e otimizar ficam nas rotas seguintes. Este corte não chama a Maya.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, tabelas `itinerary`
