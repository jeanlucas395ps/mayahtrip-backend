# 0004 — Sair da sessão local e gravar a senha nova

- Status: aceito
- Data: 2026-11-18

## Contexto

`BUSINESS/03` e `BUSINESS.md` §4.7 dizem que “Sair” encerra a sessão local e que a senha nova encerra as sessões dos outros aparelhos. O access JWT dura 15 minutos, não é gravado no Postgres e não carrega o id da sessão (`mayahtrip.sql`, ADR 0001). A sessão que o produto chama de local é a família do refresh.

A recuperação começa na tela de login. Não existe, nesse fluxo, uma sessão atual para preservar.

## Decisão

1. Sair exige o access da conta e o refresh daquele aparelho. A API revoga só a família desse refresh, e só quando o jti do access está no índice Redis da família. Se o índice estiver vazio, a família apresentada ainda é revogada e o jti atual entra na denylist. Outra família da mesma conta continua válida.
2. O código de senha fica em `identity.user_verification_codes` com propósito `password_reset`, só como sha256. As regras são as do cadastro: 4 dígitos, 10 minutos, 5 tentativas, reenvio depois de 30 segundos.
3. Conferir o código não queima a linha. Gravar a senha queima o código, troca o hash Argon2id e revoga todas as famílias de refresh da conta. Os jti conhecidos dessas famílias entram na denylist.
4. E-mail desconhecido, conta pendente ou inativa recebe a mesma resposta do pedido de código, sem envio. A resposta não distingue esses casos.

## Alternativas consideradas

- Guardar o id da sessão no access JWT: descartado. O SQL deixa o access fora do Postgres e a validação de todo pedido continuaria sem ler a sessão.
- Sair só colocando o jti atual na denylist: descartado. O refresh daquele aparelho continuaria emitindo outro access.
- Preservar uma família na recuperação de senha: descartado neste fluxo, porque ele começa deslogado. Não há família local para manter.

## Consequências

Quem recupera a senha perde a sessão em todos os aparelhos, inclusive um que ainda estivesse aberto. O access cujo jti o Redis não indexou pode viver até os 15 minutos se a denylist não o alcançar. O e-mail de aviso da troca continua `A DEFINIR` e não é enviado.

## Referências

- `mayahtrip-base/.docs/BUSINESS/03-recuperar-senha.md`
- `mayahtrip-base/.docs/BUSINESS/BUSINESS.md` §4.7
- `mayahtrip-base/.docs/TECH/mayahtrip.sql` (`user_sessions`, `user_verification_codes`)
- ADR 0001
