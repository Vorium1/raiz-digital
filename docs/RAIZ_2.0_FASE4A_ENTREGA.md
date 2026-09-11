# RAIZ 2.0, Fase 4A — Assistente RAIZ: Blocos 0-3 (implementação)

Branch: `feature/raiz-2.0-fase4`, sem merge em `develop`/`main`, sem migração executada, sem provedor de IA
generativa conectado. Continuação de `docs/RAIZ_2.0_FASE4_ARQUITETURA_ASSISTENTE.md` (aprovada com 4
correções obrigatórias) — esta entrega implementa **somente** os Blocos 0-3 do plano da arquitetura,
exatamente como autorizado. Blocos 4-7 (ações executáveis, redesenho do painel, provedor real, RAG) **não
foram tocados**.

## Resumo objetivo

- Bloco 0 (segurança primeiro): 4 testes e2e novos cobrindo isolamento de tenant, ID de outro tenant
  rejeitado, `tenantId` do corpo nunca altera a sessão, e RBAC sem ação indevida.
- Bloco 1 (contexto): `AssistantScreenContext` estendido pras 9 rotas reais, `ScreenState` separado
  (Correção 4 da arquitetura), `inferScreenContext`/`inferScreenState` puros e testados.
- Bloco 2 (Evidence Package Builders): um builder por contexto, reaproveitando repositórios já existentes,
  com o teto de tamanho e o `spatialGeometryAvailable: false` explícito do NDVI (Correção 1).
- Bloco 3 (resposta estruturada): `local-intent-assistant-provider.ts` migrado pro novo
  `AssistantStructuredResponse`, preservando as 8 intenções reais, sem LLM, `requires_professional_review`
  calculado por código.
- Auditoria: `evidenceManifest` (Correção 3) gravado em `ai_generations.request_payload`, sem migração;
  `status` passa a ser `PENDING_REVIEW` quando uma resposta trouxer hipótese (hoje nunca acontece, porque o
  provedor local nunca gera hipótese).

## Bloco 0 — segurança primeiro

Arquivo novo: `e2e/assistant-fase4a.spec.ts` (7 testes). Antes desta entrega, **nenhum** teste automatizado
cobria isolamento de tenant do `/api/assistant` — confirmado por busca no diretório `e2e/` inteiro durante
a etapa de arquitetura (nenhum arquivo mencionava "assistant"/"Assistente").

- **Tenant B nunca recebe evidência de talhão/propriedade da tenant A**, mesmo enviando um ID real de A em
  5 tipos de `ScreenContext` diferentes (`field`, `property`, `analysis`, `report-field`,
  `report-property`) — inclusive um ID de talhão deliberadamente enviado como se fosse de análise (prova
  que nem um ID "quase certo" vaza nada). Toda resposta continua `200` (fail closed: ausência de dado vira
  resposta honesta, nunca erro/crash) e nunca contém o nome real da entidade.
- **Comparação de safra com talhão de outro tenant** cai no caminho seguro "este talhão ainda não tem duas
  safras" — nunca usa o Evidence Package cross-tenant nem a consulta direta de fallback (ambos
  independentemente `tenant`-escopados).
- **`tenantId` enviado no corpo nunca altera o tenant da sessão** — comparação real: pergunta idêntica com
  e sem um `tenantId` forjado no corpo devolve exatamente os mesmos `facts` (prova que o campo é
  simplesmente ignorado, nunca lido).
- **FIELD_TECH consegue perguntar normalmente**, e `suggested_actions` continua vazio pra qualquer role
  (nenhuma ação executável existe ainda nesta etapa — não há, portanto, nenhuma ação que uma role sem
  permissão pudesse receber indevidamente; isso volta a ser testado de forma mais rica quando o Bloco 4
  existir).

Nenhuma RLS/RBAC foi enfraquecida pra viabilizar estes testes — todos rodam contra o endpoint real, com
login real, sem atalho.

## Bloco 1 — `ScreenContext` × `ScreenState`

Novo arquivo puro (zero import de banco/sessão): `src/lib/ai/assistant-screen.ts`.

