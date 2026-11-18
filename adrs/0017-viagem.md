# 0017 — Viagem, carteira e capa

- Status: aceito
- Data: 2026-11-18

## Contexto

O plano pede criar a viagem, a carteira, a capa e um orçamento único. O status do cartão sai das datas. O teto do calendário e o dos dias flexíveis estão em `platform.system_settings`. Participante, convite, clone e roteiro são os itens seguintes. Editar e excluir a viagem continuam `A DEFINIR`.

## Decisão

1. Quem cria é o dono, em `POST /v1/trips`. A viagem nasce privada. O nome, se não vier, junta os destinos com “ e ”.
2. Datas pedem ida e volta, daqui para a frente. Sem data, a viagem é rascunho e guarda só a duração. Os dois modos no mesmo pedido são recusados.
3. O número de dias inclusos não passa de `trip_calendar_max_days`. A duração do rascunho não passa de `trip_flexible_max_days`. Os dois valores são lidos da configuração. Se a linha não existir, a criação para.
4. Acima de 14 dias o começo só pode ser do zero. Esta entrega não gera roteiro.
5. O orçamento é um valor e uma moeda ativa para a viagem inteira. Os dois vêm juntos ou não vêm.
6. A carteira devolve todas, próximas ou rascunhos. Próximas são as que acontecem agora e as futuras. A ordem é a data de início, e o rascunho fica no fim. O status não é coluna.
7. A capa é uma imagem JPG, PNG ou WebP, até 10 MB. A resposta não traz a chave. O download devolve os bytes.
8. Gravar a viagem chama `registrarDaViagem`. Viagem que ainda não acabou não entra no mapa visitado. O país planejado é contado na leitura do mapa.

## Consequências

A linha de participante, o convite, o clone e os dias do roteiro continuam nos itens seguintes. O painel ainda não lista viagem.

## Referências

- `mayahtrip-base/.docs/BUSINESS/14-nova-viagem.md`
- `mayahtrip-base/.docs/BUSINESS/15-carteira-de-viagens.md`
- `mayahtrip-base/.docs/TECH/TECH.md` §4.5
