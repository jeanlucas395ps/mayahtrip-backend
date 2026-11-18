# 0008 — Países e cidades visitados

- Status: aceito
- Data: 2026-11-18

## Contexto

`BUSINESS/32` define visitado como marca manual ou país de viagem com data já passada, e planejado como país de viagem futura ainda não visitado. O SQL tem uma linha por pessoa e país, e outra por pessoa e cidade. A origem é `manual` ou `trip`.

## Decisão

1. A rota do dono só grava `manual`. `trip` nasce em `VisitasUseCase.registrarDaViagem`, que o corte de viagem chama ao criar a viagem.
2. Essa chamada grava país e cidade quando `end_date` é anterior a hoje. Viagem futura, viagem sem data ou destino sem cidade não gravam a tabela. O primeiro `trip_id` permanece. Marca manual vira `trip` quando a viagem passada chega, porque a pessoa não pode apagar uma visita que veio da viagem.
3. O percentual do mundo usa o divisor 195 fechado em `BUSINESS/32`, com mínimo de 1% quando há visita e teto de 100%. A barra por continente espera o seed da geografia.

## Alternativas consideradas

- Gravar também a viagem futura na tabela de visitados: descartado. A regra separa visitado de planejado, e a tabela não tem estado de planejado.
- Deixar a pessoa apagar a visita que veio da viagem: descartado. A folha manda editar a viagem.

## Consequências

Enquanto o corte de viagem não chamar `registrarDaViagem`, só a marca manual entra pela rota. O teste desse corte cobre a viagem passada chamando o caso de uso.

## Referências

- `mayahtrip-base/.docs/BUSINESS/32-onde-ja-estive.md`
- `mayahtrip-base/.docs/TECH/mayahtrip.sql` (`user_visited_countries`, `user_visited_cities`)
