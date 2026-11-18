# 0038 — Conta do provedor sem o segredo

- Status: aceito
- Data: 2026-11-18

## Contexto

A conta da Asaas no painel guarda uma referência, nunca a chave. O log da chamada não leva senha, token, documento nem corpo de e-mail.

## Decisão

1. `credentials_reference` só aceita uma referência de 3 a 150 caracteres em `[A-Za-z0-9:._-]`. Valor com espaço, `$`, `aact_`, `bearer` ou `sk-` é recusado.
2. A sincronização grava o job concluído e uma linha de log com provedor, operação, status e código. Sem corpo.
3. A referência externa liga uma entidade ao identificador do provedor.

## Consequências

A chave continua só no ambiente. O painel mostra a chamada e o webhook já sem cartão.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, schema `integration`
- `mayahtrip-base/.docs/PANEL/15-logs-asaas.md`
