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

## Auditoria inicial das PRs antigas divergentes

Foi feita uma primeira checagem por arquivos distintivos diretamente contra #132.
Isto **não prova ausência funcional** quando um arquivo não existe, porque a função pode
ter sido renomeada/reimplementada; serve apenas para direcionar a próxima auditoria sem
retrabalho.

| PR | Arquivo distintivo da PR | Em #132? | Interpretação segura |
| --- | --- | --- | --- |
| #117 Assistente | `src/lib/ai/assistant-evidence.ts` | sim | não portar a PR inteira; existe implementação posterior/equivalente e precisa de diff semântico |
| #115 Comparativos | `src/domain/comparison-compatibility.ts` | não | lacuna possível; verificar equivalente antes de portar |
| #111 Solo × Satélite | `src/components/soil-satellite-evidence-context.tsx` | não | lacuna possível; verificar composição atual do Talhão 360° |
| #109 NDVI temporal | `src/components/ndvi-temporal-comparison.tsx` | não | lacuna possível; verificar comparação temporal existente antes de portar |
| #106 Confiança explicável | `src/domain/technical-confidence-explanation.ts` | não | lacuna possível; verificar explicação de confiança atual antes de portar |
| #101 Verdade espacial Cabeda | `scripts/audit-cabeda-coordinate-chain.mjs` | não | script específico ausente não implica regressão; validar contratos espaciais atuais |

Próxima regra: para cada linha marcada como “lacuna possível”, comparar comportamento,
testes e contratos atuais com a PR antiga antes de qualquer mudança de código.

## Resultado da auditoria funcional inicial das PRs divergentes

A comparação de comportamento atual com as branches antigas permitiu reduzir o risco
de retrabalho:

- **#117 Assistente RAIZ**: a baseline #132 já possui `assistant-evidence.ts`,
  Evidence Catalog, grounding gate, provider router e controles posteriores. Tratar
  #117 como **supersedida por implementação mais nova**; não portar a PR inteira.
- **#115 Comparativos/deltas**: a baseline já possui comparação real entre
  talhão/safra/ponto/propriedade, porém `/historico` em modo banco ainda é um
  placeholder e não existe `/api/comparisons/history`. Portanto a lacuna real é
  **histórico temporal comparável do mesmo talhão**, não o comparador inteiro.
- **#111 Solo × Satélite**: a baseline possui `field-satellite-decision-strip` e
  sobreposição solo/NDVI no painel, mas não possui o cartão detalhado da PR antiga
  que explicita evidência por ponto, posição efetiva, coleta, satélite e relação
  temporal. Classificar como **lacuna de explicabilidade**, não como ausência de
  NDVI.
- **#109 NDVI temporal A × B**: a baseline possui série temporal e estado temporal,
  mas não possui o seletor explícito de duas aquisições reais com delta A→B da PR
  antiga. Classificar como **lacuna de UX/comparação pairwise**, não como ausência
  do motor NDVI.
- **#106 Confiança explicável**: `decision-readiness-card` atual explica o fluxo
  operacional da decisão, mas não substitui o explainer técnico da PR antiga
  (score/dimensões/pesos/limitações). Classificar como **lacuna de explicabilidade
  da confiança**, caso esse requisito continue desejado.
- **#101 Verdade espacial Cabeda**: grande parte da infraestrutura espacial atual
  (mapas, posição observada/auditada, proveniência, contratos) evoluiu depois.
  Não portar scripts/PR inteira sem um teste de aceitação específico mostrando uma
  regressão real.

Prioridade sugerida das lacunas reais remanescentes, sem reimplementar o que já
existe:

1. #115: histórico temporal comparável;
2. #109: comparação NDVI A × B;
3. #111: explicabilidade Solo × Satélite;
4. #106: explicação técnica de confiança;
5. #101: somente se um gate espacial atual reprovar.

## Targeted ports concluídos sem replay das PRs antigas

As lacunas antigas que permaneceram relevantes foram portadas de forma cirúrgica sobre
a baseline atual. Nenhuma PR divergente foi reaplicada inteira.

