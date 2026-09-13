# RAIZ Digital — Prontidão de produção

Este runbook é o gate operacional antes de promover `develop` para `main`. Ele não substitui validação agronômica, revisão humana nem os testes de domínio; cobre configuração, disponibilidade, recuperação e dependências externas.

## 1. Preflight automatizado

Execute no ambiente que será promovido:

```bash
npm run check:production-readiness
```

O comando não imprime segredos. Qualquer item `FAIL` bloqueia promoção. Itens `WARN` precisam de decisão explícita antes do go-live.

O preflight verifica, entre outros pontos:

- `DATA_MODE=database`;
- `APP_DATABASE_URL` remoto e explícito para o papel restrito da aplicação;
- separação entre credencial de runtime e credencial administrativa, quando `DATABASE_URL` estiver presente;
- `DATABASE_SSL=require`;
- `AUTH_SECRET` não-placeholder com comprimento mínimo;
- `APP_URL` público em HTTPS;
- e-mail transacional real (`EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`);
- snapshot publicado de relatório em `REPORT_STORAGE_PROVIDER=inline`;
- retenção do arquivo original do laboratório em `STORAGE_PROVIDER=s3`, com endpoint HTTPS e credenciais completas;
- coerência do modo do assistente e credenciais necessárias quando híbrido;
- disponibilidade das integrações Copernicus e Mercado Pago como avisos quando ainda opcionais;
- consistência do gate comercial do Mercado Pago: `MERCADO_PAGO_CHECKOUT_ENABLED=true` é bloqueado se Access Token e segredo do webhook não estiverem completos.

**Importante:** credenciais do Mercado Pago e ativação comercial são estados independentes. É válido — e recomendado durante homologação — ter as credenciais configuradas com `MERCADO_PAGO_CHECKOUT_ENABLED=false`. Configurar token/segredo nunca deve, sozinho, expor cobrança aos usuários.

## 2. Health check

O endpoint público de monitoramento é:

```text
GET /api/health
```

Resposta saudável: HTTP 200 com `{"status":"ok"}`. Em `DATA_MODE=database`, o endpoint executa uma consulta mínima usando o mesmo pool de runtime; falha de banco retorna HTTP 503 com `{"status":"unavailable"}`.

O payload é propositalmente mínimo: não expõe host, tenant, modo, versão de banco, timestamp, credenciais nem mensagem interna de erro. Configure o monitor externo para alertar em qualquer status diferente de 200.

## 3. Banco e recuperação

Antes do primeiro cliente comercial, confirmar manualmente no provedor do PostgreSQL/Neon:

- backup/PITR habilitado no plano efetivamente contratado;
- janela de retenção conhecida;
- procedimento de restauração documentado;
- um teste de restauração em ambiente separado, sem substituir produção;
- credencial `raiz_app` sem `BYPASSRLS` e diferente do papel dono/admin;
- migrations aplicadas com credencial administrativa separada do runtime.

**Status no repositório:** o código aplica RLS pelo contexto de tenant, mas a configuração real de backup/PITR do provedor não pode ser comprovada pelo código e deve ser verificada no painel da infraestrutura antes do go-live.

## 4. Armazenamento e rastreabilidade

Relatórios publicados continuam separados do arquivo bruto: em ambiente serverless, use `REPORT_STORAGE_PROVIDER=inline`, persistindo o snapshot oficial imutável no PostgreSQL/Neon com verificação de hash.

Para os arquivos originais do laboratório, a versão atual implementa provider S3 compatível via Signature V4, sem dependência externa de SDK. Pode ser usado com AWS S3, Cloudflare R2, MinIO ou serviço compatível. No ambiente comercial configure:

```text
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://...
S3_REGION=auto               # ou a região real do provedor
S3_BUCKET=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_SESSION_TOKEN=...         # somente se o provedor usar credencial temporária
REPORT_STORAGE_PROVIDER=inline
```

A cadeia de custódia funciona assim:

- CSV/TXT/XLSX: os bytes originais são arquivados no commit da importação; o SHA-256 registrado representa os bytes do arquivo original, inclusive para XLSX em base64 no transporte web;
- PDF/foto: o original é arquivado no servidor antes de a transcrição por IA voltar ao navegador; o CSV transcrito carrega apenas um envelope opaco de proveniência;
- no commit de PDF/foto, o servidor relê o objeto arquivado e confere tenant, tamanho e SHA-256 antes de persistir resultados;
- a transcrição por IA nunca é tratada como se fosse o documento original;
- as chaves de objeto são segregadas por tenant e derivadas do SHA-256 + nome sanitizado, evitando sobrescrita silenciosa por colisão de nome.

