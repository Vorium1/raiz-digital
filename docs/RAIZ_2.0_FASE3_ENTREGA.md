# RAIZ 2.0, Fase 3 — Cockpit de Inteligência Agronômica + Relatórios por Destinatário

Branch: `feature/raiz-2.0-fase3`, criada a partir de `feature/raiz-2.0-fase2` no commit `3e78cb9`
(entrega da Fase 2, já aceita). Nada foi publicado em `develop`/`main`, nenhuma migração executada,
nenhum serviço pago contratado, nenhum dado de produção alterado. `AGENTS.md` não existe neste
repositório (só um arquivo de mesmo nome dentro de `node_modules/next`, documentação do próprio
Next.js, não instrução do projeto) — a fonte de instrução aplicada foi `CLAUDE.md`, já em vigor.

## Conclusão objetiva

**Pronta para revisão.** Os 6 blocos do escopo (A–F) foram implementados com dado real, verificados
visualmente (screenshot real, sessão de banco de dev real) e cobertos por teste automatizado focado.
Durante a validação desta Fase, um teste e2e revelou um bug real e pré-existente **desta mesma sessão**
(introduzido na Fase 2, não antes): a pré-seleção de comparativo pela URL quebrava sob o duplo-disparo de
efeito do React Strict Mode em desenvolvimento — corrigido nesta rodada (ver Bloco C).

---

## Preparação — o que existe de verdade (antes de desenhar qualquer tela)

- **`/inteligencia` antes**: `listAllInterpretations` listava **uma linha por revisão** de interpretação,
  não por análise — uma análise recalculada 5 vezes aparecia como 5 problemas distintos, misturados
  cronologicamente com todas as outras. Nenhum filtro (cliente/propriedade/talhão/safra/situação) existia.
- **Revisão profissional**: mecanismo já real e auditável — `reviewed_by`/`approved_by` são `uuid` reais
  da sessão autenticada (não texto livre), com trilha de auditoria (`writeAudit`). Estados reais
  confirmados: `CALCULATED` (bloqueada) → `IN_REVIEW` (aguardando ou já devolvida) → `APPROVED`. Não existe
  um estado formal "em andamento" — mas existe uma combinação real e distinguível (`IN_REVIEW` +
  `reviewed_by` já preenchido = alguém já olhou e devolveu) — usada honestamente como o 4º grupo da fila,
  sem inventar um 5º estado.
- **IA (narrativa/prescrição)**: mesmo mecanismo humano de revisão da interpretação. Não existe hoje
  nenhum registro estruturado de "hipótese diagnóstica" no sistema — confirmado antes de desenhar a
  categoria 4 do cockpit, que por isso declara essa ausência explicitamente em vez de inventar um
  mecanismo.
- **Relatórios antes**: 4 rotas técnicas sem distinção de destinatário; PDF gerado via `window.print()`
  (sem Puppeteer/react-pdf); o mapa Leaflet já era **excluído da impressão** (`no-print`) de propósito
  (não é bug novo, mas não estava explicado na tela); o relatório por talhão **sempre lê a interpretação
  mais recente ao vivo**, nunca o snapshot imutável publicado em `reports` — bug real de
  reprodutibilidade, documentado (Bloco F).
- **RBAC**: `RUN_ROLES` (roda o motor) ⊋ `REVIEW_ROLES` (aprova) já existia e está correto — `FIELD_TECH`
  recalcula mas nunca aprova. Reaproveitado sem alteração.

---

## Bloco A — Inteligência como fila de trabalho técnico

`src/app/(platform)/inteligencia/page.tsx` (reescrito), `src/lib/repositories/interpretations.ts`
(`getIntelligenceQueue`/`getIntelligenceFilterOptions`, novas), `src/domain/interpretation-status.ts`
(`interpretationQueueBucket`, novo), `src/components/intelligence-queue-filters.tsx` (novo).

