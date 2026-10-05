# Integração futura — leitura Git atualizada em 2026-10-05

Este documento descreve ordem técnica sugerida. Não autoriza merge, deploy,
migration de produção ou qualquer escrita em produção.

## Regra anti-retrabalho

A integração futura deve respeitar a ancestralidade real das branches. Commits já
contidos por ancestralidade **não devem ser reaplicados, cherry-picked ou
reimplementados**.

## Baseline consolidada atual

`feature/agronomic-decision-timeline` / `a46edeb` é a baseline técnica mais útil
para as frentes recentes.

Por ancestralidade Git confirmada:

- PR #129 / `work/codex-night-multitenant-2026-09-30` está contido na PR #131;
- PR #131 / `feature/calculadora-raiz-v1` está contido na PR #132;
- portanto PR #132 já contém #129 + #131 e não deve receber esses commits novamente;
- PR #121 / `feature/performance-login-fast-path` também é ancestral de #132;
- PR #119 / `feature/frozen-decision-delivery` é ancestral de #132;
- PR #104 / `feature/report-final-visual-2-3-pages` é ancestral de #132.

## Frentes recentes sobre #132

| Frente | Branch / HEAD | Relação com #132 | Estado técnico |
| --- | --- | --- | --- |
| #126 / PR #132 | `feature/agronomic-decision-timeline` / `a46edeb` | baseline | validada localmente |
| Calculadora V2 | `feature/calculadora-raiz-v2-pontos` / `1341ab8` | #132 + 2 commits | pontos→produto + cobertura tenant |
| #128 auditoria final | `feature/issue-128-tenant-audit` / `1e9667a` | **superset da Calculadora V2** | V2 + foreign-field fail-closed + matriz RBAC |
| #122 | `feature/issue-122-field360-visual` / `0a03701` | sibling sobre #132 | fertilidade/NDVI visual |
| #123 | `feature/issue-123-dose-audit-current` / `86c40f0` | sibling sobre #132 | totais P/K/S/calcário e resumo |
| #127 | `feature/issue-127-multiseason-planning-v1` / `0629cab` | sibling sobre #132 | migration 047 + API/UI/RLS + lifecycle + RBAC |

### Deduplicação importante: V2 × #128

`feature/issue-128-tenant-audit` contém, nesta ordem:

1. `ed03e10 feat(calculator): add points to product workflow`
2. `1341ab8 test(tenant): cover foreign catalog mutations`
3. `dd71800 fix(tenant): hide foreign field on season create`
4. `1e9667a docs(tenant): record audit topology and RBAC`

Logo, se a integração futura escolher `feature/issue-128-tenant-audit`, **não
integrar `feature/calculadora-raiz-v2-pontos` separadamente**. Isso duplicaria os
dois primeiros commits.

## PRs antigas divergentes — não integrar às cegas

As seguintes PRs abertas não são ancestrais diretas de #132; seus heads divergem
da linha atual e precisam de uma auditoria de lacuna funcional antes de qualquer
cherry-pick ou reimplementação:

- #117 — Assistente RAIZ com contexto exato de entidade;
- #115 — comparativos/deltas compatíveis;
- #111 — contexto auditável Solo × Satélite;
- #109 — comparação temporal NDVI A × B;
- #106 — confiabilidade técnica explicável;
- #101 — verdade espacial Cabeda / NDVI etapa 1.

Regra: primeiro verificar se a funcionalidade equivalente já existe na baseline
#132 ou em branches posteriores. Só portar o que estiver comprovadamente ausente.
Não reaplicar uma PR inteira apenas porque o head divergiu.

## Ordem recomendada para uma futura integração humana

1. Usar #132 (`a46edeb`) como baseline consolidada das pilhas #129/#131/#132 e
   dos ancestrais #121/#119/#104.
2. Sobre essa baseline, absorver **uma única vez**
   `feature/issue-128-tenant-audit` (`1e9667a`), que já inclui a Calculadora V2.
3. Integrar #122 e #123 como siblings pequenos e independentes sobre a baseline
   consolidada.
4. Integrar #127 por último, porque adiciona migration 047, novas tabelas,
   repository/API/UI e RLS. Antes disso, repetir apenas os gates de integração
   necessários; não refazer desenvolvimento já validado.
5. Só depois executar a auditoria de lacunas das PRs divergentes
   #117/#115/#111/#109/#106/#101 e portar exclusivamente o que estiver faltando.

## Gates já comprovados e que não devem ser refeitos sem mudança de base

- migrations 001–047 aplicadas do zero em PostGIS local descartável;
- RLS de planejamento validado com `raiz_app`;
- lifecycle de cenário plurissafras validado localmente;
- typecheck/build/test:handoff verdes nos checkpoints informados;
- P/K/S/calcário e totais do produtor cobertos por contratos;
- Calculadora V2 e catálogo tenant-scoped cobertos por testes;
- Talhão 360° com filtro de fertilidade e paleta NDVI validados por contratos.

Repetir esses gates somente quando uma futura branch de integração realmente
combinar as frentes e puder introduzir regressão.

Nenhuma frente acima deve ser considerada mergeada ou deployada em produção.
