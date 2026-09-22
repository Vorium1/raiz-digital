# RAIZ Digital 2.0 — Fechamento técnico da Fase 6

Data do fechamento técnico: 2026-09-13

## Objetivo da fase

A Fase 6 transforma o núcleo técnico já consolidado da RAIZ em uma base de **piloto comercial endurecido**. O critério desta fase não é apenas “a tela existe”: autenticação, convites, armazenamento, faturamento, observabilidade e operação precisam falhar de forma segura, preservar o isolamento multiempresa e deixar explícito o que ainda depende de homologação externa.

Este documento separa rigorosamente três estados:

- **Código concluído e validado em CI** — implementação presente em `develop`, com `typecheck`, `test:handoff` e build usados como gate de regressão;
- **Homologação externa pendente** — depende de credenciais, provedor ou infraestrutura real e não pode ser simulada pelo repositório;
- **Decisão humana pendente** — exige aprovação comercial, jurídica ou do responsável pelo produto antes de produção.

## Estado executivo

| Bloco | Estado técnico | Gate que ainda permanece |
|---|---|---|
| Jornada de primeira ativação | Concluído | Validar UX com o primeiro tenant novo real |
| Recuperação de senha | Concluído | Teste de entrega com domínio/remetente real |
| 2FA + backup codes | Concluído | Smoke test no ambiente final |
| Convite seguro de equipe | Concluído | Teste com e-mail transacional real |
| Rate limit de login/2FA | Concluído | Monitorar comportamento no piloto |
| Gestão de sessões da própria conta | Concluído | Smoke test multi-dispositivo no Preview |
| Preflight de produção | Concluído | Executar com as variáveis reais do ambiente de destino |
| `/api/health` fail-closed | Concluído | Ligar monitor externo e canal de alerta |
| Painel interno de saúde/observabilidade | Concluído | Validar com runtime real; acesso apenas à curadoria global |
| Baseline de headers HTTP | Concluído | CSP permanece deliberadamente fora até homologação das origens externas |
| Arquivo bruto em object storage S3 compatível | Código concluído | Smoke test real CSV/XLSX/PDF + bucket privado + retenção/criptografia |
| Snapshot imutável de relatório | Concluído | Confirmar persistência/integridade no ambiente final |
| Copernicus / Sentinel-2 | Código concluído | Homologar credenciais e chamadas no Preview |
| Mercado Pago — webhook e reconciliação | Código concluído | Homologar assinatura, reentrega e cenários negativos com credencial de teste |
| Mercado Pago — Checkout Pro por fatura | Código concluído, **desligado por padrão** | Habilitar `MERCADO_PAGO_CHECKOUT_ENABLED=true` somente durante/apos homologação autorizada |
| Recorrência automática | Fora desta entrega | Decisão comercial futura |
| Carência/bloqueio por inadimplência | Fora desta entrega | Política comercial futura; não ativar por inferência |
| Backup/PITR + restauração | Não comprovável pelo código | Verificação e teste no provedor do PostgreSQL/Neon |
| Termos/LGPD aplicáveis | Não homologado | Definição/revisão jurídica e de produto antes de exigir aceite |

## O que entrou na Fase 6

### 1. Ativação e gestão de acesso

O dashboard consegue conduzir um tenant novo pelos marcos reais da operação — cliente, propriedade/talhão, safra/cultura, coleta, laudo e primeira decisão aprovada — sem criar checklist fictício ou estado paralelo.

Recuperação de senha, 2FA e convites foram endurecidos para uso comercial. Convites de contas novas não expõem senha temporária: o usuário recebe um vínculo individual para definir a própria senha. A troca de senha revoga automaticamente as outras sessões e a área de Configurações permite inspecionar e encerrar as demais sessões da própria conta sem expor token, hash de token ou hash de IP.

### 2. Prontidão operacional

`npm run check:production-readiness` é o gate automatizado de configuração. Entre outros pontos, ele bloqueia modo demonstração, banco local em produção, TLS ausente, `AUTH_SECRET` inseguro, e-mail transacional incompleto, armazenamento bruto não durável e configurações incoerentes do Checkout Pro.

`GET /api/health` permanece propositalmente mínimo e devolve 503 quando o banco de runtime não responde. O painel `/operacao-sistema`, restrito a `is_platform_curator`, agrega sinais de banco, tentativas de login, eventos financeiros, auditoria e prontidão de integrações sem revelar segredos ou payloads de clientes.

### 3. Cadeia de custódia dos laudos

O fluxo de arquivo bruto usa object storage S3 compatível e mantém segregação por tenant. CSV/TXT/XLSX preservam os bytes originais; PDF/foto preservam o original antes de a transcrição assistida voltar ao navegador. O SHA-256 continua sendo parte da rastreabilidade e o snapshot oficial do relatório permanece independente do arquivo bruto.

A implementação não prova sozinha que o bucket real é privado, criptografado e tem política de retenção adequada. Isso continua sendo gate de infraestrutura.

### 4. Cobrança segura

