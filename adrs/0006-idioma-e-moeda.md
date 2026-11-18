# 0006 — Idioma e moeda da conta

- Status: aceito
- Data: 2026-11-18

## Contexto

`BUSINESS/35` manda idioma e moeda a partir do lugar, com “Minha localização” como padrão e a escolha explícita prevalecendo. Sem localização, `pt-BR` e BRL. `ARCHITECTURE.md` nomeia `ipapi.co` para essa localização. A folha do protótipo desenha quatro moedas; a tabela do mesmo arquivo e o seed nomeiam dez moedas de exibição.

## Decisão

1. A API chama `ipapi.co` com o IP da conexão. IP local não sai da máquina e vale como sem localização.
2. País da tabela fecha o idioma. País de fora usa `pt-BR`. A moeda local só entra se estiver em `finance.currency_definitions` com `is_display` e ativa. Fora disso, BRL.
3. Idioma e moeda têm cada um o seu “seguir localização”. A escolha explícita não muda quando o IP muda. O fuso acompanha a localização e não é editável.

## Alternativas consideradas

- O app chamar `ipapi.co`: descartado. O app só fala com a API.
- Limitar a moeda às quatro desenhadas na folha: descartado. A tabela e o seed fecham as dez.

## Consequências

Sem resposta do provedor, a conta fica em `pt-BR` e BRL. O fuso anterior permanece. A folha do app ainda pode desenhar só quatro moedas; a API aceita as dez.

## Referências

- `mayahtrip-base/.docs/BUSINESS/35-idioma-e-moeda.md`
- `mayahtrip-base/.docs/ARCHITECTURE.md` §3
- `mayahtrip-base/.docs/TECH/mayahtrip.sql` (`user_preferences`, `currency_definitions`)
