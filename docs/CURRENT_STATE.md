# CURRENT_STATE — RAIZ Digital

Atualizado em 2026-10-06.

Este arquivo é a fonte curta de retomada operacional. Ele não substitui o histórico
em `docs/PROJECT_STATE.md` nem autoriza merge, deploy ou alterações de produção.

## Baseline técnica consolidada

A baseline mais útil para as frentes recentes é:

- branch: `feature/agronomic-decision-timeline`
- HEAD: `a46edeb3d6eb49c34951b49944289d6e93eb6a81`
- Draft PR: #132

Por ancestralidade Git confirmada, #132 já contém as linhas de #129 e #131 e também
as entregas anteriores de performance (#121), decisão/entrega congelada (#119) e
relatório visual (#104). Não reaplicar esses commits.

Na baseline #132 existem migrations 001–046.

## Frentes novas preservadas, ainda não integradas

- #133 — pós-#132 multiempresa/tenant + Calculadora V2; a branch #128 é superset
  de `feature/calculadora-raiz-v2-pontos`, portanto a V2 não deve ser integrada
  separadamente se #133 for escolhida.
- #134 — Talhão 360°: fertilidade visível + contraste NDVI.
- #135 — relatório quantitativo P/K/S/calcário e totais do produtor.
- #136 — Planejamento Plurissafras V1; adiciona migration 047, API/UI/RLS,
  lifecycle e snapshots.
- #137 — documentação de prontidão/ancestralidade.
- #138 — histórico temporal compatível, port cirúrgico da antiga #115.
- #139 — comparação NDVI A × B, empilhada sobre #134.
- #140 — contexto auditável Solo × Satélite, empilhado sobre #139.
- #141 — explicação da confiança técnica já persistida pelo motor.
- #142 — explicação da confiança do laudo/importação, empilhada sobre #141.
- #143 — editor de contorno produtivo com pontos GPS fixos.
- #144 — autoridade de posição auditada + pré-checagem visual N de N pontos dentro, empilhada sobre #143.
- #145 — prova de readiness do runtime pós-deploy por SHA exato, sem executar produção neste Draft.

Nenhuma dessas frentes deve ser considerada mergeada ou em produção.

## Banco e migrations

- migrations 001–046 pertencem à baseline técnica #132;
- migration 047 pertence ao Draft do Planejamento Plurissafras (#136);
- 001–047 já foram validadas em PostGIS local descartável em clean-room;
- isso NÃO significa aplicação em produção.

Nunca executar migration de produção sem autorização explícita.

## Regras de retomada e anti-retrabalho

Antes de alterar código:

1. ler este arquivo;
2. ler `docs/INTEGRATION_READINESS.md`;
3. ler a issue/checkpoint relevante, especialmente #113;
4. conferir HEAD/base reais das branches envolvidas;
5. comparar ancestralidade antes de criar branch/PR;
6. nunca reaplicar uma PR inteira apenas porque ela divergiu da baseline;
7. portar somente a capacidade comprovadamente ausente.

## Segurança

Sem autorização explícita, é proibido:

- merge;
- deploy/publicação de produção;
- migration em produção;
- escrita agronômica em produção;
- force-push/rebase destrutivo;
- alterar snapshot publicado;
- inventar dose, regra, clima, coordenada, NDVI, produto, preço, CRS/datum ou
  qualquer evidência ausente.

Snapshots publicados são imutáveis e o sistema deve falhar fechado.

## Gates já comprovados em checkpoints recentes

Sem mudança de base, não refazer por rotina:

- migrations 001–047 em PostGIS local descartável;
- RLS real de planejamento sob `raiz_app`;
- lifecycle do Planejamento Plurissafras;
- typecheck/build/test:handoff nos checkpoints documentados;
- contratos P/K/S/calcário e totais do produtor;
- Calculadora RAIZ V2;
- Talhão 360°/fertilidade/NDVI;
- previews Vercel verdes dos ports recentes já documentados em
  `INTEGRATION_READINESS.md`.

Quando frentes forem combinadas numa futura integração, repetir os gates relevantes
sobre a combinação resultante, não sobre cada commit antigo isoladamente.

## Atualizações recentes de segurança

- #133 recebeu o gate RLS ampliado no commit `5a620e5`, cobrindo equipe, imports,
  relatórios, NDVI e snapshots comerciais além de clientes/catálogo.
- #144 e #145 possuem preview Vercel verde no último checkpoint verificado.

## Próximo foco seguro

Manter as frentes em Draft e usar `docs/INTEGRATION_READINESS.md` para preparar uma
futura integração humana sem duplicar commits. Não integrar ou publicar sem autorização.
