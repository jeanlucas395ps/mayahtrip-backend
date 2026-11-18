# 0034 — Denúncia, recurso e fila editorial

- Status: aceito
- Data: 2026-11-18

## Contexto

A pessoa denuncia uma publicação, um comentário, uma avaliação ou um perfil. O admin julga. Procedente pode tirar o conteúdo e desativar a conta. O recurso só chega por e-mail. O que veio de fora passa por outra fila, distinta da denúncia.

## Decisão

1. A categoria é a semente do banco. O denunciante escolhe um alvo só.
2. Assumir marca a denúncia em análise. Julgar grava a ação e avisa só quem denunciou, na central, sem o motivo interno e sem push. A pessoa denunciada não é avisada de que foi denunciada.
3. Remover a publicação muda o status para `removed` e preserva a curtida. Restaurar volta para `published`. Desativar a conta encerra a sessão.
4. O recurso grava o canal `email`. Não há lista no app nem no painel.
5. A fila editorial nasce de um item de ingestão. Aprovar publica. O pedido de remoção tira a publicação do catálogo. Denúncia de usuário não entra nessa fila.

## Consequências

O prazo da denúncia continua aberto. O hub completo de fontes, jobs e Kafka fica na seção de ingestão. Sem a credencial do push, o resultado da denúncia fica só na central.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, schema `moderation`
- `mayahtrip-base/.docs/TECH/TECH.md`, seção 6.2
- `mayahtrip-base/.docs/PANEL/19-denuncias.md`, `20-publicacoes.md`
