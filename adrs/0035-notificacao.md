# 0035 — Central de avisos e token do aparelho

- Status: aceito
- Data: 2026-11-18

## Contexto

Toda notificação fechada nasce na central, nos quatro idiomas. Não há preferência por tipo. O push é Firebase FCM, mas a credencial ainda não está no ambiente.

## Decisão

1. O mesmo caso de uso grava a notificação, a entrega no app, a entrega push e o evento.
2. Os modelos cobrem boas-vindas, roteiro, convite, gasto, comentário, resposta, curtida, menção e o resultado da denúncia, em pt-BR, pt-PT, en e es.
3. A entrega no app sai como enviada. A entrega push fica pendente com o texto de que a credencial do Firebase FCM ainda não está no ambiente. Nada é enviado.
4. O app registra o token do aparelho. A resposta não devolve o token.

## Consequências

Sem a credencial, o push não sai. O nome da variável de ambiente não foi inventado. Menção, curtida, comentário e o resultado da denúncia já chamam a central. Convite, gasto, roteiro pronto e boas-vindas estão no modelo e ainda não têm o ponto de chamada do produto.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, schema `notification`
- `mayahtrip-base/.docs/BUSINESS/06-notificacoes.md`
