# RAIZ Digital

Plataforma de inteligência agronômica **“Do solo à decisão, com precisão.”**

## Versão atual

**0.4.0 — sessão real, isolamento multiempresa e persistência PostgreSQL/PostGIS**

A 0.4 mantém a UX construída nas versões 0.1–0.3 e conecta o primeiro núcleo persistente do produto. O modo `database` não usa números ou pareceres agronômicos fictícios para preencher telas vazias.

## O que está implementado de verdade

- Next.js + TypeScript em monólito modular, sem dependência de Lovable.
- PostgreSQL/PostGIS como fonte oficial dos dados.
- Runner de migrations (`npm run db:migrate`).
- Sessão opaca persistida no banco, com token bruto somente no cookie `HttpOnly` e SHA-256 no banco.
- Senha com Argon2 (`@node-rs/argon2`).
- Seleção de empresa no login quando o usuário pertence a mais de um tenant.
- RLS nas entidades operacionais; cada transação define `app.tenant_id` e `app.user_id` antes das consultas.
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

### 2. Variáveis

```bash
cp .env.example .env.local
```

Defina uma senha forte em `SEED_ADMIN_PASSWORD` somente para o seed local.

### 3. Dependências e migrations

```bash
npm install
npm run db:migrate
npm run seed:dev
```

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

Permanecem pendentes, entre outros itens: 2FA administrativo, recuperação de senha, convite de usuários, storage S3 real, editor cartográfico de coleta, XLSX/PDF, rule set agronômico homologado, revisão/aprovação executável, relatório PDF assinado, webhook Mercado Pago validado e testes E2E contra PostgreSQL/PostGIS real.

Leia `docs/ARCHITECTURE.md`, `docs/MOTOR_AGRONOMICO.md` e `docs/HANDOFF_V0.4.md` antes de avançar o motor técnico.
