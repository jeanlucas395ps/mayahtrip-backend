# 0033 — Publicação, avaliação, comentário, seguir e bloqueio

- Status: aceito
- Data: 2026-11-18

## Contexto

A pessoa publica em um ou mais lugares, avalia com nota e foto, comenta em um nível e curte. O perfil público segue direto. O privado pede. Bloquear é mútuo e silencioso. Silenciar só esconde o feed de quem silenciou.

## Decisão

1. A publicação nasce publicada. A privada só aparece para o autor. A avaliação vira publicação pública do lugar, com uma capa, e a mesma pessoa pode avaliar o lugar de novo. Sem texto, a legenda fica “Sem legenda.”
2. A foto é JPG, PNG ou WebP, até 10 MB e 1920 px. A primeira mídia é a capa. A resposta não devolve a chave.
3. O comentário tem um nível. O autor da publicação apaga qualquer um. A resposta some junto. A curtida alterna.
4. O feed “Para você”, “Seguindo” e “Salvos” lista o que já está fechado: público, sem bloqueio e sem silêncio, do mais novo para o mais antigo. Não há ordenação inventada.
5. Bloquear também deixa de seguir, nos dois sentidos, e apaga o pedido pendente. A outra pessoa não é avisada.

## Consequências

Menção, curtida e comentário ainda não geram a notificação da central. Isso fica com o módulo de notificação. “Quem pode te marcar” continua aberto.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, schema `community`
- `mayahtrip-base/.docs/BUSINESS/09-feed.md`, `10-comentarios.md`, `12-avaliacoes.md`, `29-posts.md`, `30-social.md`, `31-privacidade.md`
