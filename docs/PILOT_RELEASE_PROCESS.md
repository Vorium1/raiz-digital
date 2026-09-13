# RAIZ Digital — processo de Release Candidate do piloto

Data: 2026-09-13

## Objetivo

Congelar um candidato de homologação antes de qualquer promoção para `main`. A branch `release/**` representa código candidato ao piloto, não produção.

## Regras

1. O candidato nasce exclusivamente do `develop` depois de CI verde.
2. Toda branch `release/**` executa o mesmo CI usado em `develop`: typecheck, `test:handoff` e build de produção.
3. Nenhum segredo é versionado. Credenciais de homologação ficam apenas no ambiente externo correspondente.
4. `release/**` não é promovida automaticamente para `main`.
5. Qualquer correção descoberta na homologação deve voltar primeiro para uma branch `work/**` ou `feature/**`, entrar em `develop` por PR e só então gerar um novo Release Candidate.
6. Não corrigir diretamente a branch de Release Candidate, para evitar divergência entre o código homologado e `develop`.

## Convenção de nome

```text
release/pilot-rcN-AAAA-MM-DD
```

Exemplo:

```text
release/pilot-rc1-2026-09-13
```

## Sequência de homologação

Usar a ordem definida em `RAIZ_2.0_FASE6_FECHAMENTO.md`:

1. preflight de produção sem `FAIL`;
2. convite e recuperação de senha com e-mail real;
3. object storage S3 compatível com CSV/XLSX/PDF e integridade do original;
4. Copernicus/Sentinel-2 real;
5. Mercado Pago com checkout desligado para validar webhook/reconciliação;
6. Checkout Pro somente em ambiente de teste autorizado;
7. backup/PITR + restauração em ambiente separado;
8. aceitação funcional/agronômica final;
9. termos/LGPD e decisões comerciais aplicáveis;
10. aprovação explícita antes de abrir `develop -> main`.

## Evidências mínimas por Release Candidate

Registrar fora do repositório qualquer segredo e, no PR/registro de homologação, somente evidências não sensíveis:

- SHA/branch do RC;
- CI verde;
- data e resultado de cada smoke test;
- ambiente usado (sem credenciais);
- incidentes encontrados e PRs corretivos;
- decisão final GO/NO-GO.

## Importante

A branch `main` continua sendo produção e não deve ser atualizada só porque um RC compila. O RC existe justamente para permitir homologação real sem transformar `develop` ou `main` em ambiente de experimentação.
