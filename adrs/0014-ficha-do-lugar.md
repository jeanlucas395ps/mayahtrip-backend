# 0014 — Ficha do lugar

- Status: aceito
- Data: 2026-11-18

## Contexto

O plano pede a leitura de endereço, horário, preço, duração da visita, mídia e referência externa. A busca já casa nome, tradução, categoria e cidade. O bairro está na regra fechada de `BUSINESS/07` e mora em `place_addresses`. “Aberto agora” e a fila média continuam `A DEFINIR`. Quais fontes podem guardar ou republicar o arquivo também.

## Decisão

1. A escrita fica no seed. Esta entrega só lê. O painel que grava a ficha é o CRUD de `TECH.md` §6.3.
2. A busca também casa o bairro. A página devolve os endereços, os horários gravados, a faixa de preço, a duração e a informação de visita, e as referências externas.
3. A página não calcula se o lugar está aberto agora. O dia da semana volta como o número gravado, de 0 a 6.
4. Mídia com arquivo no storage entra na página e pode ser baixada pela API. A chave do objeto não vai na resposta. Mídia que só tem URL externa fica de fora: a resposta não leva a URL e o download responde 404. A API não copia o arquivo de fora.
5. Essas tabelas não têm idioma. O texto volta como foi gravado.

## Consequências

A fila média, o rótulo “Aberto agora” e a republicação do binário de um provedor continuam fora. Nota e dica da comunidade são o item seguinte.

## Referências

- `mayahtrip-base/.docs/BUSINESS/07-busca.md`
- `mayahtrip-base/.docs/BUSINESS/08-pagina-do-lugar.md`
- `mayahtrip-base/.docs/TECH/TECH.md` §4.3 e §4.12
