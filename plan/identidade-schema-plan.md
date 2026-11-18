# Plano — identidade no schema novo

## Contexto

O checklist em `plan/backend-e-painel-plan.md` (raiz do workspace) pede que login, refresh e handoff gravem em `identity.*`. O contrato HTTP de `042`, `043`, `044` e `047` não muda.

## Objetivo

`identity.users`, `user_profiles`, `user_preferences`, `user_auth_providers`, `user_sessions`, `user_verification_codes` e `user_handoff_codes` passam a ser lidas e escritas pelas rotas que já existem. A migration `1794852431569` copia `conta`, `sessao` e `codigo_handoff`.

## Fora

Recuperação de senha, sair da sessão local, perfil editável, documentos e visitas. O access JWT continua fora do Postgres. O jti da família fica no Redis só pelo tempo do access, para a revogação.

## Como testar

`npm test` e `npm run typecheck`.
