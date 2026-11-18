# Plano — documentos pessoais

Item do checklist em `plan/backend-e-painel-plan.md`: `identity.user_documents`.

## Contexto

O SQL fecha CPF, CNH, passagem de ônibus e passagem de avião. O arquivo é imagem ou PDF. Google Wallet ou Apple Wallet só entram quando existe código legível. O painel não lê esta tabela. A tela “Meus documentos” continua aberta em `BUSINESS/25`.

## Objetivo

O dono envia, lista, baixa e exclui o próprio documento. A carteira sem código é recusada. O binário fica no storage e a linha guarda a chave.

## Fora

Passaporte, validade e a frase “De Meus documentos”, que a tela ainda não fecha. Emitir o passe na Google ou na Apple. Documento da viagem (`organization.trip_documents`). Qualquer rota de admin.

## Como testar

`npm test` e `npm run typecheck`. O teste grava e lê `identity.user_documents`. O storage é memória no teste.
