# 0001 — Identidade: senha, tokens e persistência

- Status: aceito
- Data: 2026-11-16

## Contexto

`ARCHITECTURE.md` (mayahtrip-base) deixava abertos: (6.1) o que vai em Postgres vs MongoDB vs Redis vs Kafka; a escolha de mecanismo de autenticação/sessão. `DEVELOPMENT.md` §3 citava bcrypt para senha, divergindo de `ARCHITECTURE.md` §3, que já fixava Argon2id. Essas lacunas bloqueavam a implementação do módulo de identidade (specs `042-sign-up-api`, `043-confirm-account-api`, `044-sign-in-api`, `047-web-session-handoff-api` em `mayahtrip-base/.specs`). As decisões abaixo foram tomadas em conversa com o responsável do produto em 2026-11-16 e já estão refletidas nessas specs; esta ADR formaliza o motivo e a alternativa descartada, conforme `RULES.md` §2.

## Decisão

1. **Hash de senha**: Argon2id (biblioteca `argon2`). `DEVELOPMENT.md` foi corrigido para remover a menção a bcrypt.
2. **ORM**: TypeORM, com `synchronize: false` sempre, e **migration obrigatória** para toda mudança de schema (nunca sincronização automática). Esta ADR fixa o ORM que `ARCHITECTURE.md` §6 deixava aberto.
3. **Access token**: JWT assinado (`@nestjs/jwt`), **stateless**, duração fixa de **15 minutos**. Nenhuma consulta a banco no caminho feliz de validação — só assinatura e expiração.
4. **Refresh token**: opaco, aleatório, **persistido com hash no Postgres** (tabela própria, uma linha por sessão), com **rotação a cada uso** (reuso de um token já consumido revoga a sessão inteira). Duração ainda não fechada pelo produto (proposta: 30 dias com "manter conectado", 1 dia sem — ver `044-sign-in-api.md` Perguntas em aberto).
5. **Revogação imediata de access token**: lista de `jti` bloqueados no **Redis**, com TTL igual ao tempo restante até a expiração natural do token (máx. 15 min). Único uso de Redis nesta ADR — não é cache de sessão de uso geral.
6. **Usuário pendente e código de verificação** (cadastro/confirmação) e **código de handoff** (`047-web-session-handoff-api`): persistidos no **Postgres**, pela mesma tabela/módulo de usuário — mesmo um cadastro nunca confirmado tem valor como futuro lead, por isso não usa um cache com expiração automática (Redis) que o faria desaparecer.

## Alternativas consideradas

- **bcrypt** para senha: descartado por já estar fixado como Argon2id em `ARCHITECTURE.md` §3; a menção a bcrypt em `DEVELOPMENT.md` era um erro de documentação, corrigido no mesmo câmbio da spec `042-sign-up-api`.
- **Prisma** como ORM: viável, mas TypeORM foi escolhido por ter o padrão de migration mais direto já coberto pela skill `nestjs-best-practices` usada neste projeto; sem comparação de performance feita, decisão por familiaridade/tooling.
- **Sessão em Redis (stateful) em vez de JWT stateless**: descartado — exigiria consulta a Redis em toda chamada autenticada; o padrão escolhido só toca Redis no caso raro de revogação imediata.
- **Refresh token em Redis** (TTL automático) em vez de Postgres: descartado pelo mesmo motivo do item 6 — o responsável do produto quis manter o dado de sessão/cadastro em banco durável, não num cache que expira sozinho.

## Consequências

**Positivas**: validar um access token é barato (sem I/O) na maioria das chamadas; revogação de emergência ainda é possível sem esperar a expiração natural; refresh token rotativo limita o estrago de um roubo de token; nenhum dado de usuário pendente é perdido silenciosamente.

**Negativas**: exige manter dois armazenamentos coordenados (Postgres para refresh/pendência, Redis só para denylist) — mais uma peça de infraestrutura a operar e monitorar; revogação de emergência depende de Redis estar no ar (comportamento de falha do Redis — aceitar ou recusar — ainda é pergunta aberta em `044-sign-in-api.md`); TypeORM amarra o projeto a esse ORM específico, trocar depois exige reescrever repositórios e migrations.

## Referências

- `mayahtrip-base/.docs/ARCHITECTURE.md` §3, §5, §6
- `mayahtrip-base/.docs/DEVELOPMENT.md` §3, §9
- `mayahtrip-base/.specs/042-sign-up-api.md` (D-1, D-4, D-5)
- `mayahtrip-base/.specs/043-confirm-account-api.md` (D-2, D-3)
- `mayahtrip-base/.specs/044-sign-in-api.md` (D-4, D-5, D-7)
- `mayahtrip-base/.specs/047-web-session-handoff-api.md` (D-2)
