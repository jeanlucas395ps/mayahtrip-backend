# 0039 — Fonte, fila e expiração sem tópico Kafka

- Status: aceito
- Data: 2026-11-18

## Contexto

A seção 7 grava a ingestão e a plataforma. O SQL já nomeia as seis fontes, os estados e as chaves de ajuste. O que ainda não autoriza arquivo, a lista de licenças e o nome do tópico Kafka continuam abertos.

## Decisão

1. As seis fontes nascem inativas, com `can_store` e `can_republish` falsos e licença `unknown`. O admin ativa a ficha. Qualquer `storage_key` é recusado.
2. A licença nova é texto livre. `license_label` permanece `unknown`.
3. Aprovar e rejeitar seguem a decisão editorial que já existia. Pedir correção grava `edited`, encaminhar grava `escalated`, associar grava o lugar, e a reavaliação insere outra licença.
4. O painel edita o teto do calendário, o teto flexível, as janelas de estorno, o TTL do handoff e os dois prazos de sessão. A geração automática continua recusando viagem acima de 14 dias.
5. A outbox nasce na mesma transação do job. Uma chave `Idempotency-Key` devolve o mesmo efeito. Sem a chave, a geração segue como antes. O consumidor grava `processed_events` e não publica em tópico.
6. A expiração diária e o disparo manual tiram o PRO de quem venceu sem renovação paga, cupom nem promo vigente. Não cobra.
7. Saúde observa API, Postgres e Redis. Kafka, Nginx e o coletor de máquina ficam degradados, sem número inventado.

## Consequências

O painel opera fonte, fila, ajuste, expiração, totais e financeiro. A autorização de guardar arquivo e o contrato Kafka continuam na lista de bloqueios.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, schemas `ingestion` e `platform`
- `mayahtrip-base/.docs/PANEL/01`, `07`, `16`, `17` e `18`
