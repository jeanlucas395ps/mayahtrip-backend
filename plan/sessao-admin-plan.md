# Plano — sessão e auditoria do painel

Item do checklist em `plan/backend-e-painel-plan.md`: `admin.admin_sessions`, `admin.admin_login_attempts`, `admin.admin_audit_logs`.

## Contexto

A conta do painel já entra com JWT `tipo: admin`. As três tabelas existem e ninguém grava nelas. Não há duração de sessão do painel fechada fora do access token já configurado.

## Objetivo

Cada tentativa de entrar fica registrada. O token aceito abre uma sessão. Sair revoga essa sessão. Criar, editar, ativar e desativar plano grava auditoria com o valor anterior e o novo, sem senha e sem token.

## Fora

Criar e desativar administrador (`PANEL/02`). A matriz de papéis. Uma duração de sessão diferente da do access token.

## Como testar

`npm test` e `npm run typecheck`. O teste grava e lê as três tabelas.