- **Uma linha por análise**, sempre a revisão mais recente (`DISTINCT ON (a.id) ... ORDER BY revision
  DESC`) — nunca mais uma revisão antiga parecendo um problema à parte. `revisionCount` mostra quantas
  versões existem sem listá-las na fila (acesso continua garantido dentro do item).
- **Filtros reais em cascata**: cliente → propriedade → talhão → safra (mesmo padrão de
  `DashboardFilters`, Fase 1) + situação da interpretação (bloqueada/interpretável) e situação da revisão
  (aguardando/em andamento/aprovada) — os dois últimos são valores **derivados** de status+motivo+revisor
  reais, nunca uma coluna inventada.
- **4 grupos reais, nunca um 5º inventado**: dado impede interpretação · calculada aguardando revisão ·
  revisão em andamento (só aparece quando a combinação real existir) · aprovada.
- Cada item mostra: contexto (cliente/propriedade/talhão/safra), situação, impedimento ou base técnica,
  data, responsável (só quando `reviewedByName`/`approvedByName` existem de verdade) e próxima ação real
  com destino navegável.

**Evidência real**: screenshot com 4 análises reais do Cabeda, cada uma exatamente 1 linha (mesmo tendo
"2 versões" cada), contadores por grupo corretos. Teste e2e confirma hrefs únicos (nunca duas linhas pro
mesmo `analysisId`).

## Bloco B — Cockpit técnico contextual

`src/components/agronomic-intelligence-panel.tsx` (reescrito), `src/app/(platform)/analises/[id]/page.tsx`
(reestruturado pra duas regiões), `src/domain/parameter-patterns.ts` (novo,
`computeSpatialPatterns`), `src/domain/agronomic-engine.ts`/`src/lib/repositories/interpretations.ts`
(campo `source` MEASURED/CALCULATED thread­ado de `lab_results.source` até a tela — antes existia na
tabela mas nunca chegava na interface).

Duas regiões complementares (`.cockpit-evidence` / `.cockpit-technical`), contexto (talhão/safra/análise/
revisão) preservado no cabeçalho existente da página:

1. **Dado** — tabela real (ponto/parâmetro/resultado/método/origem), origem distinguindo medição de
   laboratório vs. calculado vs. "não registrada" (dado de antes desta rastreabilidade — nunca inventa
   retroativamente).
2. **Interpretação** — classificação real + base técnica/versão + motivo de bloqueio quando existir;
   síntese em linguagem simples (IA) embutida aqui, nunca misturada com a categoria Hipótese.
3. **Padrão** — repetição espacial real DENTRO da mesma coleta (≥3 pontos comparáveis, ≥60% mesma
   classificação); nunca gerado de uma observação isolada; sempre com quantidade/pontos/limitação
   explícita ("dentro desta única coleta — não avalia repetição entre safras").
4. **Hipótese** — declara explicitamente que não existe mecanismo técnico definido pra isso nesta
   instância, em vez de inventar uma explicação causal.
5. **Recomendação** — painel de prescrição já existente (Fase anterior), reaproveitado, com distinção
   real rascunho/aprovada.