O webhook do Mercado Pago valida a origem, registra eventos de forma idempotente e nunca aceita o payload recebido como autoridade financeira: a RAIZ consulta novamente o recurso oficial antes de reconciliar uma fatura.

O Checkout Pro nasce sempre de uma fatura real já existente. A Order é persistida e reutilizada em cliques repetidos, evitando cobranças paralelas para a mesma invoice. A URL de redirecionamento é aceita apenas em HTTPS sob o domínio brasileiro reconhecido do Mercado Pago.

A configuração financeira possui dois gates independentes:

```text
MERCADO_PAGO_ACCESS_TOKEN=...
MERCADO_PAGO_WEBHOOK_SECRET=...
MERCADO_PAGO_CHECKOUT_ENABLED=false
```

Ter credenciais **não** habilita cobrança. `MERCADO_PAGO_CHECKOUT_ENABLED` permanece `false` durante configuração e homologação de webhook. A rota de checkout falha fechada enquanto credenciais + opt-in explícito não estiverem presentes.

Mesmo depois de um pagamento aprovado, esta fase não altera automaticamente `tenants.status`, não bloqueia usuários e não ativa recorrência ou política de inadimplência.

### 5. Hardening HTTP e sessão

A aplicação aplica uma baseline global de defesa HTTP: HSTS, `nosniff`, bloqueio de framing, política de referrer, bloqueio de câmera/microfone, geolocalização apenas para a própria origem e outras proteções compatíveis com o fluxo real da RAIZ.

CSP não foi habilitada de forma prematura porque mapas/tiles e integrações externas precisam de uma matriz de origens real. A próxima evolução segura é inventariar essas origens e validar uma política em Preview/report-only antes de impor bloqueio.

## Gates externos antes de produção

A Fase 6 está fechada no nível de código, mas **não autoriza promoção para `main` sozinha**. Antes do piloto comercial, executar nesta ordem:

1. Configurar um ambiente de Preview/homologação com as variáveis reais, sem reutilizar segredos de produção onde não for necessário.
2. Executar `npm run check:production-readiness` nesse ambiente e obter zero `FAIL`.
3. Testar e-mail real: convite de conta nova e “Esqueci minha senha”.
4. Testar object storage real: importar CSV/XLSX e PDF, confirmar objeto no bucket privado e verificação de integridade.
5. Homologar Copernicus/Sentinel-2 com credenciais reais de Preview.
6. Homologar Mercado Pago inicialmente com `MERCADO_PAGO_CHECKOUT_ENABLED=false`: assinatura do webhook, consulta oficial e reentrega idempotente.
7. Somente no ambiente autorizado de teste, mudar `MERCADO_PAGO_CHECKOUT_ENABLED=true`, abrir uma fatura de teste, concluir o Checkout Pro e validar reconciliação e cenários negativos.
8. Confirmar backup/PITR e executar uma restauração em ambiente separado.
9. Definir/revisar os termos e obrigações LGPD aplicáveis ao modelo comercial real; não inventar aceite jurídico no código antes dessa decisão.
10. Fazer aceitação funcional/agronômica final no Preview.
11. Solicitar aprovação explícita do responsável pelo produto para abrir `develop → main`.

## Condições de NO-GO

Não promover para produção se qualquer uma destas condições estiver presente:

- `check:production-readiness` com `FAIL`;
- CI do head a promover não estiver verde;
- object storage bruto não tiver sido testado contra o provider real;
- e-mail de convite/reset não tiver sido entregue de verdade;
- backup/PITR/restauração não tiverem sido verificados;
- Checkout Pro for ser disponibilizado sem homologação financeira real;
- credenciais do Mercado Pago estiverem configuradas e alguém pretender tratar isso como autorização implícita de cobrança;
- qualquer política de bloqueio/recorrência estiver sendo inferida sem definição comercial;
- termos/LGPD necessários ao piloto estiverem indefinidos;
- validação agronômica/funcional final tiver pendência crítica.

## Checklist de ambiente — sem valores

```text
DATA_MODE=database
APP_DATABASE_URL=...
DATABASE_SSL=require
AUTH_SECRET=...
APP_URL=https://...

EMAIL_PROVIDER=resend
RESEND_API_KEY=...
EMAIL_FROM=...

STORAGE_PROVIDER=s3
S3_ENDPOINT=https://...
S3_REGION=...
S3_BUCKET=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
REPORT_STORAGE_PROVIDER=inline

COPERNICUS_CLIENT_ID=...
COPERNICUS_CLIENT_SECRET=...

MERCADO_PAGO_ACCESS_TOKEN=...
MERCADO_PAGO_WEBHOOK_SECRET=...
MERCADO_PAGO_CHECKOUT_ENABLED=false
```

Nenhum valor real dessas variáveis deve ser versionado, colocado em issue/PR ou copiado para documentação.

## Critério de fechamento

**Fechamento técnico da Fase 6:** alcançado quando este documento entra em `develop` com CI verde.

**Prontidão para piloto/produção:** permanece condicionada aos gates externos acima. O próximo merge para `main` deve ser uma decisão explícita após homologação; não é continuação automática deste fechamento.
