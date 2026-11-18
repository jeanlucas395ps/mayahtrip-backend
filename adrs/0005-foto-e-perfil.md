# 0005 — Foto e edição do perfil

- Status: aceito
- Data: 2026-11-18

## Contexto

`BUSINESS/34` manda recortar a foto no centro e reduzi-la a 256 × 256. `ARCHITECTURE.md` coloca essa foto no Google Cloud Storage. `identity.user_profiles.avatar_storage_key` guarda a chave, não o binário. O app só fala com a API.

O username deixou de ser `A DEFINIR` em 18 Nov: único sem distinguir maiúscula, com letras, números, ponto, underline e hífen.

## Decisão

1. A API recebe a imagem, recorta e reduz, e grava o resultado no bucket `GCS_BUCKET`. A coluna fica com a chave `avatars/{userId}/{id}`.
2. Sem bucket configurado, o upload falha. O teste usa um armazenamento em memória no lugar do bucket.
3. A leitura pública devolve bio, cidade, link e foto só quando o perfil é público, quando quem olha é o dono, ou quando existe linha em `community.user_follows`.

## Alternativas consideradas

- O app enviar o arquivo direto ao bucket: descartado. O app não fala com o Cloud Storage.
- Guardar o binário no Postgres: descartado. A coluna é a chave.

## Consequências

Trocar a foto deixa o objeto anterior no bucket até um apagamento best-effort. Se esse apagamento falha, o objeto antigo permanece. O nome do bucket não é decisão de produto; vem do ambiente e fica vazio no exemplo.

## Referências

- `mayahtrip-base/.docs/BUSINESS/34-editar-perfil.md`
- `mayahtrip-base/.docs/BUSINESS/31-privacidade-e-bloqueios.md`
- `mayahtrip-base/.docs/ARCHITECTURE.md` §3
- `mayahtrip-base/.docs/TECH/mayahtrip.sql` (`user_profiles`, `user_follows`)
