# Plano — onde já estive

Item do checklist em `plan/backend-e-painel-plan.md`: `identity.user_visited_countries` e `identity.user_visited_cities`.

## Contexto

`BUSINESS/32` separa visitado e planejado. Visitado é marca manual ou viagem com data já passada. Planejado é viagem futura que ainda não foi visitada. O SQL guarda um país e uma cidade por pessoa, com `visit_source` `manual` ou `trip`. A tela do mapa continua na spec do app.

## Objetivo

O dono marca e remove país e cidade. A remoção manual não apaga o que veio de viagem. A viagem com `end_date` anterior a hoje grava país e cidade. A viagem futura não grava a tabela.

## Fora

O desenho do mapa, as bandeiras e a barra por continente. Quem edita a geografia no painel. Criar a viagem pela API: o corte de viagem chama `VisitasUseCase.registrarDaViagem`.

## Como testar

`npm test` e `npm run typecheck`. O teste grava e lê as duas tabelas.
