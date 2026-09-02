# Testes de ponta a ponta (E2E)

Diferente da suíte em `npm run test:handoff` (lógica pura, roda sem banco), estes testes abrem um
navegador de verdade e conversam com o banco de dados real (`DATA_MODE=database`). Servem para os
fluxos de maior risco, onde um teste manual não é suficiente para confiar no código a longo prazo:
2FA e isolamento entre empresas (multiempresa).

## Pré-requisitos

1. `npm run dev` rodando (em outro terminal), com `.env` configurado apontando para o banco real.
2. As contas de teste abaixo precisam existir. Crie-as (uma vez só) com o script de seed já existente:

```bash
# conta dedicada aos testes de 2FA, no tenant principal
SEED_TENANT_NAME="Raiz Digital Demo" SEED_ADMIN_NAME="E2E Two Factor" \
SEED_ADMIN_EMAIL="e2e-2fa@raiz.local" SEED_ADMIN_PASSWORD="E2eTwoFactor12345" \
npm run seed:dev

# segunda empresa, para o teste de isolamento multiempresa
SEED_TENANT_NAME="RAIZ E2E Isolamento" SEED_ADMIN_NAME="E2E Tenant B" \
SEED_ADMIN_EMAIL="e2e-tenant-b@raiz.local" SEED_ADMIN_PASSWORD="E2eTenantB12345" \
npm run seed:dev
```

O teste de isolamento também espera que a conta `admin@raiz.local` (senha em `SEED_ADMIN_PASSWORD` do
`.env`) tenha ao menos um cliente chamado "Fazenda Bela Vista" — já existe no banco de desenvolvimento
usado durante o handoff.

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
