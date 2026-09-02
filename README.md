# RAIZ Digital

Plataforma de inteligência agronômica **“Do solo à decisão, com precisão.”**

## Versão atual

**0.5.0-dev.1 — handoff: baseline 0.4 + operações de campo, autenticação completa e CRUD operacional**

A 0.4 mantém a UX construída nas versões 0.1–0.3 e conecta o primeiro núcleo persistente do produto. O modo `database` não usa números ou pareceres agronômicos fictícios para preencher telas vazias.

> **Handoff:** a v0.4 é a última baseline consolidada. Este diretório inclui a v0.5 em desenvolvimento contínuo,
> ainda não homologada como versão oficial. Leia `CLAUDE.md`, `docs/MASTER_HANDOFF_CLAUDE.md` e
> `docs/PROJECT_STATE.md` (o changelog detalhado, atualizado a cada bloco de trabalho) antes de continuar.

[![CI](https://github.com/Vorium1/raiz-digital/actions/workflows/ci.yml/badge.svg)](https://github.com/Vorium1/raiz-digital/actions/workflows/ci.yml)

## O que está implementado de verdade

**Base técnica**
- Next.js + TypeScript em monólito modular, sem dependência de Lovable.
- PostgreSQL/PostGIS como fonte oficial dos dados, driver `pg` sem ORM.
- Runner de migrations (`npm run db:migrate`), 011 migrations aplicadas.
- RLS nas entidades operacionais, forçada (`FORCE ROW LEVEL SECURITY`) e validada com um papel de banco
  restrito (`raiz_app`, sem `BYPASSRLS`) usado pela aplicação em runtime — cada transação define
  `app.tenant_id` e `app.user_id` antes das consultas.
- Verificação automática (typecheck + testes + build) a cada push/PR via GitHub Actions (`.github/workflows/ci.yml`).
- Testes de ponta a ponta (Playwright) para os dois fluxos mais sensíveis — 2FA e isolamento entre empresas
  — em `e2e/` (ver `e2e/README.md`).

**Autenticação e conta**
- Sessão opaca persistida no banco (token bruto só no cookie `HttpOnly`, hash SHA-256 no banco), senha com
  Argon2. Seleção de empresa no login quando o usuário pertence a mais de um tenant.
- Verificação em duas etapas (2FA/TOTP) opcional por usuário, com códigos de backup de uso único, proteção
  contra reaproveitamento de código e exigência de senha para desativar ou reconfigurar.
- Bloqueio de login após tentativas repetidas (força bruta).
- Recuperação de senha por e-mail (o envio ainda é só um provedor "console" — ver seção de pendências).
- Convite de membro de equipe, troca da própria senha, e gestão de equipe (mudar perfil, ativar/desativar
  acesso, sempre com pelo menos um administrador ativo garantido).

**Cadastro e operação de campo**
- CRUD completo (criar, editar, excluir/desativar) de clientes, propriedades, talhões, safras e
  laboratórios — todos com API persistente, RBAC e auditoria.
- Editor cartográfico de coleta: mapa Leaflet para desenhar/visualizar o polígono de propriedade e talhão
  (`src/components/geo-map-input.tsx`), além de colar GeoJSON ou importar arquivo.
- Ordens de coleta com grid automático via PostGIS ou importação de pontos GPS, confirmação de coleta em
  campo (com observação de campo opcional por ponto) e cancelamento de ordens ainda não iniciadas.
- API persistente de análises; importação de laudo em CSV **e XLSX**, validada no servidor e revalidada no
  commit; linhas duplicadas de laboratório são preservadas para auditoria do bloqueio, em vez de descartadas.
- Busca e filtro reais na lista de Análises; painel de notificações reais (atividade recente da empresa).
- Dashboard e lista de análises usam consultas reais no modo `database`; nenhum número fixo/decorativo.
- Detalhe de análise real não inventa diagnóstico/recomendação enquanto não existir interpretação homologada.
- RBAC nas APIs de escrita, com isolamento por tenant testado (ver `e2e/tenant-isolation.spec.ts`).
- Auditoria completa (tabela `audit_events`) cobrindo toda criação, edição e exclusão relevante.
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
npm run typecheck     # tipos
npm run test:handoff  # testes de lógica pura (sem banco) — domain, security, field, migrations
npm run build          # build de produção
npm run test:e2e       # 2FA + isolamento entre empresas, contra o banco real (ver e2e/README.md)
```

Os três primeiros rodam sozinhos a cada push/PR no GitHub Actions e não precisam de nenhum segredo
configurado. `test:e2e` precisa de `npm run dev` já rodando com `.env` apontando para um banco real, por
isso continua fora do CI por enquanto.

## Ainda não é produção

Permanecem pendentes, entre outros itens: storage S3 real (hoje é disco local em desenvolvimento — não
funciona em hospedagem serverless), importação de laudo via OCR de PDF, rule set agronômico homologado
(requer revisão de especialista agrônomo antes de qualquer cálculo/recomendação chegar ao usuário — ver
`docs/MOTOR_AGRONOMICO.md`), revisão/aprovação executável, relatório PDF assinado, webhook Mercado Pago
validado, envio de e-mail real (hoje só grava no console do servidor).

Leia `docs/ARCHITECTURE.md`, `docs/MOTOR_AGRONOMICO.md` e `docs/PROJECT_STATE.md` antes de avançar o motor
técnico ou qualquer uma dessas frentes.
