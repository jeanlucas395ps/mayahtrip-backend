# Plano — perfil do viajante

Item do checklist em `plan/backend-e-painel-plan.md`: `identity.user_profiles`.

## Contexto

`BUSINESS/34` descreve nome, usuário, cidade, link e bio de 150. Campo vazio mantém o valor anterior. O `@` inicial sai. A unicidade e os caracteres ficaram fechados em 18 Nov e em `mayahtrip.sql`: único sem distinguir maiúscula; letras, números, ponto, underline e hífen; de 1 a 80. A visibilidade nasce pública. Privado só mostra o conteúdo a quem já segue (`user_follows`). A foto é JPG ou PNG, recortada no centro e reduzida a 256 × 256. O arquivo vai para o Cloud Storage; o Postgres guarda a chave.

## Objetivo

- `GET` e `PATCH /v1/me/profile` leem e gravam a linha de quem está logado.
- `POST /v1/me/profile/avatar` recorta, grava o arquivo e a chave.
- `GET /v1/profiles/:username` e o avatar correspondente escondem bio, cidade, link e foto quando o perfil é privado e quem olha não segue.

## Fora

Seguir, pedido de seguir, bloqueio e silêncio. `country_id` continua nulo: a folha tem um texto de cidade, não o mapa. O fluxo de aprovação do pedido privado continua `A DEFINIR`.

## Como testar

`npm test` e `npm run typecheck`. O teste grava e lê `identity.user_profiles`.
