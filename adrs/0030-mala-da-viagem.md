# 0030 — Mala da viagem

- Status: aceito
- Data: 2026-11-18

## Contexto

A viagem nova copia o catálogo ativo para a mala de cada pessoa. Ninguém vê a mala alheia, salvo quem o dono da mala autorizar. Dá para editar, remover um item e esvaziar. A sugestão da Maya fica de fora.

## Decisão

1. Cada participante recebe os itens padrão dos grupos ativos. A lista de quem vê nasce vazia.
2. Quem tem conta mexe na própria mala. Pessoa sem conta fica com o dono da viagem até entrar.
3. Quem só foi autorizado vê e não edita.

## Consequências

A BUSINESS/23 ainda fala em mala compartilhada e em 43 itens. O banco fecha 30 itens e uma mala por pessoa. A sugestão por clima não entra.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, `organization.trip_packing_items`
- `mayahtrip-base/.docs/BUSINESS/23-mala.md`
