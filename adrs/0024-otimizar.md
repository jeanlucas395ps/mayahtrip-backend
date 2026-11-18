# 0024 — Otimizar o roteiro

- Status: aceito
- Data: 2026-11-18

## Contexto

Otimizar reordena as paradas do dia. Horário e duração já definidos permanecem.

## Decisão

1. A parada com horário vai para a frente, na ordem do horário. A parada sem horário fica depois, na ordem em que estava.
2. `start_time` e `duration_minutes` não são reescritos.
3. A corrida fica em `itinerary_optimization_runs`. Sem roteiro, a rota responde que a viagem ainda não tem roteiro.

## Consequências

O mapa e a lista leem a nova ordem na mesma resposta.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, `itinerary.itinerary_optimization_runs`
