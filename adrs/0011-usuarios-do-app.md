# 0011 — Usuários do app no painel

- Status: aceito
- Data: 2026-11-18

## Contexto

`PANEL/04` pede achar a conta, ver a ficha e ativar, desativar, excluir ou restaurar. Inativo não entra. A exclusão é lógica e pode ser restaurada. Desativar não apaga viagem nem publicação. Excluir não apaga pagamento nem assinatura. Convidado não é usuário.

## Decisão

1. Desativar grava `status = inactive` e revoga as sessões da conta, do mesmo jeito que a troca de senha. Ativar grava `status = active` e não preenche `email_verified_at`.
2. Excluir só preenche `deleted_at` e revoga as sessões. O `status` fica como estava. Restaurar limpa `deleted_at`. A conta volta com os mesmos dados.
3. Ativar ou desativar uma conta excluída é recusado até a restauração.
4. A lista inclui excluídos, para que a restauração seja possível. Devolve no máximo 50, as mais recentes. O plano vigente é a assinatura em curso; sem ela, PRO promocional aberto vale `pro`; senão, `free`.
5. A auditoria não guarda senha, token nem hash.

## Consequências

Uma conta ativada sem confirmação de e-mail entra no app e a ficha continua dizendo que o e-mail não foi verificado. O access token some na hora quando o índice da família ainda está no Redis; se o índice faltou, ele vive até os 15 minutos já aceitos.

## Referências

- `mayahtrip-base/.docs/PANEL/04-usuarios.md`
- `mayahtrip-base/.docs/TECH/mayahtrip.sql` (`identity.users`)
