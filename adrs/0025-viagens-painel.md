# 0025 — Viagens no painel

- Status: aceito
- Data: 2026-11-18

## Contexto

O painel encontra a viagem, liga, desliga, publica ou apaga. O status de data continua calculado. O painel não edita parada, gasto, mala, compra nem documento.

## Decisão

1. `travel.trips.is_active` guarda o liga e desliga. Desligada, a viagem some do app até voltar a ativa.
2. A lista filtra dono, destino, status, começo, datas, só ativas e só públicas.
3. Excluir preenche `deleted_at`. Onde a viagem pública aparece no app continua aberto.

## Consequências

Uma instalação nova já nasce com a coluna. A migration acrescenta a coluna no banco que já existia.

## Referências

- `mayahtrip-base/.docs/PANEL/03-viagens.md`
