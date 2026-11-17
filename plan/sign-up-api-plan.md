# Plano — sign-up-api (criar conta)

## Contexto e problema

`mayahtrip-backend` está vazio. A spec `mayahtrip-base/.specs/042-sign-up-api.md` (status rascunho, mas com escopo e AC-1 a AC-9 fechados) pede o primeiro endpoint real de identidade: criar conta pendente com nome/e-mail/senha e enviar código de verificação de 4 dígitos por e-mail. Tela correspondente no app: `mayahtrip-base/.docs/BUSINESS/02-cadastro-e-verificacao.md` (Passo 1).

## Objetivo e critérios de aceite

Implementar `POST /auth/sign-up` cobrindo AC-1 a AC-9 de `042-sign-up-api.md`:
validação de borda (nome, e-mail, senha ≥ 8, termos), hash Argon2id, criação de conta pendente, geração de código de 4 dígitos válido por 10 min, envio de e-mail (adapter SMTP, mockado em teste), resposta uniforme para e-mail já existente (sem enumeração), correlation id + métrica + log sem PII, rate limit por IP/e-mail.

## Escopo

**Dentro**: módulo `identidade` em `src/modules/identidade/` (domain/application/infrastructure/interface), migration da tabela de usuário, endpoint de cadastro, testes unitários (domínio/caso de uso) e de integração (Postgres real local).

**Fora**: confirmação de código (`043-confirm-account-api`, próxima fatia), login (`044`), e-mail de boas-vindas (`A DEFINIR` no negócio), qualquer tela de UI.

## Abordagem e alternativas descartadas

- TypeORM + migration manual (ver ADR `0001-identidade-tokens-persistencia.md`), não `synchronize: true` — descartado por risco em produção (regra do próprio `nestjs-best-practices`).
- TDD: testes de domínio/caso de uso primeiro (sem I/O), depois infraestrutura (migration real), depois integração HTTP — não "horizontal slicing" (não escrever todos os testes antes de qualquer implementação).
- Envio de e-mail via adapter com porta (`EmailSender`), implementação real com `nodemailer`/SMTP Hostinger e implementação mock para teste — sem instalar/assumir credencial real de SMTP (ficam em variável de ambiente, ver `RULES.md` §5).

## Impacto em arquitetura, dados, UI e segurança

- Arquitetura: primeiro módulo do backend; define o esqueleto que `confirm-account-api`/`sign-in-api` vão reaproveitar.
- Dados: nova tabela `usuario` (nome, e-mail, hash de senha, estado pendente/confirmado, código de verificação, expiração, tentativas) — Postgres, por migration.
- UI: nenhuma (esta fatia é só API).
- Segurança: Argon2id, resposta uniforme contra enumeração de e-mail, rate limit, log sem senha/código.

## Como testar

Vitest: domínio (value objects de senha/e-mail/código) e caso de uso com mocks de repositório/e-mail, sem I/O; depois teste de integração do repositório TypeORM contra Postgres real (`127.0.0.1:5432`, container já ativo); depois teste HTTP do módulo via testing module do Nest.

## Riscos e como desfazer

Risco: schema decidido agora (tabela `usuario`) precisar mudar quando `confirm-account-api`/`sign-in-api` forem implementadas — mitigado por migration incremental (nova migration altera, não recria). Desfazer: `down()` da migration remove a tabela; módulo é isolado, remover a rota não afeta outro código (nenhuma outra fatia depende dele ainda).
