# Plano — confirm-account-api

## Contexto e problema

`042-sign-up-api` cria a conta pendente e envia o código. `BUSINESS/02-cadastro-e-verificacao.md` pede confirmar o código de 4 dígitos (10 min, 5 tentativas) e reenviar depois de 30 s.

## Objetivo e critérios de aceite

`POST /v1/auth/confirm` e `POST /v1/auth/resend-code` cobrindo os AC de `043-confirm-account-api.md`, menos o limitador só do confirm: esse limite passou a ser o guarda único de `048-rate-limit-api`.

## Escopo

Dentro: agregado `Conta`, repositório Postgres, mensagens nos quatro idiomas, testes de domínio e e2e com relógio controlado.

Fora: e-mail de boas-vindas (`A DEFINIR`), tela do app, um segundo limitador por rota.

## Abordagem

O código expirado consome tentativa. A sexta tentativa responde bloqueio sem consultar o código. E-mail desconhecido no confirm devolve o mesmo erro de código incorreto, sem persistir. Reenvio cedo demais não envia outro e-mail. Reenvio de e-mail desconhecido responde sucesso sem enviar.

## Impacto

Colunas de tentativas na conta. Sem store novo.

## Como testar

`npm test` no `mayahtrip-backend`, em especial `test/identidade.e2e.spec.ts` e `conta.entity.spec.ts`.

## Riscos

O relógio do e2e avança e não volta. Reverter a migration `IdentidadeSessaoHandoff` desfaz as colunas.
