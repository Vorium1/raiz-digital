# Mercado Pago — homologação financeira da RAIZ Digital

Estado desta etapa: **fundação segura implementada; cobrança automática continua desligada**.

## O que já está protegido

1. O endpoint `POST /api/webhooks/mercado-pago` exige `x-signature`, `x-request-id` e `data.id`.
2. A assinatura é validada por HMAC-SHA256 em tempo constante usando o manifesto oficial `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
3. O corpo recebido nunca é autoridade para status, valor ou liberação de acesso. Para eventos `payment`, a RAIZ consulta `GET /v1/payments/{id}` com o Access Token e só usa a resposta oficial.
4. `payment_events` fornece idempotência por evento do provedor. Reentrega de webhook já concluído retorna sucesso sem repetir efeito.
5. A fatura só é reconciliada quando a resposta oficial carrega uma `external_reference` RAIZ válida, tenant/fatura existem sob RLS, moeda é BRL e o valor é exatamente igual ao ledger.
6. Uma fatura já paga recebendo outro `payment_id`, divergência de valor/moeda ou referência inválida entra em revisão; não há correção silenciosa.
7. O webhook **não altera `subscriptions.status`, `tenants.status` nem bloqueia usuários**. Carência/bloqueio só será ativado em uma etapa posterior, após homologação de cobrança e regras comerciais.

## External reference

`src/lib/mercado-pago.ts` produz uma referência compacta no formato:

`rz_<tenant UUID compactado>_<invoice UUID compactado>`

Ela fica abaixo de 64 caracteres e usa apenas letras, números, hífen e sublinhado. Isso permite recuperar o tenant antes de consultar a fatura, mantendo o acesso pelo papel `raiz_app` dentro do contexto RLS em vez de fazer consulta global a dados financeiros.

## Configuração do ambiente

Segredos obrigatórios para homologar:

- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET`

Cadastrar como URL do webhook:

`https://SEU-DOMINIO/api/webhooks/mercado-pago`

Ativar inicialmente o tópico **Pagamentos (`payment`)**. Os tópicos de assinatura podem ser recebidos, mas nesta etapa são confirmados sem alterar o ledger porque recorrência automática ainda não foi ativada.

Nunca colocar esses segredos em `NEXT_PUBLIC_*`, código fonte, issue, PR ou documentação com valor real.

## Critérios para homologação

Antes de ativar cobrança comercial:

- `npm run test:billing` verde;
- `npm run test:handoff` verde;
- build de produção verde;
- credenciais de teste configuradas somente no ambiente de Preview/homologação;
- um pagamento de teste criado pela integração futura com `external_reference` RAIZ;
- webhook recebido com assinatura válida;
- `payment_events` contendo uma única execução efetiva mesmo após reentrega;
- status da fatura igual ao status consultado novamente na API oficial;
- teste negativo de valor/moeda divergente sem alteração da fatura;
- confirmação de que nenhuma mudança de acesso ocorre apenas pelo webhook;
- só depois disso definir a política de emissão recorrente, carência, lembretes e bloqueio.

## Fontes oficiais consultadas em 2026-09-13

- Mercado Pago Developers — Webhooks / validação de origem: https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/additional-content/your-integrations/notifications/webhooks
- Mercado Pago Developers — Checkout Pro / notificações de pagamento: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications
- Mercado Pago Developers — API de Assinaturas: https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/overview

A documentação oficial orienta a confirmar a recepção com HTTP 200/201 e consultar o recurso completo no endpoint correspondente depois da notificação. É por isso que a RAIZ não deriva estado financeiro do JSON do webhook.
