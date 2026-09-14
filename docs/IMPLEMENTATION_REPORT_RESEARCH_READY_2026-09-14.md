# Relatório de implementação — pesquisa A–H — 2026-09-14

## Escopo

Integração conservadora do cruzamento entre a pesquisa técnica do GPT Work, a resposta independente do Gemini e o estado atual do motor RAIZ Digital.

## Arquivos alterados

- `src/domain/agronomic-rule-catalog.ts` — catálogo versionado atualizado com sub-regras estreitas e estados fail-closed.
- `src/domain/research-ready-rules.ts` — funções determinísticas de arroz, micronutrientes, métricas espaciais e ledger MAP/DAP.
- `src/domain/spatial-prescription-request.ts` — gate espacial fortalecido, distinguindo mapa exploratório de prescrição oficial.
- `scripts/test-agronomic-rule-catalog.mjs` — testes de status, cálculos e conflitos.
- `scripts/test-spatial-prescription-request.mjs` — testes de suporte, modo exploratório, validação cruzada e aprovação profissional.
- `docs/RAIZ_RESEARCH_CROSSCHECK_2026-09-14.md` — matriz Work × Gemini e decisão integrada.

## Regras habilitadas neste lote

- N total de arroz contínuo SOSBAI 2025 em escopo fechado, preservando limites superiores.
- P de arroz contínuo SOSBAI 2025 em escopo fechado, preservando limites superiores.
- estimativa/risco de Fe em arroz somente com método analítico exigido.
- classificação CQFS 2016 de B, Zn, Cu e Mn com método/unidade/protocolo compatíveis e sem dose.
- métricas espaciais RMSE, MAE e ME sem threshold universal inventado.
- máscara/suporte espacial sem extrapolação e NoData preservado.
- ledger MAP/DAP por denominador/fonte, sem ajuste de calagem.

## Regras mantidas bloqueadas

- K e S de arroz como dose autônoma completa; calagem de arroz semeado em solo seco.
- qualquer seleção automática entre perfis de Mo em soja.
- dose automática de gesso para RS/SC.
- dose regional completa de carinata.
- dose genérica de B/Zn/Cu/Mn baseada apenas em classe de solo.
- N tardio de trigo para proteína sem módulo de qualidade e revisão.
- VRA oficial sem aprovação humana.

## Limitações intencionais

- As faixas de número de pontos usadas pelo gate espacial são política conservadora RAIZ e não limiares agronômicos universais.
- Não há threshold universal de RMSE/MAE/ME no código.
- O ledger MAP/DAP é explicativo e não altera SMP, V% ou qualquer regra de calagem.
- O motor não mistura automaticamente tabelas/edições de arroz.
- Nenhuma migração ou dado de produção foi alterado.

## Testes esperados antes da integração

O CI deve executar typecheck, `test:handoff`, migrations check e build. A branch só pode integrar em `develop` após todos os checks verdes. Em seguida, deve ser criado novo RC; `main` permanece sem alteração até homologação externa e GO explícito.