```ts
export type AssistantScreenContext =
  | { type: "dashboard" }
  | { type: "property"; id: string }
  | { type: "field"; id: string }
  | { type: "analysis"; id: string }
  | { type: "intelligence" }
  | { type: "map" }
  | { type: "comparison" }
  | { type: "report-field"; id: string }
  | { type: "report-property"; id: string };

export type AssistantScreenState =
  | { screen: "map"; collectionOrderId?: string; parameter?: string; status?: "all"|"collected"|"pending"; satellite?: boolean }
  | { screen: "comparison"; mode?: "fields"|"seasons"|"points"|"properties"; a?: string; b?: string }
  | { screen: "intelligence"; clientId?: string; propertyId?: string; fieldId?: string; seasonId?: string; interpretationState?: string; reviewState?: string };
```

- `inferScreenContext(pathname)`: tabela de padrões de rota (regex + builder), cobrindo as 9 rotas reais
  do app (`/dashboard`, `/analises/[id]`, `/talhoes/[id]`, `/relatorios/talhao/[id]`,
  `/relatorios/propriedade/[id]`, `/mapas`, `/comparativos`, `/inteligencia`) — nenhuma rota inventada.
  `property` fica disponível na union mas sem entrada na tabela (não existe hoje uma página própria de
  propriedade — só o relatório executivo, coberto por `report-property`). ID malformado nunca vira
  contexto.
- `inferScreenState(pathname, searchParams)`: lê exatamente os MESMOS nomes de query param que
  `agronomic-map-explorer.tsx`/`comparison-explorer.tsx`/`intelligence-queue-filters.tsx` já usavam antes
  desta fase — nenhum contrato novo e paralelo.
- **Correção 4 aplicada**: `ScreenState` nunca é tratado como autorização em lugar nenhum do código — todo
  builder (Bloco 2) revalida tenant/existência por conta própria, ignorando se o valor veio "porque o
  browser mandou".
- Widget (`assistant-raiz-widget.tsx`) migrado pra importar de `assistant-screen.ts` (fonte única — antes
  tinha sua própria cópia local e mais simples do tipo, e cobria só 2 rotas).

**Testes**: `scripts/test-assistant-screen.mjs` (`npm run test:assistant-screen`), 11 cenários — as 9 rotas,
os 3 tipos de `ScreenState`, ids malformados nunca viram contexto, case-insensitividade de UUID.

## Bloco 2 — Evidence Package Builders

Novo arquivo: `src/lib/ai/assistant-evidence.ts`. Um builder por `ScreenContext.type`, cada um reaproveitando
repositório já existente (nenhuma consulta SQL duplicada onde já havia repositório apropriado):

| Contexto | Builder | Repositório reaproveitado |
|---|---|---|
| `dashboard` | `buildDashboardEvidence` | `getExecutiveDashboard`, `getPortfolioFieldSummaries`, `listOperationalAlerts` |
| `property`/`report-property` | `buildPropertyEvidence` | `getPropertyExecutiveReportData` |
| `field` | `buildFieldEvidence` | `getFieldOverview` |
| `analysis` | `buildAnalysisEvidence` | `buildAgronomicEvidencePackage` (Fase 3, sem alterar) |
| `report-field` | `buildReportFieldEvidence` | `getFieldAnalysisReportData` |
| `comparison` | `buildComparisonEvidence` | `compareFields`/`compareSeasons`/`comparePoints`/`compareProperties` |
| `intelligence` | `buildIntelligenceEvidence` | `getIntelligenceQueue` |
| `map` | `buildMapEvidence` | delega pra `field` (via 1 consulta nova e pequena, `collection_orders -> crop_seasons -> field_id`, tenant-escopada) ou `dashboard` |

Regras aplicadas em todos (arquitetura, seção 5.3):

- SEMPRE via `withTenant` — nenhuma exceção.
- Teto explícito de tamanho: `HISTORY_LIMIT = 5` (safras/análises/histórico de produtividade/relatórios),
  `LIST_LIMIT = 10` (talhões em atenção, alertas, itens da fila de inteligência).
- Dado ausente vira `null`/lista vazia — nenhum builder infere fato novo.
- Nenhum builder produz hipótese ou geometria que o dado não tem.

**Correção 1 aplicada (NDVI)**: `FieldEvidence.ndvi.spatialGeometryAvailable` é **sempre `false`**, um
literal de tipo (`false`, não `boolean`) — impossível, em tempo de compilação, algum código futuro
setá-lo como `true` por engano.

```ts
ndvi: { latestCapturedAt: string | null; latestMeanNdvi: number | null; zoneBreakdownPct: unknown | null; snapshotCount: number; spatialGeometryAvailable: false };
```