| Origem antiga | Draft PR atual | Base atual | Capacidade portada | Regra anti-retrabalho |
| --- | --- | --- | --- | --- |
| #115 | #138 | #132 | histórico temporal compatível do mesmo talhão | preserva comparadores atuais de talhão/safra/ponto/propriedade |
| #109 | #139 | #122 | comparação NDVI A × B entre aquisições reais | empilhada sobre #122 para preservar a paleta/UX NDVI já refinada |
| #111 | #140 | #139 | contexto auditável Solo × Satélite | empilhada sobre #139 para editar o painel NDVI uma única vez |
| #106 | #141 | #132 | explicação do score técnico já persistido pelo motor | não recalcula score e não porta a reconstrução antiga de confiança do laudo |

### Estado de preview verificado

- #138: preview Vercel verde.
- #139: preview Vercel verde após alinhar o tipo pairwise ao contrato atual `rasterStored`.
- #140: preview Vercel verde com o mesmo contrato de raster e contexto Solo × Satélite.
- #141: preview criado; validação ainda em andamento no momento desta atualização.

### Lacunas antigas deliberadamente NÃO portadas

- **#117**: tratada como supersedida pela infraestrutura posterior do Assistente RAIZ
  existente em #132. Não reaplicar.
- **#101**: não portar scripts ou implementação antiga enquanto os contratos espaciais
  atuais de posição observada/auditada, proveniência e custódia não demonstrarem uma
  regressão real.
- **Confiança do laudo/importação da antiga #106**: não foi misturada ao port #141.
  O caminho técnico atual já possui confiança de interpretação persistida. A confiança
  do arquivo importado só deve virar nova frente se houver requisito de produto explícito
  e auditoria própria do score armazenado.

### Ordem futura sem duplicação

A linha NDVI deve ser considerada uma pilha única:

`#132 → #122/#134 → #139 → #140`

Portar #109 ou #111 separadamente depois dessa pilha seria retrabalho.

As frentes #138 e #141 continuam independentes sobre #132 e podem ser avaliadas sem
reaplicar suas PRs antigas.

## Fechamento da auditoria da antiga #101

A antiga PR #101 não será portada.

A baseline atual já possui contratos posteriores que cobrem os riscos centrais daquela
frente:

- `effectivePointCoordinates` prioriza posição observada quando existe;
- `pointPositionKind` distingue `OBSERVED`, `AUDITED_SOURCE` e `PLANNED`;
- somente fontes auditadas exatas promovem a coordenada para evidência real;
- fontes genéricas ou com sufixos arbitrários permanecem planejadas/fail-closed;
- `test:spatial-map`, `test:spatial-provenance-audit` e `test:cabeda-area01`
  já participam de `test:handoff`.

Conclusão: replayar #101 hoje seria retrabalho e risco de regressão. Reabrir essa
frente somente se um gate espacial atual falhar com evidência reproduzível.

## Item 4 (#105) — confiança explicável sem duplicar métrica

A antiga #106 foi dividida em dois ports cirúrgicos sobre a baseline atual, preservando
as autoridades de score já existentes:

- **#141** — explica a confiança da interpretação agronômica usando
  `structured_output.confidence` já persistido pelo motor; preview Vercel verde.
- **#142** — explica a confiança do laudo/importação usando o score persistido em
  `analyses.confidence_score` e a última importação do mesmo tenant; a decomposição
  só é exibida quando os dados persistidos reproduzem o score armazenado.

A #142 é empilhada sobre #141. Isso mantém separadas as duas confianças exigidas pela
issue #105 e evita criar um score paralelo. Se a reconstrução histórica não bater com
o score persistido, o score original continua autoridade e a decomposição falha fechado.

Regra futura: não reaplicar a antiga #106 inteira depois de #141 + #142.

## #101/#102 — separar autoridade espacial de editor de contorno

A auditoria refinada mostrou que a antiga linha #101 continha duas capacidades diferentes:

1. **autoridade/proveniência espacial de pontos** — já supersedida pelos contratos atuais
   (`effectivePointCoordinates`, `pointPositionKind`, auditoria espacial e gates do handoff);
2. **edição manual do contorno produtivo com GPS fixo (#102)** — não estava presente na
   baseline #132 e foi portada de forma cirúrgica no Draft PR **#143**.

O #143 adiciona apenas:
- edição Polygon/MultiPolygon do talhão;
- validação PostGIS;
- limite da propriedade;
- bloqueio quando ponto ativo ficaria fora;
- recálculo de área;
- audit trail sem coordenadas;
- visualização dos pontos como referências fixas.

Portanto, a antiga #101 continua proibida como replay integral. Para futura integração:
usar os contratos espaciais atuais + #143 para o editor, sem reaplicar a branch antiga.

