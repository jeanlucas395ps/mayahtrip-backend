# 0012 — Leitura da geografia

- Status: aceito
- Data: 2026-11-18

## Contexto

O plano pede a leitura de continente, país, região, cidade, apelido e tradução para destino, lugar e mapa. Os idiomas são `pt-BR`, `pt-PT`, `en` e `es`. Quem edita o mapa-múndi continua aberto, então não há tela de CRUD. A busca da nova viagem lista cidades cujo nome ou país contém o texto.

## Decisão

1. A escrita fica no seed. Esta entrega só lê.
2. A busca de destino casa nome, tradução e apelido da cidade e do país. Sem texto, a lista vem vazia. O máximo é 20.
3. O nome exibido é a tradução do idioma pedido. Sem tradução, vale o nome gravado na tabela.
4. A ficha da cidade traz região, país e continente. O mapa lista países e continentes com esse mesmo nome traduzido.
5. Idioma ausente ou fora dos quatro volta para `pt-BR`.

## Consequências

A barra por continente do mapa visitado continua esperando um seed completo. Somar os países que existem hoje na tabela não é o total do continente.

## Referências

- `mayahtrip-base/.docs/TECH/TECH.md` §4.2
- `mayahtrip-base/.docs/BUSINESS/14-nova-viagem.md`
- `mayahtrip-base/.docs/BUSINESS/32-onde-ja-estive.md`
