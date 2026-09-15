# RAIZ Digital — Preflight automático de homologação

## Objetivo

Reduzir o checklist operacional do piloto sem transformar configuração em homologação fictícia.

O comando `scripts/check-homologation-readiness.mjs` verifica apenas estados que podem ser avaliados de forma determinística e privacy-safe a partir do ambiente atual. Ele nunca emite GO de produção.

## O que o preflight automatiza

- configuração base já coberta por `check-production-readiness`;
- presença/coerência da configuração de e-mail transacional;
- configuração de object storage bruto;
- configuração do snapshot oficial de relatório;
- presença da configuração Copernicus;
- presença da configuração Mercado Pago prevista para a homologação financeira;
- contexto mínimo para executar a auditoria Cabeda Área 01/02 (`HOMOLOGATION_DATABASE_URL` remota + `CABEDA_TENANT_ID` UUID).

Nenhum valor de segredo é serializado no resultado. O teste de regressão verifica explicitamente essa propriedade.

## Estados

- `PASS`: configuração mínima verificável está coerente;
- `BLOCKED`: existe falha programática objetiva;
- `READY_TO_EXECUTE`: o contexto mínimo existe para executar uma prova externa, mas essa prova ainda não aconteceu.

`READY_TO_EXECUTE` não equivale a `PASS` da homologação externa.

## Gates que continuam humanos ou dependentes de provider

Continuam fora do alcance de um simples preflight de configuração, entre outros:

- entrega real de convite/reset por e-mail;
- sessão/2FA em múltiplos dispositivos;
- confirmação visual do arquivo original persistido;
- política real do bucket (privacidade, criptografia, retenção/lifecycle);
- chamada Copernicus real no Preview;
- auditoria Cabeda com `readyForReliableSpatialEvidence=true`;
- validação de `gps_source`, suporte espacial, política espacial e aprovação profissional para VRA;
- assinatura/reentrega/cenários negativos do Mercado Pago e Checkout Pro de teste;
- backup/PITR e restauração;
- aceitação funcional/agronômica;
- termos/LGPD;
- branch protection/rulesets;
- GO explícito do responsável pelo produto.

## Uso

No ambiente de homologação autorizado:

```bash
node --experimental-strip-types scripts/check-homologation-readiness.mjs
```

Saída com bloqueio automatizado retorna exit code diferente de zero. Uma saída sem bloqueio automatizado significa somente que a configuração mínima passou; a homologação total permanece pendente até os gates externos/humanos serem comprovados.

## Relação com o release

Este preflight complementa, mas não substitui:

- `npm run check:production-readiness`;
- `Cabeda Spatial Provenance Audit`;
- checklist da issue #25;
- blockers #24/#27;
- Production Promotion Guard;
- aprovação explícita `develop -> main`.

A RAIZ deve continuar fail-closed sempre que uma evidência externa obrigatória estiver ausente ou ambígua.
