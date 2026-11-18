# 0013 — Busca e página do lugar

- Status: aceito
- Data: 2026-11-18

## Contexto

O plano pede a busca e a página do lugar sobre `catalog.places`, as traduções, as categorias e o vínculo entre lugar e categoria. O comentário do SQL fecha a fonte: a busca do app lê este catálogo. Os chips de filtro, a dica da comunidade, a ordenação de produto e a busca por pessoas ou roteiros continuam abertos. Endereço, horário, preço, duração, mídia, nota e dica são tabelas dos itens seguintes.

## Decisão

1. A escrita fica no seed. Esta entrega só lê. O painel que cria e arquiva o lugar é o CRUD de `TECH.md` §6.3.
2. A busca casa o nome do lugar, a tradução desse nome, o nome da cidade, a tradução da cidade e o nome exibido da categoria. Sem texto, a lista vem vazia. O máximo é 20, em ordem de nome e id. Isso não é a ordenação de produto, que continua aberta.
3. O nome e a descrição exibidos são a tradução do idioma pedido. Sem tradução, valem as colunas do lugar. A categoria usa a tradução do idioma; sem ela, o slug.
4. Só entra lugar `active`. Arquivado some da busca e a página responde 404.
5. Idioma ausente ou fora dos quatro volta para `pt-BR`.
6. Bairro, horário, preço, duração, mídia, nota, dica, salvar e inserir no roteiro não entram nesta leitura.

## Consequências

A busca por bairro espera `catalog.place_addresses`. A página ainda não diz se o lugar está aberto nem quantos vídeos tem.

## Referências

- `mayahtrip-base/.docs/BUSINESS/07-busca.md`
- `mayahtrip-base/.docs/BUSINESS/08-pagina-do-lugar.md`
- `mayahtrip-base/.docs/TECH/TECH.md` §6.3
- `mayahtrip-base/.specs/009-busca.md`
- `mayahtrip-base/.specs/010-pagina-do-lugar.md`
