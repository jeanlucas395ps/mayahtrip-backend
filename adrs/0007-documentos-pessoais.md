# 0007 — Documentos pessoais

- Status: aceito
- Data: 2026-11-18

## Contexto

`identity.user_documents` fecha CPF, CNH, passagem de ônibus e passagem de avião, em JPG, PNG, WebP ou PDF. A constraint exige código legível para preencher `wallet_provider`. `BUSINESS/25` ainda deixa a tela “Meus documentos” em aberto e cita passaporte e validade, que não são colunas. `TECH.md` dizia que a tabela não existia. O SQL de 18 Nov prevalece. O painel não lê documento.

## Decisão

1. Só o dono grava, lista, baixa e exclui. A exclusão preenche `deleted_at` e apaga o objeto. A resposta não devolve a chave nem o código.
2. O código legível chega no pedido. A API não varre o arquivo. Sem código, `wallet_provider` fica vazio. Com código, a carteira pode ser Google ou Apple. `wallet_object_id` fica vazio: emitir o passe não está fechado.
3. O arquivo reusa o teto de 10 MB já fechado para foto. Não há número próprio de documento.

## Alternativas consideradas

- A API ler o código de barras do arquivo: descartado. O formato não está fechado e exigiria biblioteca nova.
- Chamar a API da Google ou da Apple: descartado. Não há credencial nem classe de passe fechadas.

## Consequências

A tela do app ainda pode mudar o texto. Passaporte e validade não entram nesta tabela. O painel não ganha rota.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql` (`user_documents`)
- `mayahtrip-base/.docs/BUSINESS/25-documentos-e-links.md`
- `mayahtrip-base/.docs/ARCHITECTURE.md` §3
