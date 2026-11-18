# 0016 — CRUD de lugar no painel

- Status: aceito
- Data: 2026-11-18

## Contexto

O painel precisa gravar o catálogo que a busca e a página só leem. `TECH.md` §6.3 pede lugar, categoria, tradução, endereço, horário, preço, duração, mídia autorizada, referência externa, unificar duplicata e arquivar. Quem edita a geografia continua aberto. Não há tela de mapa.

## Decisão

1. Quem grava é o admin, em `/v1/admin`, com `AdminGuard`. O viajante continua só lendo.
2. O PATCH substitui tradução, categoria, endereço, horário, preço, visita e referência. Não apaga mídia, dica nem avaliação.
3. Mídia autorizada é arquivo guardado: JPG, PNG, WebP ou MP4, até 10 MB. A chave é `catalogo/{lugar}/{uuid}`. O JSON e a auditoria não levam os bytes. URL externa não entra por este envio.
4. Arquivar grava `status = archived`. A busca e a página públicas já escondem o arquivado. Um PATCH pode voltar o lugar para `active`.
5. Unificar mantém o lugar do endereço e arquiva a origem. Endereço, horário, preço, visita, mídia, dica e avaliação mudam de lugar. Categoria copia o que o destino ainda não tem. Tradução copia só o idioma que o destino não tem. A referência externa muda de lugar no próprio registro, porque o par provedor e id é único. As duas notas são refeitas no sobrevivente.
6. Categoria em uso, ou com filha, não é excluída. Categoria não pode ser filha de si mesma. Cidade e categoria desconhecidas recusam a gravação.

## Consequências

A geografia continua por seed e leitura. A caixa de dica da busca e a fila de mídia externa continuam abertas.

## Referências

- `mayahtrip-base/.docs/TECH/TECH.md` §6.3
- `plan/backend-e-painel-plan.md`, item de CRUD de lugar
