# 0015 — Nota e dicas do lugar

- Status: aceito
- Data: 2026-11-18

## Contexto

O plano pede o resumo recalculado pelas avaliações publicadas e as dicas aprovadas. A avaliação publicada está em `community.place_reviews`, com status `published`. A tabela de dicas não tem coluna de aprovação. A dica da busca, qual texto mostrar, continua `A DEFINIR`. Publicar a avaliação, com mídia e post, é o item de comunidade.

## Decisão

1. Ler o lugar ou a busca regrava `place_ratings_summary` a partir das avaliações com status `published`. Rascunho, oculta e removida não entram. A média fica com duas casas. Sem avaliação publicada, a média é nula e o total é zero.
2. Cada avaliação publicada conta, inclusive quando a mesma pessoa avalia o mesmo lugar de novo. O comentário do SQL já fechou isso.
3. Uma linha em `place_community_tips` é uma dica aprovada. Esta entrega não abre envio nem fila de aprovação. A página devolve as dicas, da mais nova para a mais antiga, no máximo 20. Esse teto não é número de produto.
4. A dica traz o nome e o usuário de quem escreveu. Não traz nota própria: a tabela não tem essa coluna.

## Consequências

A rota de publicar avaliação, com foto ou vídeo e post público, continua no item de comunidade. A caixa de dica da busca continua aberta.

## Referências

- `mayahtrip-base/.docs/BUSINESS/08-pagina-do-lugar.md`
- `mayahtrip-base/.docs/TECH/TECH.md` §4.3 e §4.4
