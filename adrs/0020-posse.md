# 0020 — Posse, papel e saída

- Status: aceito
- Data: 2026-11-18

## Contexto

O comentário de `trip_participants` fecha quem convida, quem remove, quem muda papel e quem passa a posse. Confirmar a remoção continua aberto, então a saída é direta.

## Decisão

1. Só o dono muda o papel de um adulto. O papel da criança sem conta continua nulo.
2. Só o dono passa a posse, e só para quem já entrou. A linha fica em `trip_ownership_transfers`. O novo dono recebe o papel de dono. Quem passou a posse fica viajante supremo.
3. Dono e supremo removem qualquer pessoa, menos o dono. Quem sai preenche `removed_at`, menos o dono, que precisa passar a posse antes.
4. Supremo e experiente continuam convidando sem aprovação do dono.

## Consequências

Quem saiu deixa de ver a viagem. Não há segunda confirmação de remoção.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, comentários de `trip_participants` e `trip_ownership_transfers`
- `adrs/0018-participantes.md`
- `adrs/0019-convites.md`