O bucket deve permanecer **privado**. Confirme no provedor criptografia em repouso, política de retenção/lifecycle e ausência de acesso público. Não coloque credenciais no GitHub, no código nem em logs.

Antes do go-live faça um smoke test no Preview/homologação com o provider real: envie um CSV/XLSX e um PDF, conclua a importação, confirme que o objeto existe no bucket privado e que a leitura de integridade no commit passou. O código cobre o fluxo com testes sem rede; esse teste real é necessário para validar credencial, endpoint, política do bucket e limites do runtime da Vercel.

**Limite operacional:** PDF/foto ainda passa pelo endpoint de extração antes do object storage. Portanto os limites efetivos de payload do runtime Vercel precisam ser confirmados no smoke test; não assumir que o limite lógico de 9 MB do código garante o mesmo teto na infraestrutura. Se arquivos reais excederem o limite do runtime, o próximo passo é upload direto/presigned para o bucket.

## 5. E-mail e acesso

Em ambiente comercial:

- `EMAIL_PROVIDER=resend`;
- domínio/remetente de `EMAIL_FROM` verificado no provedor;
- teste real de convite de novo usuário;
- teste real de “Esqueci minha senha”;
- teste de login com 2FA e código de backup;
- confirmação de que nenhuma senha temporária aparece na UI, resposta da API ou logs.

## 6. Observabilidade

Antes de promover:

- confirmar que Vercel Runtime Logs estão acessíveis para produção;
- monitorar `/api/health` externamente;
- definir responsável e canal de alerta para HTTP 5xx/health 503;
- revisar erros de autenticação, importação, publicação de relatório e integrações externas;
- nunca registrar tokens, chaves, senha, string completa de banco ou conteúdo sensível de laudo em logs.

A RAIZ também possui o painel interno `/operacao-sistema`, disponível **somente para usuários marcados como curadores globais da plataforma (`is_platform_curator`)**. Ele agrega saúde do banco, falhas de login, eventos/erros de pagamentos, auditoria e prontidão de integrações sem mostrar tokens, e-mails/IPs, payloads ou strings de conexão. Esse painel é complementar e não substitui monitoramento externo, logs do runtime nem o preflight.

## 7. Dependências externas

Copernicus é necessário para leitura real de NDVI. Mercado Pago só deve ser habilitado depois que token e assinatura de webhook estiverem configurados e validados. O assistente pode permanecer em `local`, sem dependência generativa; ativar `hybrid` exige o provider configurado e os gates já existentes.

Para Mercado Pago, a sequência segura é:

1. configurar `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_SECRET` no Preview/homologação;
2. manter `MERCADO_PAGO_CHECKOUT_ENABLED=false` enquanto valida webhook/reconciliação;
3. somente no ambiente autorizado para teste do Checkout Pro, mudar a flag para `true`;
4. concluir o smoke test financeiro real descrito em `docs/MERCADO_PAGO_HOMOLOGACAO.md`;
5. decidir separadamente se a flag será habilitada em produção. Isso **não** ativa recorrência, carência ou bloqueio automático.

Falha de uma integração opcional não pode transformar ausência de dado em dado simulado.

## 8. Gate final develop → main

A promoção só deve ocorrer quando:

1. CI (`typecheck`, `test:handoff`, build) estiver verde no head que será promovido;
2. `npm run check:production-readiness` estiver sem `FAIL` no ambiente de destino;
3. backup/PITR e restauração tiverem sido verificados manualmente;
4. health check responder 200 no preview/homologação conectado ao banco de homologação;
5. convites e recuperação de senha forem testados com e-mail real;
6. object storage bruto passar no smoke test real de upload + recuperação/integridade para CSV/XLSX e PDF;
7. bucket privado, retenção/lifecycle e criptografia forem confirmados no provedor;
8. se Checkout Pro for ser disponibilizado, o fluxo real de homologação do Mercado Pago tiver passado antes de `MERCADO_PAGO_CHECKOUT_ENABLED=true` no ambiente comercial;
9. validação funcional/agronômica de homologação estiver aprovada.

`main`/produção não deve ser alterado apenas porque o código compila; promoção é uma decisão separada e explícita.
