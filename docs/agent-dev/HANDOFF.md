# Handoff — Issue #128

## Estado verificável

- Branch: `work/codex-night-multitenant-2026-09-30`
- Base e HEAD inicial: `2e756b078fb044f8f35c675e8aec408b3f1d8b5f`
- Produção: não alterada; migration 044 criada, não aplicada.
- PR: ainda não criado.

## Validação local deste corte

- `npm run test:client-master` passou.
- `npm run typecheck` passou.
- `npm run test:security` passou.
- `npm run check:migrations` passou antes da criação da migration 044; executar de
  novo ao encerrar o próximo corte.

## Restrições preservadas

Clientes legados não tiveram documento, tipo PF/PJ ou status inferidos. O
documento normalizado só é gravado em criação/edição explícita e o índice é por
empresa. O arquivamento não apaga dados nem relações agronômicas.