`comparison` nunca dispara a comparação sozinha — só monta evidência real quando `a`/`b` já estão
escolhidos no `ScreenState` (mesma regra de UX já testada na Fase 3 pra `comparison-explorer.tsx`); IDs
inválidos ou de outro tenant caem em `ready: false` sem vazar detalhe do erro.

**Testes**: cobertos pelos 7 testes e2e de `e2e/assistant-fase4a.spec.ts` (que exercitam o dispatcher real
via `/api/assistant`, incluindo um teste que confere a contagem real de talhões de uma propriedade contra
`/api/context`) — a decisão de testar builders via Playwright (não `node --experimental-strip-types`) é
técnica: `assistant-evidence.ts` importa `reports.ts`/`interpretations.ts`, que têm classes com parâmetro de
construtor TypeScript (`ReportError`, `InterpretationError`) — sintaxe que o strip-types de Node não
suporta (limitação confirmada em rodadas anteriores desta sessão, documentada no handoff do projeto).

## Bloco 3 — resposta estruturada

Novo arquivo puro: `src/lib/ai/assistant-response-schema.ts`.

```ts
type AssistantStructuredResponse = {
  summary: string;
  facts: Array<{ label: string; value: string; source: "database" }>;
  attention_points: Array<{ label: string; reason: string }>;
  patterns: Array<{ description: string; ruleRef: string }>;
  hypotheses: Array<{ statement: string; supportingEvidence: string[]; missingToConfirm: string[] }>;
  missing_information: string[];
  technical_references: Array<{ title: string; institution: string | null }>;
  suggested_actions: [];  // reservado pro Bloco 4 -- tupla vazia impede uso prematuro em tempo de compilação
  requires_professional_review: boolean;
  cards: Array<{ title: string; description: string; href?: string }>;  // navegação determinística preservada
};
```

`computeRequiresProfessionalReview(response)`: regra explícita e determinística — `hypotheses.length > 0`,
nunca uma heurística textual tipo "se parece recomendação". Como o provedor local nunca gera hipótese,
`requires_professional_review` sempre resolve `false` nesta etapa — exatamente o esperado (provider
determinístico, sem interpretação nova).

`src/lib/ai/providers/local-intent-assistant-provider.ts` migrado, preservando as 8 intenções reais
(coleta atrasada, pontos pendentes, laudos do mês, revisões pendentes, confiabilidade, comparação de
safra, resumo de propriedade, pendências gerais) — nenhuma removida, nenhuma nova. Onde o `ScreenContext`
já trazia um Evidence Package pronto pro talhão/propriedade em questão (Bloco 1+2), o provedor usa esse
pacote já resolvido em vez de consultar de novo (comparação de safra dentro de um talhão, resumo dentro de
uma propriedade) — prova real de que os 3 blocos já estão conectados, não são camadas paralelas. A única
exceção documentada: resolver uma propriedade a partir do **nome digitado livremente** na pergunta (fora
de uma tela de propriedade) é uma operação que depende do texto da pergunta, que nenhum Evidence Package
pré-construído poderia antecipar — nesse único caso, o provedor chama o MESMO builder (`buildPropertyEvidence`)
diretamente, depois de resolver o nome via `findPropertyByName`, nunca uma consulta paralela.

`src/app/api/assistant/route.ts` reescrito: valida `screenContext`/`screenState` do corpo de forma
defensiva (tipo desconhecido ou ID malformado cai pro `dashboard`, nunca vira consulta com entrada
inválida), monta o Evidence Package via `buildAssistantEvidence`, chama o provedor, grava auditoria.

