# 0032 — Documentos e links

- Status: aceito
- Data: 2026-11-18

## Contexto

O documento guarda metadado no Postgres e o arquivo no storage. O painel não lê o arquivo. Júnior, experiente e quem só vê a viagem pública não entram nessa aba. O link fica ao lado.

## Decisão

1. Foto JPG, PNG, WebP ou PDF, até 10 MB, o mesmo teto da capa. A resposta não devolve a chave.
2. Só dono e supremo veem, enviam e apagam. Apagar preenche `deleted_at` e tira o arquivo do storage.
3. O link tem título e endereço. Dá para editar e remover.

## Consequências

A tela “Meus documentos” e a leitura automática da reserva continuam abertas. O limite de arquivo segue o teto já usado na capa porque a BUSINESS deixou o número em aberto.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, `organization.trip_documents`
- `mayahtrip-base/.docs/BUSINESS/25-documentos-e-links.md`
