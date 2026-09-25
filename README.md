# RAIZ Digital

Plataforma SaaS B2B de inteligência agronômica — **“Do solo à decisão, com precisão.”**

[![CI](https://github.com/Vorium1/raiz-digital/actions/workflows/ci.yml/badge.svg)](https://github.com/Vorium1/raiz-digital/actions/workflows/ci.yml)

## Estado atual

O RAIZ Digital está em operação de produção com fluxo formal de desenvolvimento, homologação e release.

**Fonte curta de verdade:** [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md)

> O campo `version` do `package.json` ainda preserva o identificador histórico `0.5.0-dev.1`. Ele não deve ser usado como indicador do estágio funcional atual até existir uma política explícita de versionamento de produto.

## Arquitetura

- Next.js + React + TypeScript.
- PostgreSQL + PostGIS como fonte oficial.
- Driver `pg`, sem ORM obrigatório.
- Multiempresa com `tenant_id`, RLS e RBAC.
- Sessão opaca em cookie `HttpOnly`; hash do token persistido no banco.
- Argon2 para senha; 2FA/TOTP disponível.
- GitHub Actions para typecheck, testes, preflight, validações e build.
- Vercel para Preview/produção.
- 42 migrations versionadas no repositório.

## O que está implementado

### Operação
- clientes, propriedades, talhões e safras;
- laboratórios;
- ordens de coleta, grid, pontos GPS e confirmação em campo;
- importação laboratorial CSV/XLSX;
- auditoria;
- autenticação, recuperação de senha, 2FA e gestão de equipe;
- mapas, satélite, NDVI e relevo;
- UX desktop/mobile.

### Inteligência agronômica
- motor determinístico versionado;
- interpretação e prescrição com revisão/aprovação;
- regras e contexto por cultura, método, profundidade, região e produtividade;
- calagem, P, K, N, S e demais módulos homologados no catálogo atual;
- contexto climático, irrigação e biologia quando disponível;
- cenários comerciais separados da decisão agronômica.

### Resultado oficial
- laudo/snapshot oficial imutável;
- resumo simples para o produtor;
- dose/ha e total do talhão quando exatos;
- plano comercial opcional e explicitamente selecionado;
- produto, quantidade, preço e custo apenas quando congelados junto ao laudo;
- fail-closed para cenário comercial stale, sem rastreabilidade ou operacionalmente inválido.

## Banco e migrations

O repositório possui migrations de:

`001_initial.sql` → `042_ndvi_algorithm_versioned_snapshots.sql`.

A evidência de release documenta produção e homologação em 42/42. Releases posteriores de UI/laudo (#92 e #95) não adicionaram migrations.

Nunca rode migration de produção apenas com base em documentação antiga. Primeiro confira o ledger e o HEAD atuais.

## Fluxo Git

- `main`: produção.
- `develop`: desenvolvimento/homologação.
- features nascem de `develop`.
- todo release para `main` passa por PR, CI e Production Promotion Guard.
- merge/deploy de produção exige autorização explícita.

## Rodar localmente

### 1. Banco

Use PostgreSQL/PostGIS local ou hospedado.

```bash
docker compose up -d database
```

### 2. Variáveis

```bash
cp .env.example .env.local
```

Nunca coloque secrets no repositório.

### 3. Dependências e migrations

```bash
npm install
npm run db:migrate
APP_DB_ROLE_PASSWORD=<senha-forte> npm run db:set-app-password
npm run seed:dev
```

A aplicação deve usar o papel restrito `raiz_app` por `APP_DATABASE_URL`. O papel administrativo fica reservado a migrations/administração.

### 4. Aplicação

```bash
npm run dev
```

## Verificações

```bash
npm run typecheck
npm run test:handoff
npm run build
npm run test:e2e
```

O CI executa os gates de código automaticamente. E2E e workflows de homologação podem exigir environment/secrets próprios.

## Documentação

Leia nesta ordem:

1. [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md)
2. [CLAUDE.md](CLAUDE.md)
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
4. [docs/MOTOR_AGRONOMICO.md](docs/MOTOR_AGRONOMICO.md)
5. [docs/ROADMAP_PRODUCT.md](docs/ROADMAP_PRODUCT.md)
6. [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) — histórico detalhado

## Regra central do produto

**Entrou laudo e pontos → sai resultado.**

O sistema deve concluir tudo o que for suportado pelos dados e pela evidência disponível, sem inventar o que não existe e sem bloquear o relatório inteiro por ausência de informação opcional.
