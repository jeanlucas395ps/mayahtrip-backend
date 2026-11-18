# 0028 — Gastos e acerto

- Status: aceito
- Data: 2026-11-18

## Contexto

O gasto se divide em partes iguais, percentual ou valor fixo. Dá para editar, excluir e anexar uma imagem de recibo. O acerto não entra no total. O júnior não vê a aba. A notificação de gasto novo continua para o centro e o push, que ainda esperam a credencial.

## Decisão

1. A soma das cotas fecha o valor. Percentual que não soma 100 e valor fixo que não soma o gasto são recusados.
2. `fx_rate_date` é o dia do lançamento e não muda na edição. Moeda diferente da exibição grava a taxa da Frankfurter nesse dia.
3. O recibo é uma imagem JPG, PNG ou WebP de até 10 MB. A resposta não devolve a chave.
4. Desfazer o acerto preenche `undone_at`. O total gasto ignora acertos.

## Consequências

Exportar e a média de hospedagem continuam abertos. O gasto não gera notificação neste corte.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, `finance.expenses`
- `mayahtrip-base/.docs/BUSINESS/21-gastos.md`
