# Plano — sair e senha nova

Item do checklist em `plan/backend-e-painel-plan.md`: sair encerra só a sessão local; trocar a senha encerra as outras sessões; `identity.user_verification_codes` ganha o propósito `password_reset`.

## Contexto

`BUSINESS/03` e `BUSINESS.md` §4.7 fecham as duas regras. O código de senha usa o mesmo componente do cadastro: 4 dígitos, 10 minutos, 5 tentativas, reenvio depois de 30 segundos. O access JWT não é sessão e não é gravado no Postgres (`mayahtrip.sql`). A sessão local é a família do refresh.

## Objetivo

- `POST /v1/auth/logout` revoga só a família do refresh apresentado, quando ele pertence à mesma conta do access e o jti desse access está no índice da família.
- `POST /v1/auth/forgot-password` e `POST /v1/auth/forgot-password/resend` gravam o código só como sha256, com propósito `password_reset`.
- `POST /v1/auth/forgot-password/confirm` confere o código sem queimá-lo.
- `POST /v1/auth/reset-password` grava a senha nova e revoga todas as famílias da conta.

## Fora

E-mail avisando que a senha mudou (`A DEFINIR`). Obrigar número e maiúscula (`A DEFINIR`). Troca de senha autenticada, com uma família preservada: o fluxo de `BUSINESS/03` começa no login, então não há sessão local para manter. Perfil, documentos e visitas.

## Como testar

`npm test` e `npm run typecheck`. O teste grava e lê `identity.user_verification_codes` e `identity.user_sessions`.
