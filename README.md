# RAIZ Digital

Plataforma de inteligência agronômica **“Do solo à decisão, com precisão.”**

## Versão atual

**0.5.0-dev.1 — handoff: baseline 0.4 + operações de campo em desenvolvimento**

A 0.4 mantém a UX construída nas versões 0.1–0.3 e conecta o primeiro núcleo persistente do produto. O modo `database` não usa números ou pareceres agronômicos fictícios para preencher telas vazias.

> **Handoff:** a v0.4 é a última baseline consolidada. Este diretório inclui um início de v0.5 ainda não homologado. Leia `CLAUDE.md`, `docs/MASTER_HANDOFF_CLAUDE.md` e `docs/V0.5_INTERRUPTED.md` antes de continuar.

## O que está implementado de verdade

- Next.js + TypeScript em monólito modular, sem dependência de Lovable.
- PostgreSQL/PostGIS como fonte oficial dos dados.
- Runner de migrations (`npm run db:migrate`).
- Sessão opaca persistida no banco, com token bruto somente no cookie `HttpOnly` e SHA-256 no banco.
- Senha com Argon2 (`@node-rs/argon2`).
- Seleção de empresa no login quando o usuário pertence a mais de um tenant.
- RLS nas entidades operacionais, forçada (`FORCE ROW LEVEL SECURITY`) e validada com um papel de banco restrito (`raiz_app`, sem `BYPASSRLS`) usado pela aplicação em runtime — cada transação define `app.tenant_id` e `app.user_id` antes das consultas.
- Editor cartográfico de coleta: mapa Leaflet para desenhar/visualizar o polígono de propriedade e talhão (`src/components/geo-map-input.tsx`), além de colar GeoJSON ou importar arquivo.
- RBAC inicial nas APIs de escrita.
- Auditoria usando a tabela `audit_events` já prevista na arquitetura inicial.
- CRUD inicial persistente de clientes.
- APIs persistentes para propriedades, talhões GeoJSON/PostGIS e safras.
- API persistente de análises.
- Importação CSV validada no servidor e commit persistente em `analysis_imports` + `analysis_import_rows`.
- Linhas duplicadas de laboratório são preservadas para auditoria do bloqueio, em vez de serem descartadas.
- Dashboard e lista de análises usam consultas reais no modo `database`.
- Detalhe de análise real não inventa diagnóstico/recomendação enquanto não existir interpretação homologada.
- Configurações exibem membros reais do tenant.
- `GET /api/health` testa conexão com o banco no modo real.
- Modo `demo` continua disponível, mas é visualmente identificado como demonstração.

## Rodar localmente

### 1. Banco

```bash
docker compose up -d database
```

Alternativa sem Docker: qualquer PostgreSQL/PostGIS acessível por `DATABASE_URL` serve, incluindo um
projeto gratuito do Supabase usado **apenas como Postgres hospedado** (sem API/Auth/SDK do Supabase — ver
`docs/PROJECT_STATE.md`, seção "Banco de desenvolvimento: Supabase Free"). Nesse caso, use a conexão via
"Session pooler" se a rede não tiver IPv6, e defina `DATABASE_SSL=require`.

### 2. Variáveis

```bash
cp .env.example .env.local
```

Defina uma senha forte em `SEED_ADMIN_PASSWORD` somente para o seed local.

### 3. Dependências, migrations e papel restrito da aplicação

```bash
npm install
npm run db:migrate
APP_DB_ROLE_PASSWORD=<gere uma senha forte> npm run db:set-app-password
npm run seed:dev
```

A migration `006_app_runtime_role.sql` cria o papel `raiz_app` (sem `BYPASSRLS`, sem ser dono de tabelas),
usado pela aplicação para que o RLS realmente seja aplicado. `db:set-app-password` define a senha desse
papel fora do Git. Preencha `APP_DATABASE_URL` no `.env.local` com esse papel e essa senha antes do próximo
passo — sem isso, a aplicação cai de volta no papel administrativo (`DATABASE_URL`), que ignora o RLS.

### 4. Aplicação

```bash
npm run dev
```

Acesse `http://localhost:3000`. Em `DATA_MODE=database`, a plataforma redireciona para `/login`.

## Modos de dados

`DATA_MODE=database` é o modo correto para desenvolvimento integrado e produção. Ele exige PostgreSQL e sessão válida.

`DATA_MODE=demo` serve apenas para revisar a experiência visual sem banco. Todas as áreas que contêm exemplos são explicitamente sinalizadas.

## Verificações

```bash
npm run test:domain
npm run test:security
npm run check:migrations
npm run typecheck
npm run build
```

Neste ambiente de geração, os três primeiros foram executados. `npm install`, `typecheck` completo e `build` dependem de acesso ao registry npm para instalar `pg`, `@node-rs/argon2` e as demais dependências do projeto.

## Ainda não é produção

Permanecem pendentes, entre outros itens: 2FA administrativo, recuperação de senha, convite de usuários, storage S3 real, XLSX/PDF, rule set agronômico homologado (requer revisão de especialista agrônomo antes de qualquer cálculo/recomendação chegar ao usuário — ver `docs/MOTOR_AGRONOMICO.md`), revisão/aprovação executável, relatório PDF assinado, webhook Mercado Pago validado.

Leia `docs/ARCHITECTURE.md`, `docs/MOTOR_AGRONOMICO.md` e `docs/HANDOFF_V0.4.md` antes de avançar o motor técnico.
