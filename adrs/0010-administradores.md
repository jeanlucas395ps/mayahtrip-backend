# 0010 — Administradores do painel

- Status: aceito
- Data: 2026-11-18

## Contexto

`PANEL/02` fecha nome, e-mail e senha, e-mail único, senha nova no lugar da anterior, e a recusa de excluir a própria conta quando ela é a única ativa. Conta desativada ou excluída não entra no painel e não entra no app. A matriz de papéis continua aberta: administrador ativo executa esta gestão.

## Decisão

1. Excluir preenche `deleted_at` e desliga `is_active`. A lista só mostra quem não foi excluído.
2. Trocar a senha revoga as sessões daquela conta. O hash novo é Argon2id. A auditoria não guarda a senha.
3. A própria exclusão é recusada quando não existe outro administrador ativo. Desativar o último ativo também é recusado: a conta desativada não entra, e o painel ficaria sem quem o opere.

## Alternativas consideradas

- Apagar a linha: descartado. A coluna é `deleted_at` e o histórico de auditoria aponta para o administrador.
- Permitir desativar o último ativo: descartado. O efeito prático é o mesmo da exclusão proibida.

## Consequências

O e-mail de uma conta excluída continua único, porque o índice não ignora `deleted_at`.

## Referências

- `mayahtrip-base/.docs/PANEL/02-administradores.md`
- `mayahtrip-base/.docs/TECH/mayahtrip.sql` (`admin_users`)
