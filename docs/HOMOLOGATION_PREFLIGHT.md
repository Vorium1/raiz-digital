# RAIZ Digital — Preflight automático de homologação

## Objetivo

Reduzir o checklist operacional do piloto sem transformar configuração em homologação fictícia.

O comando `scripts/check-homologation-readiness.mjs` verifica apenas estados que podem ser avaliados de forma determinística e privacy-safe a partir do ambiente atual. Ele nunca emite GO de produção.

A evidência estruturada é gerada por `scripts/export-homologation-readiness.mjs`, que reutiliza exatamente o mesmo domínio `evaluateHomologationReadiness` e serializa apenas a visão sanitizada usada pela API interna. Não existe uma segunda regra de readiness para CI.

## O que o preflight automatiza

- configuração base já coberta por `check-production-readiness`;
- presença/coerência da configuração de e-mail transacional;
- configuração de object storage bruto;
- configuração do snapshot oficial de relatório;
- presença da configuração Copernicus;
- presença da configuração Mercado Pago prevista para a homologação financeira;
- contexto mínimo para executar a auditoria Cabeda Área 01/02 (`HOMOLOGATION_DATABASE_URL` remota + `CABEDA_TENANT_ID` UUID).

Nenhum valor de segredo é serializado no resultado. A suíte de regressão verifica essa propriedade no resultado de domínio, na API e no artefato JSON.

## Estados

- `PASS`: configuração mínima verificável está coerente;
- `BLOCKED`: existe falha programática objetiva;
- `READY_TO_EXECUTE`: o contexto mínimo existe para executar uma prova externa, mas essa prova ainda não aconteceu.

`READY_TO_EXECUTE` não equivale a `PASS` da homologação externa.

O artefato sempre contém `releaseReady: false`. Um readiness automatizado sem blockers significa apenas `READY_FOR_EXTERNAL_HOMOLOGATION`.

## Gates que continuam humanos ou dependentes de provider

Continuam fora do alcance de um simples preflight de configuração, entre outros:

- entrega real de convite/reset por e-mail;
- sessão/2FA em múltiplos dispositivos;
- confirmação visual do arquivo original persistido;
- política real do bucket (privacidade, criptografia, retenção/lifecycle);
- chamada Copernicus real;
- auditoria Cabeda com `readyForReliableSpatialEvidence=true`;
- validação de `gps_source`, suporte espacial, política espacial e aprovação profissional para VRA;
- assinatura/reentrega/cenários negativos do Mercado Pago e Checkout Pro de teste;
- backup/PITR e restauração;
- aceitação funcional/agronômica;
- termos/LGPD;
- branch protection/rulesets;
- GO explícito do responsável pelo produto.

## Uso local/ambiente autorizado

```bash
node --experimental-strip-types scripts/check-homologation-readiness.mjs
```

Para gerar somente a evidência JSON sanitizada:

```bash
node --experimental-strip-types scripts/export-homologation-readiness.mjs
```

O exporter retorna:

- exit `0`: nenhum blocker automatizado;
- exit `2`: há blocker automatizado;
- exit `3`: avaliação indisponível/erro inesperado, sempre fail-closed.

Saída sem blocker automatizado significa somente que a configuração mínima passou; a homologação total permanece pendente até os gates externos/humanos serem comprovados.

## GitHub Actions — `Homologation Readiness Evidence`

O workflow `.github/workflows/homologation-readiness-evidence.yml` executa a mesma avaliação no GitHub Environment `homologation` e produz:

- Job Summary privacy-safe;
- artefato `homologation-readiness-evidence` em JSON;
- retenção de 30 dias;
- check verde somente se não houver `BLOCKED` automatizado;
- falha fechada se o evaluator ficar indisponível.

O workflow não imprime valores de configuração e não serializa secrets.

### Variáveis não sensíveis esperadas no Environment `homologation`

- `DATA_MODE`
- `DATABASE_SSL`
- `APP_URL`
- `EMAIL_PROVIDER`
- `EMAIL_FROM`
- `STORAGE_PROVIDER`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `REPORT_STORAGE_PROVIDER`
- `RAIZ_ASSISTANT_MODE`
- `MERCADO_PAGO_CHECKOUT_ENABLED`

### Secrets esperados no Environment `homologation`

- `APP_DATABASE_URL`
- `DATABASE_URL` (opcional no runtime; ausência gera warning de migrations, conforme regra de produção)
- `AUTH_SECRET`
- `RESEND_API_KEY`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `GEMINI_API_KEY` somente se `RAIZ_ASSISTANT_MODE=hybrid`
- `COPERNICUS_CLIENT_ID`
- `COPERNICUS_CLIENT_SECRET`
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET`
- `HOMOLOGATION_DATABASE_URL`
- `CABEDA_TENANT_ID`

`HOMOLOGATION_DATABASE_URL` e `CABEDA_TENANT_ID` são os mesmos pré-requisitos da prova Cabeda; sua presença apenas muda o contexto para `READY_TO_EXECUTE`, não comprova proveniência espacial.

### Trigger pré-main

`workflow_dispatch` ficará naturalmente disponível quando o workflow existir na default branch. Antes disso, a homologação pré-produção pode usar somente a branch controlada `audit/homologation-readiness`, com alterações em `.homologation-trigger/**`; o workflow sempre faz checkout de `develop` para avaliar o código integrado.

Esse mecanismo é uma ponte operacional e **não substitui branch protection**. Enquanto #24 estiver aberta, a ausência de proteção administrativa continua sendo blocker global, pois um usuário com permissão suficiente ainda poderia alterar refs/workflows fora do fluxo esperado.

## Relação com o release

Este preflight complementa, mas não substitui:

- `npm run check:production-readiness`;
- `Cabeda Spatial Provenance Audit`;
- checklist da issue #25;
- blockers #24/#27;
- Production Promotion Guard;
- homologações reais de providers;
- aprovação explícita `develop -> main`.

A RAIZ deve continuar fail-closed sempre que uma evidência externa obrigatória estiver ausente ou ambígua.