**Testes**: `scripts/test-assistant-response-schema.mjs` (`npm run test:assistant-response-schema`), 5
cenários — regra de revisão profissional (código, nunca o provider) e a prova pedida explicitamente pelo
diretor: `describeNdviFieldCoexistence` **nunca** produz um texto que afirme coincidência espacial como
fato — só nega ("NÃO é uma coincidência espacial confirmada"/"Não é possível afirmar coincidência
espacial...") ou declara a lacuna em `missing_information`. Mais 1 teste e2e (`Assistente: resposta sempre
traz o novo schema estruturado`) confirma o formato real trafegando pelo endpoint.

## Auditoria (Correção 3 — `evidenceManifest`)

`src/lib/ai/assistant-evidence.ts` exporta `buildEvidenceManifest`, sem nenhuma migração:

```ts
type EvidenceManifest = {
  screenContext: AssistantScreenContext;
  entityIds: Record<string, string>;
  builtAt: string;
  ruleRefs: string[];
  technicalSourceIds: string[];
  evidenceHash: string;                              // sha256 do Evidence Package completo -- prova de integridade
  factsSnapshot: Array<{ label: string; value: string }>;  // só os fatos que a resposta final citou, teto de 20 itens
};
```

Gravado dentro de `ai_generations.request_payload` (já `jsonb`, já existia) via
`src/app/api/assistant/route.ts` — nunca copia o Evidence Package inteiro nem histórico bruto pra dentro da
tabela de auditoria, só o hash (prova de integridade, reconstruível a qualquer momento reconsultando o
banco com os mesmos `entityIds`) e um recorte explicitamente limitado (20 itens no máximo) dos fatos que a
resposta final efetivamente usou.

`src/lib/repositories/ai-generations.ts` (`recordOperationalAssistantGeneration`): ganhou um parâmetro
`status?: "APPROVED" | "PENDING_REVIEW"` (antes sempre `'APPROVED'`, hardcoded na query) — a rota passa
`PENDING_REVIEW` quando `requires_professional_review === true`. Coluna e enum (`ai_review_status`) já
existiam — nenhuma migração.

## Arquivos alterados/criados

**Novos**:
- `src/lib/ai/assistant-screen.ts` (Bloco 1 — puro, testável sem banco)
- `src/lib/ai/assistant-evidence.ts` (Bloco 2 — builders + `evidenceManifest`)
- `src/lib/ai/assistant-response-schema.ts` (Bloco 3 — puro, testável sem banco)
- `e2e/assistant-fase4a.spec.ts` (Bloco 0/1/2/3 — 7 testes)
- `scripts/test-assistant-screen.mjs`, `scripts/test-assistant-response-schema.mjs`

**Alterados**:
- `src/app/api/assistant/route.ts` — parsing defensivo, monta evidência, grava `evidenceManifest`, gatilho de `PENDING_REVIEW`
- `src/lib/ai/operational-assistant-provider.ts` — tipos estendidos, reexporta `assistant-screen.ts`
- `src/lib/ai/providers/local-intent-assistant-provider.ts` — migrado pro schema estruturado
- `src/lib/repositories/ai-generations.ts` — `status` parametrizável
- `src/components/assistant-raiz-widget.tsx` — consome `assistant-screen.ts`, renderiza o novo schema
- `src/app/globals.css` — CSS mínimo pros novos elementos (`facts`/`attention_points`/`missing_information`), sem redesenho
- `docs/RAIZ_2.0_FASE4_ARQUITETURA_ASSISTENTE.md` — as 4 correções do diretor
- `package.json` — 2 scripts de teste novos, incluídos em `test:handoff`

## Validação

```
npm run typecheck                                → sem erros
npm run build                                     → build de produção completo, sem erros
npm run test:handoff                              → todos os cenários aprovados (inclui os 2 scripts novos:
                                                       test:assistant-screen, 11 cenários; e
                                                       test:assistant-response-schema, 5 cenários)
npx playwright test e2e/assistant-fase4a.spec.ts  → 7 passed, 0 failed (isolado)
npx playwright test <assistente + sidebar + Fases 1-3>, --workers=2
                                                   → 35 passed, 1 skipped, 0 failed
                                                     (skip: estado da URL de satélite/parâmetro em mapas
                                                     depende de dado que não estava disponível nesta
                                                     execução -- mesmo skip de sempre, não é falha)
```

## O que NÃO foi feito nesta entrega (reafirmado)

- Nenhuma ação executável nova (`suggested_actions` continua uma tupla vazia em tempo de compilação).
- Nenhum redesenho de painel/UX (o widget continua a mesma bolha flutuante, só consumindo o novo schema).
- Nenhum provedor real conectado (Claude/OpenAI/Gemini) — `resolveOperationalAssistantProvider()` continua
  devolvendo só o local.
- Nenhum RAG.
- Nenhuma prescrição.
- Nenhuma fórmula/regra agronômica alterada.
- Nenhuma migração executada.
- Nenhum merge em `develop`/`main`.

Blocos 4-7 aguardam autorização explícita antes de começar.