6. **Validação profissional** — situação real, revisor/aprovador reais (só quando registrados), versão
   (nº de revisão), e um aviso real e novo: quando existe uma revisão **aprovada anterior** mas a atual
   foi recalculada depois, isso fica explícito ("a aprovação anterior não cobre automaticamente este dado
   novo") — nunca deixa a aprovação antiga parecer que cobre o dado novo.

**Evidência real**: cockpit aberto pra `AN-CABEDA-03` (dado real, Rafael Cabeda) mostrando as 6 categorias;
recalculado ao vivo (revisão #2 → #3) confirmando que a coluna "Origem" passa de "Não registrada" pra
"Medição de laboratório" assim que a interpretação é recalculada com o campo novo. Teste e2e confirma as 6
categorias (filho direto, não conta os `<h3>` internos dos painéis de IA embutidos).

## Bloco C — Investigação conectada

Dentro do cockpit: mapa real (`RealFieldMap` + `map-layer`, mesmos dados da Fase 2) com seletor de
parâmetro, link "Histórico compatível" (`/relatorios/evolucao/{fieldId}`), "Abrir comparação"
(`/comparativos?mode=fields&a={fieldId}`), "Talhão 360°", e toggle "Consultar satélite" que embute
`FieldNdviPanel` com uma **nota de compatibilidade real**: diferença em dias entre a leitura de satélite
mais recente e a coleta de solo mais recente, com o aviso explícito de que são naturezas de dado
diferentes e a proximidade de data não implica causa.

- **Nunca apresenta NDVI agregado como evidência espacial interna** (mesma limitação já documentada na
  Fase 2 — reaproveitada, não repetida aqui).
- **Nunca converte correlação em causalidade** — a nota de compatibilidade é só factual (dias de
  diferença), nenhuma conclusão de causa.

**Bug real encontrado e corrigido nesta rodada**: a pré-seleção de comparativo por URL
(`?mode=fields&a=`) não funcionava — o estado inicial `a` era limpo por um efeito de reset que usava um
`useRef` "consome na primeira chamada", que quebra sob o duplo-disparo de efeito do React 18 Strict Mode
em desenvolvimento (a montagem roda o efeito, desmonta simulado, roda de novo — o guard "só uma vez" já
tinha sido consumido no primeiro ciclo simulado). Corrigido comparando o `mode` real processado
(idempotente a quantas vezes o efeito rodar), não um contador de "primeira vez". Confirmado com teste e2e
que falhava antes da correção e passa depois.

## Bloco D — Experiência de revisão profissional

Sem alteração no mecanismo de persistência (já real e auditável — reaproveitado integralmente). Melhorias:

- Botões de ação (Recalcular/Aprovar) continuam gated pelas MESMAS roles reais (`RUN_ROLES`/
  `REVIEW_ROLES`) — nenhuma nova permissão inventada. Confirmado com sessão real de `FIELD_TECH`: vê
  "Recalcular", nunca vê "Aprovar interpretação".
- Situação/revisor/aprovador/versão sempre visíveis na categoria 6, com nome real (nunca a config de
  marca da empresa tratada como se fosse a assinatura desta interpretação específica — essas duas coisas
  já eram tecnicamente distintas no banco, agora ficam visualmente distintas também).
- **Aviso de aprovação desatualizada** (novo, ver Bloco B item 6): a revisão anterior aprovada e a data
  envolvida ficam visíveis quando o dado foi recalculado depois — nunca a aprovação antiga aparece como
  se cobrisse o dado novo.
- Nenhum novo estado de interpretação foi criado na interface — os 4 grupos da fila (Bloco A) e o aviso
  de aprovação desatualizada (Bloco B/D) são todos derivados de combinações reais de colunas já
  existentes.

## Bloco E — Relatórios com destinatário

`src/app/(platform)/relatorios/page.tsx` (reorganizado por destinatário), `src/app/(platform)/relatorios/
produtor/[analysisId]/page.tsx` (**novo**), `src/lib/repositories/reports.ts`
(`getPropertyExecutiveReportData` reescrito).

- **Executivo** (`/relatorios/propriedade/[id]`): reescrito pra reaproveitar as MESMAS agregações já
  auditadas da Central de Decisão (`getExecutiveDashboard`/`getPortfolioFieldSummaries`, Fase 1) — situação
  da propriedade, áreas que exigem atenção (com o motivo real do impedimento), cobertura da avaliação,
  próximos passos reais por talhão.
- **Técnico** (`/relatorios/talhao/[analysisId]`): já cobria a maior parte do escopo (contexto, métodos,
  regras/versão, interpretação, recomendações, validação); corrigido nesta rodada pra usar
  `analysisDisplayStatus` (mesma correção já aplicada na tela de análise na Fase 1, mas que **não tinha
  chegado neste relatório** — divergência real entre tela e documento, corrigida).
- **Operacional** (`/relatorios/coleta/[orderId]`): já cobria ordem/talhão/pontos/datas/responsáveis/
  mapa/GPS; adicionada seção "Objetivo e instruções", que declara explicitamente que não existe hoje
  campo de instrução textual livre persistido em `collection_orders` (ver Limitações).
- **Resumo ao produtor** (`/relatorios/produtor/[analysisId]`, **novo**): "o que foi observado / o que
  foi interpretado / o que foi aprovado / o que ainda precisa ser investigado / próximos passos", template
  determinístico (nenhuma chamada de IA), mesma fonte real do relatório técnico.

**Evidência real**: screenshot do índice `/relatorios` com as 4 seções por destinatário; relatório
executivo real da propriedade Rafael Cabeda (3 talhões, 100% cobertura, 3 áreas em atenção com motivo
real); resumo ao produtor real da análise AN-CABEDA-03. Teste e2e confirma as 4 seções e que o resumo ao
produtor nunca cita um provedor de IA.

## Bloco F — Qualidade e confiança na entrega

- **Rascunho vs. publicado, real**: `getFieldAnalysisReportData` agora compara a interpretação mostrada
  contra o `reports` publicado mais recente (`isShowingPublishedVersion`); a tela do relatório técnico
  mostra um aviso real e distinto em cada caso (nunca publicado / publicado e igual / publicado mas dado
  recalculado depois). Isso **não resolve** a limitação de fundo — ver Limitações.
- **Mapas na exportação**: confirmado que o mapa Leaflet já era `no-print` de propósito (não seria
  capturado de forma confiável pela impressão do navegador). Adicionada legenda explícita na tela ("só na
  tela — no PDF, ver coordenadas na tabela de pontos") nos 2 relatórios com mapa, em vez de deixar o mapa
  simplesmente sumir sem explicação — a evidência espacial (coordenadas + origem GPS) continua presente
  no PDF via tabela.
- **Bug real de contraste corrigido**: `.report-pendencies` (lista de pendências, usada em 3 dos 4
  relatórios) tinha fundo escuro com texto quase da mesma cor (herdado dos tokens do `.report-doc`, que é
  tema claro) — texto praticamente ilegível. Corrigido pra cores claras coerentes com o resto do
  documento impresso.
- **Autoria/versão/data de geração**: já presentes nos relatórios técnico/operacional (novos: também no
  executivo e no resumo ao produtor).

**Não foi enviado, publicado nem aprovado nenhum documento real de cliente durante a validação** — as
únicas ações de escrita realizadas foram um "Recalcular" (ação técnica normal, já autorizada por role,
sobre uma análise de dado de teste/demonstração já usada nas fases anteriores).

---

## Direção visual

Nenhum "glow", cartão repetido ou jargão de infraestrutura foi introduzido. O cockpit prioriza síntese →
evidência → interpretação → revisão, na ordem de leitura vertical/horizontal das duas regiões. Os
relatórios usam a mesma tipografia/paleta já estabelecida (`report-doc`), sem elementos decorativos novos.

## Limites respeitados

Nenhuma alteração em fórmulas/faixas agronômicas (`agronomic-engine.ts` só ganhou um campo de metadado
`source`, nunca usado em cálculo). Nenhuma regra homologada por este agente. RLS/permissões inalteradas —
só reaproveitadas com mais visibilidade na interface. Nenhuma prescrição autônoma criada (o painel de
prescrição continua exatamente com o mesmo fluxo de rascunho→aprovação humana da Fase anterior). Nenhum
serviço pago novo. Nenhum copiloto generativo da Fase 4 iniciado — o "Resumo ao produtor" é
deliberadamente um template determinístico, sem IA. Nenhum merge, deploy, migração ou alteração de
produção.

## Testes executados, com resultado

```
npm run typecheck                                                              → sem erros
npm run build                                                                   → build de produção completo, sem erros
npx playwright test e2e/field-overview-and-priorities.spec.ts \
  e2e/fase2-map-workspace-and-comparisons.spec.ts \
  e2e/fase3-cockpit-and-reports.spec.ts                                        → 19 passed, 1 skipped, 0 failed
                                                                                   (skip: estado da URL de
                                                                                   satélite/parâmetro em mapas
                                                                                   depende de dado que não
                                                                                   estava disponível nesta
                                                                                   execução -- não é falha)
```

Os 6 testes novos e focados (`e2e/fase3-cockpit-and-reports.spec.ts`) cobrem: agrupamento da fila por
análise (Bloco A), as 6 categorias reais do cockpit (Bloco B), pré-seleção de comparativo pela URL sem
disparar comparação sozinha (Bloco C — encontrou e provou a correção do bug real do Strict Mode),
permissão real de aprovação por role (Bloco D), organização por destinatário + ausência de IA no resumo
ao produtor (Bloco E), e identificação de rascunho/publicado (Bloco F). Todos descobrem dado real em
tempo de execução (nunca id fixo) e pulam com `test.skip` quando o dado atual do banco não sustenta o
cenário, em vez de fingir sucesso.

Um teste **pré-existente** da Fase 2 (`Solo e Fertilidade: mostra o valor observado real`) quebrou de
forma intermitente ao rodar em paralelo com os testes desta Fase (dependia da ordem de exibição do
`<select>` de parâmetros, que pode listar primeiro um parâmetro sem valor lançado num banco de dev
parcialmente poluído) — corrigido para escolher deterministicamente um parâmetro que realmente tenha
valor, em vez de confiar na primeira opção da lista.

## Limitações concretas (documentadas, não escondidas)

- **Reprodutibilidade do relatório publicado**: esta instância grava um snapshot imutável com hash
  SHA-256 (`reports.sha256`) ao publicar, mas **não o serve de volta** — a tela do relatório sempre lê a
  interpretação mais recente ao vivo. O aviso real (Bloco F) informa quando a tela diverge do publicado,
  mas não resolve a causa raiz. **Estrutura que faltaria** pra resolver de verdade: servir o conteúdo a
  partir do storage do snapshot (já existe `saveReportSnapshot`/`storage_key`) quando
  `isShowingPublishedVersion` for falso e o usuário pedir explicitamente a versão publicada — isso exigiria
  uma rota nova de leitura do storage, não uma migração de schema (o dado já existe), mas está fora do
  escopo desta Fase.
- **Instruções operacionais de campo**: `collection_orders` não tem campo de texto livre pra
  instrução/objetivo — o relatório operacional declara isso explicitamente em vez de inventar texto.
  Resolver exigiria uma migração real (`ALTER TABLE collection_orders ADD COLUMN instructions text`), não
  executada aqui por instrução explícita ("documente a mudança necessária sem executar migração").
- **Padrão temporal (entre safras)**: a categoria "Padrão" do cockpit só avalia repetição espacial DENTRO
  da mesma coleta — comparar entre safras/datas diferentes exigiria a mesma disciplina de compatibilidade
  de profundidade/método/tipo de amostra já usada nos comparativos (Fase 2), e foi deixado de fora desta
  rodada por prudência (evitar um "padrão" que na verdade combina medidas incompatíveis).
- **Hipótese diagnóstica**: nenhum mecanismo existe — categoria declarada como ausente, não simulada.

## Estado local e remoto

```
git branch --show-current                                       → feature/raiz-2.0-fase3
git log feature/raiz-2.0-fase3 --not feature/raiz-2.0-fase2      → commits desta Fase (ver hash no fechamento)
```

Nenhum merge, deploy, migração ou alteração de produção foi executado.
