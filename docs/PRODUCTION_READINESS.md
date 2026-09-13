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
- retenção do PDF/XLSX/CSV original em object storage S3-compatible (`STORAGE_PROVIDER=s3`);
- snapshot publicado de relatório em provider durável suportado (`REPORT_STORAGE_PROVIDER=inline` ou `s3`);
- coerência do modo do assistente e credenciais necessárias quando híbrido;
- disponibilidade das integrações Copernicus e Mercado Pago como avisos quando ainda opcionais.

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

A RAIZ agora suporta dois caminhos duráveis:

- arquivos brutos de laboratório: `STORAGE_PROVIDER=s3`;
- snapshots imutáveis de relatório: `REPORT_STORAGE_PROVIDER=inline` ou `REPORT_STORAGE_PROVIDER=s3`.

O provider `s3` usa AWS Signature Version 4 diretamente no servidor e é compatível com serviços que exponham API S3 padrão, como AWS S3, Cloudflare R2 e Backblaze B2. Não existe dependência de SDK adicional.

Configuração mínima:

```text
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://...
S3_BUCKET=...
S3_REGION=auto
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
REPORT_STORAGE_PROVIDER=inline
```

Para AWS S3, use a região real do bucket em `S3_REGION` (por exemplo `sa-east-1`). Para Cloudflare R2, `auto` é aceito. O endpoint precisa ser HTTPS e apontar para a origem do serviço, sem path adicional.

A chave persistida no banco é opaca (`s3:v1:...`) e nunca contém credencial. Upload ou leitura S3 com erro falham fechado; o sistema não deve fingir que um documento foi arquivado quando o object storage recusou a operação.

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

## 7. Dependências externas

Copernicus é necessário para leitura real de NDVI. Mercado Pago só deve ser habilitado depois que token e assinatura de webhook estiverem configurados e validados. O assistente pode permanecer em `local`, sem dependência generativa; ativar `hybrid` exige o provider configurado e os gates já existentes.

Falha de uma integração opcional não pode transformar ausência de dado em dado simulado.

## 8. Gate final develop → main

A promoção só deve ocorrer quando:

1. CI (`typecheck`, `test:handoff`, build) estiver verde no head que será promovido;
2. `npm run check:production-readiness` estiver sem `FAIL` no ambiente de destino;
3. backup/PITR e restauração tiverem sido verificados manualmente;
4. health check responder 200 no preview/homologação conectado ao banco de homologação;
5. convites e recuperação de senha forem testados com e-mail real;
6. o object storage tiver sido configurado e um upload/leitura real de arquivo bruto tiver sido homologado;
7. validação funcional/agronômica de homologação estiver aprovada.

`main`/produção não deve ser alterado apenas porque o código compila; promoção é uma decisão separada e explícita.
