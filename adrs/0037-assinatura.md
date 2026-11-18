# 0037 — Cupom, PRO, plano e estorno

- Status: aceito
- Data: 2026-11-18

## Contexto

O viajante assina e troca o plano no site. O painel consulta, concede PRO, cria cupom e aprova estorno. Cupom e PRO não geram fatura e não se somam.

## Decisão

1. Cupom e PRO de 30 dias compartilham uma assinatura sem identificador na Asaas. Vale a data que termina por último. Revogar o PRO devolve o prazo do cupom, se houver.
2. Sem confirmação, a assinatura nasce `past_due` e o pagamento fica pendente. O webhook `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED` marca pago e ativa. Cartão e token saem do corpo gravado.
3. Troca de plano e estorno só mudam a assinatura quando a cobrança confirma. Falha grava o log e o estorno `failed`, e deixa o plano como estava.
4. As janelas de estorno ficam em `platform.system_settings`: teste 7 dias e cobrança duplicada 60. O último meio de pagamento ligado não desliga.
5. O adaptador da Asaas não chama a rede. Sem `ASAAS_API_KEY`, a cobrança fica aguardando e o estorno não sai. A chave não entra em log.

## Consequências

O teste cobre o caminho pago com um dublê. A chamada real à Asaas espera a chave no ambiente. O item de `system_settings` da seção seguinte continua aberto: só estas duas chaves foram gravadas.

## Referências

- `mayahtrip-base/.docs/TECH/mayahtrip.sql`, schema `subscription`
- `mayahtrip-base/.docs/PANEL/05-pro-promocional.md`, `09` a `14`
- `mayahtrip-base/.docs/WEB/03` a `05`
