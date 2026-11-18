# Plano — idioma e moeda

Item do checklist em `plan/backend-e-painel-plan.md`: `identity.user_preferences`.

## Contexto

`BUSINESS/35` deixa “Minha localização” como padrão dos dois. A escolha explícita prevalece. Sem localização, ou país fora da tabela, o idioma é `pt-BR` e a moeda é BRL. Os quatro idiomas estão fechados. As moedas de exibição são as dez com `is_display` no seed. O fuso vem da localização e não é uma escolha da folha. Quem consulta o lugar é a API, em `ipapi.co`.

## Objetivo

`GET` e `PATCH /v1/me/preferences` leem e gravam a linha. Idioma e moeda podem seguir a localização em separado. A moeda explícita precisa estar entre as de exibição ativas.

## Fora

Converter gasto, orçamento e lista de compras. O catálogo de moedas como rota própria. Aparência. O efeito visual da folha.

## Como testar

`npm test` e `npm run typecheck`. O teste grava e lê `identity.user_preferences`. O localizador é substituído no teste.
