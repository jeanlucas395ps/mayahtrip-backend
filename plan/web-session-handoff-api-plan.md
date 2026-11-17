# Plano — web-session-handoff-api

## Contexto e problema

O app precisa abrir o site já autenticado sem colocar access ou refresh na URL. `045-sign-up-web` foi descartada: o site não cria conta.

## Objetivo e critérios de aceite

`POST /v1/auth/handoff` (com access token) emite um código opaco de uso único. `POST /v1/auth/handoff/exchange` troca esse código pelo par access+refresh. AC de `047-web-session-handoff-api.md`.

## Escopo

Dentro: tabela `codigo_handoff`, hash sha256, TTL proposto de 60 s (`HANDOFF_TTL_SEGUNDOS`). A troca cria sessão com manter conectado.

Fora: formato do cookie do site, domínio público do site (`A DEFINIR`), botão no app.

## Abordagem

O código segue o mesmo padrão do refresh. Reuso e código vencido respondem inválido. A troca não exige a linha de sessão anterior: o JWT basta para emitir o código.

## Como testar

`npm test` — casos de handoff em `test/identidade.e2e.spec.ts`.

## Riscos

60 s ainda não está confirmado pelo produto. Subir o TTL é variável de ambiente, sem migration.
