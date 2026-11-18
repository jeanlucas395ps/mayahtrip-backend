# 0009 — Sessão e auditoria do painel

- Status: aceito
- Data: 2026-11-18

## Contexto

`admin.admin_sessions` guarda o hash do token, o IP e a expiração. `admin.admin_login_attempts` guarda e-mail, IP e se entrou. `admin.admin_audit_logs` guarda ator, ação, entidade e os valores anterior e novo. O painel já entra com o mesmo segredo do access token e o payload `{ sub, tipo: 'admin' }`, sem `jti`. Nenhuma duração própria do painel foi fechada.

## Decisão

1. A sessão dura o tempo já configurado do access token (`JWT_ACCESS_TTL_SECONDS`). O Postgres guarda o SHA-256 do JWT, não o token. Sair preenche `revoked_at`. Token sem linha, linha revogada ou administrador inativo recebe 401.
2. Toda tentativa, certa ou errada, grava `admin_login_attempts`. A resposta continua indistinguível.
3. Auditoria cobre entrar, sair, criar, editar, ativar e desativar plano. A listagem não muda entidade e não gera linha. O JSON não leva senha, token nem hash.

## Alternativas consideradas

- Inventar uma sessão de horas para o painel: descartado. Não há número fechado.
- Guardar o JWT em claro: descartado. A coluna é hash.

## Consequências

Um token emitido antes desta sessão deixa de valer, porque não tem linha. O administrador entra de novo.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql` (`admin_sessions`, `admin_login_attempts`, `admin_audit_logs`)
- `mayahtrip-base/.docs/PANEL/02-administradores.md`
