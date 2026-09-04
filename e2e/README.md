# Testes de ponta a ponta (E2E)

Diferente da suíte em `npm run test:handoff` (lógica pura, roda sem banco), estes testes abrem um
navegador de verdade e conversam com o banco de dados real (`DATA_MODE=database`). Servem para os
fluxos de maior risco, onde um teste manual não é suficiente para confiar no código a longo prazo:
2FA, isolamento entre empresas (multiempresa), e RLS/RBAC de ordens de coleta de campo.

## Pré-requisitos

1. `npm run dev` rodando (em outro terminal), com `.env` configurado apontando para o banco real.
2. As contas de teste abaixo precisam existir. Crie-as (uma vez só) com o script de seed já existente —
   escolha suas próprias senhas (nunca reaproveite as de contas reais; guarde-as só localmente, nunca
   neste arquivo nem em código commitado):

```bash
# conta dedicada aos testes de 2FA, no tenant principal
SEED_TENANT_NAME="Raiz Digital Demo" SEED_ADMIN_NAME="E2E Two Factor" \
SEED_ADMIN_EMAIL="e2e-2fa@raiz.local" SEED_ADMIN_PASSWORD="<escolha uma senha forte>" \
npm run seed:dev

# segunda empresa, para o teste de isolamento multiempresa
SEED_TENANT_NAME="RAIZ E2E Isolamento" SEED_ADMIN_NAME="E2E Tenant B" \
SEED_ADMIN_EMAIL="e2e-tenant-b@raiz.local" SEED_ADMIN_PASSWORD="<escolha uma senha forte>" \
npm run seed:dev
```

O teste de isolamento também espera que a conta `admin@raiz.local` (senha em `SEED_ADMIN_PASSWORD` do
`.env`) tenha ao menos um cliente chamado "Fazenda Bela Vista" — já existe no banco de desenvolvimento
usado durante o handoff.

Os testes de RBAC (`field-operations-rbac.spec.ts`) usam mais 4 contas fixas, uma por papel, todas no
tenant "Raiz Digital Demo": `rbac-agronomist@raiz.local` (AGRONOMIST), `rbac-field-tech@raiz.local`
(FIELD_TECH), `rbac-commercial@raiz.local` (COMMERCIAL), `rbac-viewer@raiz.local` (VIEWER). Já existem
no banco de desenvolvimento do handoff.

`platform-curator.spec.ts` (curadoria da base técnica compartilhada — crop_profiles/technical_sources/
technical_regions, sem tenant_id) não precisa de conta nova: reaproveita `admin@raiz.local` (já marcado
curador nesta base de dev, `db:set-platform-curator`) e `rbac-agronomist@raiz.local` (não-curador) —
mesmas senhas `E2E_ADMIN_PASSWORD`/`E2E_RBAC_AGRONOMIST_PASSWORD` já usadas pelos outros testes.

`tenant-prescription-limit.spec.ts` (teto mensal de prescrições por IA) também não precisa de conta
nova — reaproveita `admin@raiz.local`. Mexe direto no banco (como `two-factor.spec.ts`) só pra baixar e
restaurar `tenants.monthly_prescription_limit` da empresa "Raiz Digital Demo" durante o teste; precisa de
`DATABASE_URL` no ambiente, igual aos testes de 2FA.

3. As senhas usadas para login em cada teste vêm de variáveis de ambiente (nunca do código-fonte, já que
   o repositório é público) — defina-as antes de rodar:

```bash
E2E_ADMIN_PASSWORD="<senha de admin@raiz.local>" \
E2E_TENANT_B_PASSWORD="<senha de e2e-tenant-b@raiz.local>" \
E2E_TWO_FACTOR_PASSWORD="<senha de e2e-2fa@raiz.local>" \
E2E_RBAC_AGRONOMIST_PASSWORD="<senha de rbac-agronomist@raiz.local>" \
E2E_RBAC_FIELD_TECH_PASSWORD="<senha de rbac-field-tech@raiz.local>" \
E2E_RBAC_COMMERCIAL_PASSWORD="<senha de rbac-commercial@raiz.local>" \
E2E_RBAC_VIEWER_PASSWORD="<senha de rbac-viewer@raiz.local>" \
npm run test:e2e
```

Dica: em vez de exportar as 7 variáveis manualmente toda vez, guarde-as num arquivo local
`.env.e2e.local` (raiz do projeto, já coberto por `.env*` no `.gitignore`, nunca commitado) e carregue
com `set -a && source .env.e2e.local && set +a` antes de rodar.

### Trocar as senhas dessas contas de teste

`node scripts/rotate-e2e-passwords.mjs <caminho-do-log-do-dev-server>` — gera uma senha nova e forte
para cada uma das 7 contas e aplica pelo fluxo real do app (esqueci-minha-senha → link com token
aparece no log do dev server, só funciona com `EMAIL_PROVIDER=console` → redefinir-senha). Nunca
escreve direto no banco. Escreve o resultado em `.env.e2e.local` (nunca imprime senha no terminal).
Precisa do `npm run dev` já rodando com a saída redirecionada para um arquivo de log.

## Rodando

```bash
npm run test:e2e
```

Cada teste deixa o estado como encontrou (a conta de 2FA é resetada antes de cada teste; o teste de
isolamento só lê e tenta escrever — nunca sobrescreve o cliente da empresa A, mesmo que o ataque
devesse ser bloqueado).

## O que NÃO está aqui

Estes testes cobrem os fluxos de autenticação/segurança já identificados como alto risco. Não
substituem os testes manuais de UX/responsividade documentados em `docs/PROJECT_STATE.md` a cada
funcionalidade nova — ainda vale testar visualmente em desktop e celular antes de considerar uma tela
pronta.
