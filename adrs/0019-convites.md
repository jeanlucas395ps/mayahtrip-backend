# 0019 — Convite da viagem

- Status: aceito
- Data: 2026-11-18

## Contexto

O passo 3 da viagem nova e a folha de compartilhar mandam um convite por e-mail. O papel é escolhido nesse momento. O link é de uso único e não expira. Aceitar e recusar estão em `BUSINESS/06`. O papel padrão do convite continua aberto. Push e a central ficam para o item de notificação. O provedor de push já é o Firebase FCM; a credencial entra depois, por variável de ambiente.

## Decisão

1. Criar a viagem aceita uma lista opcional de e-mail e papel. O papel é `supreme_traveler`, `experienced_traveler` ou `junior_assistant`. Não há papel padrão. Dono não é papel de convite.
2. Cada convite grava um participante com o nome antes do `@`, sem conta, e uma linha em `trip_invitations` com o e-mail. O token guardado é o SHA-256. O e-mail leva o token no idioma de quem recebe. Sem conta, usa o idioma de quem convidou.
3. Só a conta daquele e-mail abre, aceita ou recusa. Abrir ou decidir preenche `opened_at`. Outra pessoa não consome o link. Aceitar liga a conta e a entrada. Recusar marca a saída e a pessoa deixa de ver a viagem.
4. Dono, supremo e experiente convidam. O júnior não. Troca de papel, remoção e posse continuam no item seguinte.
5. Convite pendente na lista, reenvio e convite só por link continuam abertos.

## Consequências

O push do convite espera o item de notificação e a credencial do FCM. Quem recusa não gera ainda a notificação da central.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, comentários de `trip_invitations` e `trip_invitation_tokens`
- `mayahtrip-base/.docs/BUSINESS/06-notificacoes.md`
- `mayahtrip-base/.docs/BUSINESS/26-compartilhar-viagem-e-papeis.md`
- `mayahtrip-base/.docs/BUSINESS/35-idioma-e-moeda.md`
