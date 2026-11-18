# Plano — administradores do painel

Item do checklist em `plan/backend-e-painel-plan.md`: `PANEL/02`.

## Contexto

`PANEL/02` pede criar, editar, ativar, desativar e excluir quem opera o painel. O e-mail é único. A senha nova substitui a anterior. Conta desativada ou excluída não entra. O administrador não exclui a própria conta enquanto for o único ativo. Esta conta não entra no app.

## Objetivo

Rotas em `/v1/admin/administrators` e a tela Administradores no painel, nos quatro idiomas, com os tokens do protótipo.

## Fora

A matriz dos sete papéis. Restaurar um administrador excluído. A conta do administrador no app.

## Como testar

`npm test` e `npm run typecheck` na API. `npx ng build` no painel. O teste grava e lê `admin.admin_users`.
