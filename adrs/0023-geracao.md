# 0023 — Geração do roteiro

- Status: aceito
- Data: 2026-11-18

## Contexto

A geração é assíncrona e recusada acima de 14 dias. O job grava a outbox. Nome de tópico, contrato e retentativa continuam abertos. A Maya não escreve o roteiro.

## Decisão

1. Acima de 14 dias a rota responde conflito e não grava job.
2. Até 14 dias, a mesma transação grava o job, o resultado, os dias vazios e a outbox com `itinerary_generation_requested`.
3. O resultado marca `filledBy: none`. Nenhuma parada é inventada.

## Consequências

Quando o tópico existir, o consumidor lê a outbox. Ele não precisa criar os dias de novo se o roteiro já os tiver.

## Referências

- `mayahtrip-base/.docs/BUSINESS/14-nova-viagem.md`
- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, `platform.outbox_events`
