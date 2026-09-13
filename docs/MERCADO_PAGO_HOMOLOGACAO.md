# Mercado Pago — homologação financeira da RAIZ Digital

Estado desta etapa: **webhook + Checkout Pro por fatura implementados com gate comercial explícito; recorrência e bloqueio automático continuam desligados**.

## O que já está protegido

1. O endpoint `POST /api/webhooks/mercado-pago` exige `x-signature`, `x-request-id` e `data.id`.
2. A assinatura é validada por HMAC-SHA256 em tempo constante usando o manifesto oficial `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
3. O corpo recebido nunca é autoridade para status, valor ou liberação de acesso. Para eventos `payment` e `order`, a RAIZ consulta novamente o recurso oficial com o Access Token antes de reconciliar o ledger.
4. `payment_events` fornece idempotência por evento do provedor. Reentrega de webhook já concluído retorna sucesso sem repetir efeito.
5. A fatura só é reconciliada quando a resposta oficial carrega uma `external_reference` RAIZ válida, tenant/fatura existem sob RLS, moeda é BRL e o valor é compatível com o ledger.
6. Uma fatura já paga recebendo outro identificador, divergência de valor/moeda ou referência inválida entra em revisão; não há correção silenciosa.
7. O webhook **não altera `subscriptions.status`, `tenants.status` nem bloqueia usuários**. Carência/bloqueio só será ativado em uma etapa posterior, após homologação e definição das regras comerciais.
8. O Checkout Pro é criado a partir de uma fatura real já existente, com idempotência por invoice e persistência do `provider_order_id`. Repetir o clique reutiliza a Order já registrada em vez de abrir cobranças paralelas.
9. A URL devolvida pelo provedor é aceita somente em HTTPS sob `mercadopago.com.br`/subdomínios; URL fora desse domínio falha fechada.
10. **Credenciais não ativam cobrança.** Mesmo com Access Token e segredo do webhook configurados, a rota de checkout retorna indisponível enquanto `MERCADO_PAGO_CHECKOUT_ENABLED` não for explicitamente `true`.

## External reference

`src/lib/mercado-pago.ts` produz uma referência compacta no formato:

`rz_<tenant UUID compactado>_<invoice UUID compactado>`

Ela fica abaixo de 64 caracteres e usa apenas letras, números, hífen e sublinhado. Isso permite recuperar o tenant antes de consultar a fatura, mantendo o acesso pelo papel `raiz_app` dentro do contexto RLS em vez de fazer consulta global a dados financeiros.

## Configuração do ambiente

Segredos obrigatórios para homologar webhook/reconciliação:

- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET`

Gate separado para permitir que usuários abram Checkout Pro:

- `MERCADO_PAGO_CHECKOUT_ENABLED=false` — padrão seguro durante configuração e testes de webhook;
- `MERCADO_PAGO_CHECKOUT_ENABLED=true` — usar somente no ambiente em que o Checkout Pro já foi homologado e pode ser exibido ao usuário.

Cadastrar como URL do webhook:

`https://SEU-DOMINIO/api/webhooks/mercado-pago`

Ativar os tópicos necessários ao fluxo homologado, inicialmente pagamentos/Orders usados pela RAIZ. Tópicos de assinatura podem chegar pela mesma aplicação, mas continuam sem alterar o ledger enquanto recorrência automática não estiver ativada.

Nunca colocar Access Token, segredo do webhook ou qualquer outra credencial em `NEXT_PUBLIC_*`, código fonte, issue, PR ou documentação com valor real.

## Sequência de homologação segura

1. Configurar credenciais **somente** no ambiente Preview/homologação, mantendo `MERCADO_PAGO_CHECKOUT_ENABLED=false`.
2. Confirmar assinatura/reentrega do webhook e consultas oficiais sem permitir checkout aos usuários.
3. Rodar `npm run test:billing`, `npm run test:handoff` e build de produção no mesmo head.
4. Somente no ambiente de homologação, mudar `MERCADO_PAGO_CHECKOUT_ENABLED=true`.
5. Abrir uma fatura pendente real de teste e iniciar o Checkout Pro pela RAIZ.
6. Confirmar que o `provider_order_id` foi persistido e que repetir a ação reutiliza a mesma Order.
7. Concluir um pagamento de teste e verificar que o webhook recebido é reconciliado contra o recurso oficial.
8. Reentregar a mesma notificação e confirmar uma única execução efetiva em `payment_events`.
9. Executar cenário negativo de valor/moeda/referência divergente e confirmar que a fatura não é corrigida silenciosamente.
10. Confirmar que nenhum evento de pagamento, aprovado ou rejeitado, altera acesso do tenant ou bloqueia usuários nesta fase.
11. Depois da homologação, decidir separadamente se/como o gate será habilitado em produção. Isso não autoriza recorrência automática, carência ou bloqueio.

## Critérios para homologação

Antes de considerar o checkout pronto para uso comercial:

- `npm run test:billing` verde;
- `npm run test:handoff` verde;
- build de produção verde;
- credenciais de teste configuradas somente no ambiente de Preview/homologação;
- `MERCADO_PAGO_CHECKOUT_ENABLED=true` somente durante o teste do Checkout Pro no ambiente autorizado;
- Order criada com `external_reference` RAIZ e valor da fatura real;
- segundo clique reutilizando a mesma Order persistida;
- webhook recebido com assinatura válida;
- `payment_events` contendo uma única execução efetiva mesmo após reentrega;
- status da fatura igual ao status consultado novamente na API oficial;
- teste negativo de valor/moeda divergente sem alteração indevida da fatura;
- confirmação de que nenhuma mudança de acesso ocorre apenas pelo webhook;
- só depois disso definir a política de emissão recorrente, carência, lembretes e bloqueio.

## Fontes oficiais consultadas em 2026-09-13

- Mercado Pago Developers — Webhooks / validação de origem: https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/additional-content/your-integrations/notifications/webhooks
- Mercado Pago Developers — Checkout Pro / notificações de pagamento: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications
- Mercado Pago Developers — API de Assinaturas: https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/overview

A documentação oficial orienta a confirmar a recepção e consultar o recurso completo no endpoint correspondente depois da notificação. É por isso que a RAIZ não deriva estado financeiro do JSON do webhook.
