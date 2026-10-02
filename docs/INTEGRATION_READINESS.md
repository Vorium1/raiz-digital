# Integração futura — leitura Git de 2026-10-01

Este documento descreve ordem técnica sugerida. Não autoriza merge, deploy ou
migration fora do PostGIS local.

| Frente | Branch / HEAD | Base | Mudança central | Risco de integração | Estado técnico |
| --- | --- | --- | --- | --- | --- |
| #126 / PR #132 | `feature/agronomic-decision-timeline` / `a46edeb` | `main` | linha do tempo por evidência persistida | baixo; base das pilhas atuais | validada localmente |
| #129 / #128 | `488d39b` + `feature/issue-128-tenant-audit` / `1e9667a` | histórico anterior à timeline | tenant/RBAC, cliente mestre e catálogo | alto: toca autenticação e dados de domínio | contratos/RLS locais |
| #131 / #130 | `a4024d3` | #129 | fontes locais e calculadora | baixo após #129 | build determinístico |
| #122 | `feature/issue-122-field360-visual` / `0a03701` | #132 | contraste NDVI e filtros visuais | baixo; apresentação somente | build/contratos verdes |
| #123 | `feature/issue-123-dose-audit-current` / `86c40f0` | #132 | totais e resumo de relatório | médio: compartilha relatório/snapshot | contratos quantitativos verdes |
| #127 | `feature/issue-127-multiseason-planning-v1` / `436e597` | #132 | migration 047 e planejamento | alto: adiciona schema/API/UI | RLS local; requer revisão de lifecycle |
| Calculadora V2 | `feature/calculadora-raiz-v2-pontos` / `1341ab8` | #132 | conversão pontos→produto | médio: contém teste #128 empilhado | contratos locais verdes |
| #120 performance | não identificada em ref remota disponível | — | sem evidência Git suficiente | desconhecido | não classificar como pronta |

## Ordem recomendada para uma futura integração humana

1. Revisar/absorver #129/#128; é a dependência de segurança e cliente mestre.
2. Integrar #131/#130 e #132, resolvendo a ancestralidade compartilhada em uma única
   revisão — sem reaplicar commits duplicados.
3. Integrar #122 e #123 como cortes de apresentação/relatório sobre a base resultante.
4. Integrar Calculadora V2 após separar ou aceitar explicitamente o commit de cobertura
   #128 já contido na sua pilha.
5. Integrar #127 por último: inclui migration 047, API e RLS e deve entrar com banco
   limpo e smoke de lifecycle.

Nenhuma frente acima deve ser considerada deployada. A API GitHub não foi usada para
inferir aprovação, checks ou mergeability; a fonte desta matriz são refs Git locais/remotas.
