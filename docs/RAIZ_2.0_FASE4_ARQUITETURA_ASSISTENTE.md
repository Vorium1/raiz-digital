# RAIZ 2.0, Fase 4 — Assistente RAIZ como copiloto contextual (arquitetura, sem código)

Branch: `feature/raiz-2.0-fase4`, criada a partir de `develop` já consolidado (commit `f21e1df`, que
contém toda a Fase 3 + o patch de responsividade da sidebar + a correção de timeout de teste). Este
documento é a ÚNICA entrega desta primeira etapa da Fase 4 — **nenhum código funcional foi escrito**,
nenhuma migração foi executada, nenhum provedor de IA generativa foi conectado, nenhum merge foi feito.

Todo o conteúdo abaixo vem de leitura real do repositório nesta sessão (arquivos citados com caminho
exato), não de memória — onde eu não tinha certeza, fui ler o arquivo antes de escrever a frase.

---

## 1. Diagnóstico do Assistente RAIZ atual

### 1.1 O que existe, de verdade, hoje

| Peça | Arquivo | O que faz |
|---|---|---|
| Endpoint | `src/app/api/assistant/route.ts` | Sessão real via `getPlatformSession()`, nunca aceita `tenantId` do corpo da requisição. Aceita `question` (texto livre) e `screenContext` opcional, restrito a `{type: "field"\|"analysis"\|"property"\|"dashboard", id?}`. Resolve o provedor, chama `.ask()`, grava auditoria, devolve o resultado. |
| Interface de provedor | `src/lib/ai/operational-assistant-provider.ts` | `OperationalAssistantProvider` com `.ask(request): Promise<OperationalAssistantResponse>`. `resolveOperationalAssistantProvider()` é o único ponto de troca de provedor — hoje sempre devolve o local. |
| Provedor atual | `src/lib/ai/providers/local-intent-assistant-provider.ts` | **Não é um LLM.** É um casador de intenção por regex contra um repertório fixo de 7 perguntas (coleta atrasada, pontos pendentes, laudos do mês, revisões pendentes, confiabilidade, comparação de safra, resumo de propriedade, pendências gerais). Cada intenção reconhecida consulta o banco de verdade (via `src/lib/repositories/assistant-queries.ts` e outros repositórios) e monta a resposta. Fora do repertório, devolve uma resposta honesta ("não reconheci essa pergunta ainda...") em vez de inventar texto. |
| Widget | `src/components/assistant-raiz-widget.tsx` | Bolha flutuante única (`assistant-fab`), presente em toda a plataforma exceto `/login`/recuperação de senha. `inferScreenContext(pathname)` só reconhece `/analises/[id]` (regex de UUID) e `/dashboard` — **nenhuma outra tela** (talhão, propriedade, mapa, comparativo, relatório, inteligência) tem contexto inferido automaticamente, mesmo o provedor já aceitando `field`/`property` no tipo. As 5 perguntas sugeridas são **fixas**, iguais em qualquer tela. |
| Auditoria | `src/lib/repositories/ai-generations.ts` → `recordOperationalAssistantGeneration` | Grava uma linha em `ai_generations` (`kind = 'OPERATIONAL_ASSISTANT'`) com provider/model/prompt_version/request_payload/response_payload, e também uma linha genérica em `audit_events` via `writeAudit` (`action: 'AI_ASSISTANT_QUERY'`). Grava com `status = 'APPROVED'` direto — não passa por fila de revisão profissional (diferente de narrativa/prescrição, que nascem `PENDING_REVIEW`). |

### 1.2 Capacidades já existentes que a Fase 4 pode reaproveitar sem reescrever

Estas peças já existem, já são usadas em produção conceitual (Fases 1-3) e resolvem exatamente o que o
item 2 do pedido ("Evidência primeiro") exige — uma camada entre o banco e a IA que já faz autenticação +
RBAC + filtro de tenant antes de qualquer dado chegar a um provedor:

- **`src/lib/ai/evidence-package.ts`** (`AgronomicEvidencePackage` + `buildAgronomicEvidencePackage`): monta,
  sempre via `withTenant`, um pacote com tenant/cliente/propriedade/talhão/safra/região/análise/resultados/
  classificações/regra usada/confiança/fontes técnicas/histórico/status de revisão — **mas escopado a UMA
  análise específica**. É o padrão de Evidence Package que o diretor pediu no item 2, só que ainda não
  generalizado para outros tipos de tela.
- **`src/lib/ai/prescription-evidence-package.ts`**: um SEGUNDO evidence package, independente do primeiro,
  mesmo padrão. Confirma que "um builder por caso de uso, montado sempre no servidor" já é a convenção
  estabelecida neste repositório — não seria uma invenção nova, seria seguir o padrão que já existe duas
  vezes.
- **`src/lib/ai/agronomic-explanation-provider.ts`**: interface desacoplada (`.explain()`), com
  `resolveAgronomicExplanationProvider()` como ponto único de troca de provedor — a MESMA forma de
  `OperationalAssistantProvider`/`.ask()`. O tipo de resultado já reserva `tokensUsed`/`costUsd` mesmo sem
  nenhum provedor real conectado ainda.
- **`src/lib/ai/providers/claude-prescription-provider.ts`**: exemplo real (nunca executado contra a API,
  o próprio arquivo avisa isso no topo) de como uma integração real ficaria — `fetch` direto pra
  `api.anthropic.com`, chave só em `process.env.ANTHROPIC_API_KEY` (nunca no navegador), prompt de sistema
  com regra explícita "nunca invente dado/fonte que não recebeu", resposta validada por um validador manual
  (`validateAgronomicPrescription`, função TypeScript comum — não usa nenhuma biblioteca de schema) antes de
  aceitar, erro claro (não conteúdo inventado) se o formato vier errado, tokens de uso capturados.
- **`ai_generations`** (`db/migrations/013_ai_layer_and_crop_catalog.sql`, estendida em `017`/`018`):
  `id`, `tenant_id` (RLS real), `kind` (enum — hoje `AGRONOMIC_NARRATIVE`, `OPERATIONAL_ASSISTANT`,
  `AGRONOMIC_PRESCRIPTION`, `KNOWLEDGE_RESEARCH`, estendido em migrações posteriores via
  `ALTER TYPE ... ADD VALUE IF NOT EXISTS` — um precedente real de migração aditiva e barata, se um dia for
  necessária), `provider`, `model`, `prompt_version`, `request_payload`/`response_payload` (`jsonb`, livres),
  `tokens_used`, `cost_usd`, `status` (`PENDING_REVIEW`/`APPROVED`/`CHANGES_REQUESTED`/`REJECTED`),
  `reviewer_note`/`reviewed_by`/`reviewed_at`, `superseded_by` (cadeia de gerações), `created_by`,
  `created_at`. **Isso já cobre quase tudo que o item 7 (auditoria) pede.**
- **`src/lib/repositories/audit.ts`** (`writeAudit`/`audit_events`): auditoria genérica (ação/tipo de
  entidade/id/metadata), já chamada em paralelo a `ai_generations` pela rota do assistente hoje.
- **`src/lib/repositories/field-overview.ts`** (`getFieldOverview`): dado real consolidado de UM talhão —
  talhão+propriedade+cliente, todas as safras, ordens de coleta com contagem de pontos planejados/coletados,
  análises com status de interpretação, histórico de produtividade, snapshots de NDVI, qualidade de GPS,
  relatórios publicados. Já é, hoje, quase um Evidence Package de talhão pronto — só falta ser chamado desse
  jeito.
- **`src/domain/field-overview-synthesis.ts`** (`computeFieldOverviewSynthesis`): o MELHOR precedente real
  já existente no código de como separar fato observado (`available`), atenção derivada de uma regra
  determinística e documentada (`attention`) e próxima ação de uma cadeia de estados real (`nextAction`) —
  zero frase genérica, zero severidade inventada, zero "provavelmente".
- **`src/domain/parameter-predominance.ts`**: o precedente real (corrigido nesta mesma sessão, na Fase 3) de
  como descrever algo quantitativo sem alegar mais do que os dados sustentam — nunca chama contagem de
  "padrão espacial" sem geografia real. Referência direta para o item 4 do pedido (não inventar
  causalidade).
- **Estado via URL, já testado**: `agronomic-map-explorer.tsx` (`?ordem=&parametro=&status=&satelite=1`),
  `comparison-explorer.tsx` (`?mode=&a=&b=`), `intelligence-queue-filters.tsx`
  (`?clientId=&propertyId=&fieldId=&seasonId=&interpretationState=&reviewState=`), relatório por talhão
  (`?versao=publicada`). Todo o app já usa query params como mecanismo seguro de estado navegável — a peça
  que falta pro item 5 (ações contextuais) não é inventar um mecanismo novo, é reconhecer que ele já existe.
- **`docs/COMPARATIVO_PROVEDORES_IA.md`** (documento já existente, nenhum provedor contratado): compara
  Anthropic/OpenAI/Google por custo/qualidade em português técnico/janela de contexto, tanto pra síntese
  agronômica quanto pro Assistente RAIZ. Conclusão já registrada: **adiar LLM real no assistente até haver
  necessidade concreta de pergunta fora do repertório reconhecido**, e aí usar a opção mais barata (o risco
  ali é baixo — o assistente nunca decide agronomia).

### 1.3 Limitações reais (confirmadas no código, não presumidas)

1. **Contexto de tela incompleto**: `inferScreenContext` só cobre `/dashboard` e `/analises/[id]`. Talhão
   (`/talhoes/[fieldId]`), propriedade, mapa (`/mapas`), comparativo (`/comparativos`), relatório
   (`/relatorios/...`) e inteligência (`/inteligencia`) não têm inferência automática — mesmo o tipo
   `AssistantScreenContext` já aceitando `field`/`property`. O exemplo do diretor ("dentro de um talhão,
   'o que mudou aqui?' não deveria exigir reinformar o talhão") **não funciona hoje** fora de análise e
   dashboard.
2. **Repertório fixo, sem Evidence Package real por trás da maioria das perguntas**: as intenções
   reconhecidas chamam consultas pontuais (`assistant-queries.ts`), não um pacote estruturado fato/
   interpretação/hipótese. Não existe, hoje, nenhuma noção de "hipótese que precisa validação" ou
   "recomendação com base técnica" no assistente — só texto simples + `cards` de navegação.
3. **Sem schema de resposta estruturado**: `OperationalAssistantResponse` é `{ answer: string, cards:
   AssistantCard[], suggestedQuestions, provider, model, isRealLanguageModel, generatedAt }`. Não separa
   fato de interpretação de hipótese — está tudo dentro de uma string livre `answer`.
4. **Sem ações estruturadas**: `cards` só navegam (`href` fixo, montado no servidor pela própria
   intenção reconhecida) — não existe conceito de "ação sugerida que a interface valida antes de aplicar"
   (ex.: aplicar um filtro, trocar camada do mapa). A app já tem o mecanismo (query params) mas o assistente
   não o usa.
5. **Sugestões de pergunta não mudam por tela**: as 5 sugestões em `assistant-raiz-widget.tsx` são
   hardcoded e idênticas em qualquer lugar — o widget não "sabe" que está dentro de um talhão.
6. **Revisão profissional pulada por padrão**: `recordOperationalAssistantGeneration` grava sempre
   `status = 'APPROVED'`. Hoje isso é aceitável (o assistente só organiza dado, nunca decide agronomia), mas
   se o assistente vier a produzir algo que pareça recomendação (ex.: "isso sugere aplicar mais X"), precisa
   nascer `PENDING_REVIEW`, igual a narrativa/prescrição — hoje não há esse gatilho.
7. **Nenhum teste e2e de isolamento de tenant para o assistente**: `docs/PROJECT_STATE.md` (linha ~1127)
   registra que o isolamento foi validado **manualmente**, uma vez, perguntando ao assistente como a empresa
   B. Não existe nenhum arquivo em `e2e/` que sequer mencione "assistant"/"Assistente" — confirmei com busca
   no diretório inteiro. Isso é uma lacuna de regressão automatizada, não um problema de isolamento em si
   (o mecanismo de RLS por trás é o mesmo `withTenant` usado em todo o resto do app, já coberto por outros
   testes).
8. **UX de bolha única**: única superfície de interação é o botão flutuante — sem atalho contextual
   ("Pergunte sobre este talhão"), sem histórico persistente por tela, sem indicação visual de "aqui a IA
   sabe onde você está".

---

## 2. Princípio central (reafirmado, não uma frase de efeito)

O Assistente RAIZ não vira um chat genérico. Ele continua sendo **uma interface de consulta sobre dado que
já existe e que o usuário já tem permissão de ver** — a evolução da Fase 4 é (a) ele passar a saber em que
tela o usuário está sem precisar perguntar, (b) as respostas passarem a separar explicitamente fato de
interpretação de hipótese, e (c) ele poder sugerir uma ação de navegação/filtro que a interface valida antes
de aplicar. Nada disso exige dar ao modelo acesso a banco, execução de SQL ou liberdade de gerar URL.

---

## 3. Arquitetura proposta — visão geral

```
Usuário digita pergunta no widget/painel
        │
        ▼
[1] Contexto de tela (client) ── inferScreenContext(pathname, routeParams) ──► ScreenContext tipado
        │
        ▼
[2] POST /api/assistant { question, screenContext }
        │  (sessão real via getPlatformSession() -- nunca aceita tenantId do corpo)
        ▼
[3] Evidence Package Builder (server, por tipo de ScreenContext)
        │  -- SEMPRE via withTenant(tenantId, userId); reaproveita repositórios já existentes
        │  -- nunca dá ao provider uma conexão de banco, só o objeto já montado
        ▼
[4] OperationalAssistantProvider.ask({ question, evidence, screenContext, role })
        │  -- hoje: intent-matching local (sem LLM)
        │  -- futuro: LLM real, MESMA interface, MESMO tipo de evidence
        ▼
[5] AssistantStructuredResponse (schema validado -- ver seção 6)
        │
        ├──► [6] recordOperationalAssistantGeneration (ai_generations + audit_events)
        │
        └──► [7] Validação de suggested_actions contra allowlist server-side (ver seção 5)
        │
        ▼
[8] Resposta trafega pro client já validada -- widget/painel renderiza
        summary + observations + patterns + hypotheses + attention_points +
        missing_information + ações clicáveis (já resolvidas em URL real)
```

Nenhuma etapa nova dá ao provider acesso direto a dado — [3] é a única porta de entrada de dado real, e ela
já roda inteiramente no servidor, com a MESMA autenticação/RLS que todo o resto do app usa.

---

## 4. Contexto de tela

### 4.1 O que existe

```ts
// src/lib/ai/operational-assistant-provider.ts (hoje)
export type AssistantScreenContext =
  | { type: "field"; id: string }
  | { type: "analysis"; id: string }
  | { type: "property"; id: string }
  | { type: "dashboard" };
```

### 4.2 Extensão proposta

Adicionar os tipos que faltam, cada um com só o identificador necessário pra reconstruir o Evidence Package
correto no servidor (nunca dado sensível no client — o `id` já é o que a URL da própria tela usa):

```ts
export type AssistantScreenContext =
  | { type: "dashboard" }
  | { type: "property"; id: string }
  | { type: "field"; id: string }
  | { type: "analysis"; id: string }
  | { type: "intelligence" }                                   // /inteligencia
  | { type: "map"; collectionOrderId?: string }                 // /mapas
  | { type: "comparison"; mode?: "fields" | "seasons" | "points" | "properties" }  // /comparativos
  | { type: "report-field"; analysisId: string }                // /relatorios/talhao/[analysisId]
  | { type: "report-property"; propertyId: string };            // /relatorios/propriedade/[propertyId]
```

E generalizar `inferScreenContext` (hoje só 2 `if`s) para uma tabela de padrões de rota — cada entrada é
`{ pattern: RegExp, build: (match) => AssistantScreenContext }`, testada em ordem contra `pathname`. Isso é
uma mudança pequena e mecânica, não uma reescrita.

### 4.3 O exemplo do diretor, resolvido

"Dentro de um talhão: 'o que mudou aqui?' não deveria exigir reinformar o talhão." — com o contexto
`{ type: "field", id }` chegando junto da pergunta, o Evidence Package Builder de talhão (seção 5.3) já
inclui `seasons` ordenadas por `createdAt DESC` (via `getFieldOverview`) — comparar a mais recente com a
anterior é literalmente o que `compareLatestTwoSeasons` (`assistant-queries.ts`) já faz, só que hoje só é
chamado quando a pergunta bate no regex `/compar/ + /safra/`. A pergunta livre "o que mudou aqui?" cairia,
no provedor local de hoje, no fallback genérico — é exatamente o tipo de pergunta que justificaria, no
futuro, um LLM real recebendo o Evidence Package do talhão e respondendo com liberdade de linguagem, mas
sem inventar nenhum dado que não esteja ali.

---

## 5. Evidence Package — crítica ao padrão existente, depois proposta

**O padrão já é bom.** `buildAgronomicEvidencePackage` prova, na prática, que "montar um objeto só com dado
real, sempre atrás de RBAC/tenant, nunca abrir o banco pro provider" já funciona neste código há pelo menos
duas fases. Não faz sentido inventar um mecanismo novo — faz sentido generalizar o que já existe.

**O que não generaliza direto**: os dois builders atuais (`evidence-package.ts`,
`prescription-evidence-package.ts`) são escopados a **uma análise**. O assistente precisa responder sobre
telas que não têm uma análise única (dashboard, propriedade inteira, comparativo). A solução não é um
Evidence Package universal gigante (que ficaria careço em cada contexto e caro de montar sempre) — é **um
builder por tipo de `ScreenContext`**, seguindo a mesma convenção, cada um devolvendo só o que aquela tela
realmente tem.

### 5.1 Proposta: um tipo de evidence por contexto de tela, reaproveitando repositórios existentes

| `ScreenContext.type` | Builder proposto | Repositórios já existentes que ele compõe |
|---|---|---|
| `dashboard` | `buildDashboardEvidencePackage` | `getExecutiveDashboard`, `getPortfolioFieldSummaries`, `listOperationalAlerts` |
| `property` | `buildPropertyEvidencePackage` | `getPropertyExecutiveReportData` |
| `field` | `buildFieldEvidencePackage` | `getFieldOverview` (já quase pronto — ver 5.2) |
| `analysis` | **já existe** | `buildAgronomicEvidencePackage` (reaproveitar sem mudar) |
| `comparison` | `buildComparisonEvidencePackage` | `compareFields`/`compareSeasons`/`comparePoints`/`compareProperties`, conforme `mode` |
| `report-field` | `buildReportEvidencePackage` | `getFieldAnalysisReportData`, `getPublishedReportSnapshot` |
| `intelligence` | `buildIntelligenceEvidencePackage` | `getIntelligenceQueue` |
| `map` | reaproveita `field`/`dashboard` conforme o que está selecionado | `getFieldMapLayer` só quando a pergunta pede algo específico de um talhão já selecionado no mapa |

Nenhum desses builders precisa de tabela nova nem coluna nova — são leituras compostas, exatamente como
`getFieldOverview` já faz hoje pra montar o Talhão 360°.

### 5.2 Exemplo concreto: por que `getFieldOverview` quase já é o Evidence Package de talhão

`src/lib/repositories/field-overview.ts` devolve `{ field, seasons, orders, analyses, yieldHistory,
ndviSnapshots, gpsQuality, reports }` — já é dado real, já é `withTenant`, já tem histórico. Faltaria só
compor com a interpretação estruturada da análise mais recente de cada safra (reaproveitando
`buildAgronomicEvidencePackage` para a análise ativa) e, quando a pergunta pedir, o resultado de
`computeParameterPredominance` (Fase 3) para descrever predominância sem alegar padrão espacial.

### 5.3 Regra que atravessa todos os builders

Nenhum builder pode devolver um campo "inferido" — cada campo é dado persistido ou `null`/lista vazia. A
interpretação (fato → classificação → predominância → hipótese) acontece DEPOIS, na camada de resposta
(seção 6), nunca dentro do builder.

---

## 6. Diferenciar fato, interpretação, padrão e hipótese — schema de resposta

### 6.1 Crítica à lista sugerida pelo diretor, antes de aceitar

A lista proposta (`summary`, `observations`, `deterministic_findings`, `patterns`, `hypotheses`,
`attention_points`, `missing_information`, `technical_references`, `suggested_actions`,
`requires_professional_review`) é tecnicamente sólida, mas tem sobreposição real com o que já existe:

- `observations` e `deterministic_findings` se sobrepõem — no código real (`field-overview-synthesis.ts`),
  a distinção que já funciona é mais simples: **fato contado/observado** (`available`) vs. **fato que
  dispara atenção por regra documentada** (`attention`). Proponho fundir `observations` +
  `deterministic_findings` em um único `facts` (fato bruto observado — valor, contagem, data, status) e
  deixar `attention_points` como a camada de "fato + regra determinística = isso merece atenção" (mesma
  função que `attention` já cumpre hoje).
- `patterns` deve ser especificamente o resultado de `computeParameterPredominance` (ou equivalente) — nunca
  texto livre do LLM. Isso não é um campo que o modelo preenche; é um campo que o **código determinístico**
  preenche e o modelo só narra. Essa distinção precisa ficar explícita no tipo, não só na instrução do
  prompt: `patterns` é montado pelo Evidence Package Builder, não pela resposta do provider.
- `hypotheses` é o único lugar onde o modelo tem liberdade real de interpretação — e precisa vir sempre
  acompanhado de qual evidência sustenta e qual evidência falta pra confirmar (replicando a disciplina que
  `claude-prescription-provider.ts` já aplica em `missingInformation`).
- `technical_references` só faz sentido quando `hypotheses`/`suggested_actions` citam algo que veio de
  `technical_sources` (mesma tabela já usada pela prescrição) — não deve ser um campo hardcoded.
- `requires_professional_review`: proponho que **não seja uma escolha do modelo**, e sim uma regra
  determinística do lado do código (ex.: `hypotheses.length > 0` ou `suggested_actions` inclui algo que
  parece recomendação → `true` automaticamente) — nunca confiar no LLM pra se autoavaliar como "isso precisa
  revisão".

### 6.2 Schema proposto (revisado)

```ts
type AssistantStructuredResponse = {
  summary: string;                       // 1-2 frases, nunca conclusão nova além do que está abaixo
  facts: Array<{ label: string; value: string; source: "database" }>;           // observado/contado, sempre rastreável
  attention_points: Array<{ label: string; reason: string }>;                    // fato + regra documentada
  patterns: Array<{ description: string; ruleRef: "parameter-predominance-v1" }> | null; // só se o builder calculou algo
  hypotheses: Array<{ statement: string; supportingEvidence: string[]; missingToConfirm: string[] }>;
  missing_information: string[];
  technical_references: Array<{ title: string; institution: string | null }>;
  suggested_actions: AssistantAction[];   // ver seção 7 -- nunca URL livre
  requires_professional_review: boolean;  // calculado pelo código, nunca pelo modelo
};
```

`cards` (o tipo atual, `{title, description, href}`) não desaparece — vira o formato de RENDERIZAÇÃO de
`suggested_actions` já resolvidas em URL real, não um campo paralelo.

---

## 7. Ações contextuais — schema de ações

### 7.1 O mecanismo já existe: query params validados

A app inteira já usa query params como estado navegável seguro (seção 1.2). A ação estruturada do
assistente **não gera URL** — gera uma intenção tipada, e o SERVIDOR (nunca o client, nunca o modelo) resolve
essa intenção contra um allowlist de rota+parâmetros válidos para aquele tipo de tela, exatamente como cada
página já faz ao ler `searchParams.get(...)`.

```ts
type AssistantAction =
  | { kind: "show_on_map"; fieldId: string; parameter?: string; satellite?: boolean }
  | { kind: "compare_seasons"; fieldId: string }
  | { kind: "filter_critical"; scope: "queue" | "dashboard" }
  | { kind: "open_report"; analysisId: string }
  | { kind: "open_comparison"; mode: "fields" | "seasons"; a: string; b?: string };
```

### 7.2 Regra de validação (nunca opcional)

1. O provider (LLM ou local) só pode devolver um `AssistantAction` cujo `kind` esteja num allowlist FIXO
   no servidor (union type fechado, sem `string` livre em nenhum campo).
2. Antes de virar link, o servidor confirma que os IDs referenciados (`fieldId`, `analysisId`, etc.) existem
   E pertencem ao tenant da sessão (mesma consulta que a página de destino já faria) — nunca confia no ID
   que o modelo "lembrou" do Evidence Package sem reconferir.
3. A resolução final é sempre uma chamada a uma função pura tipo `resolveMapUrl(action)` →
   `"/mapas?ordem=...&parametro=...&satelite=1"`, nunca `` `/mapas?${action.raw}` `` nem concatenação livre.
4. Nenhuma ação **executa** nada sozinha — toda `suggested_action` vira um link/botão que o usuário clica;
   a navegação em si já passa pelas verificações de RBAC/tenant normais da página de destino (segunda
   camada de proteção, redundante de propósito).

---

## 8. Segurança

| Risco | Mitigação já existente | O que falta |
|---|---|---|
| Vazamento entre tenants | `withTenant` em toda consulta; RLS `FORCE ROW LEVEL SECURITY` no banco | Nada de arquitetura nova — só garantir que TODO builder novo usa `withTenant`, sem exceção |
| RBAC | `session.role` já chega no `OperationalAssistantRequest`; padrão `_ROLES = new Set([...])` já usado página a página | Ações sugeridas (seção 7) precisam checar `role` do mesmo jeito que a página de destino checaria, antes de sugerir uma ação que o usuário não pode executar |
| Prompt injection via dado do próprio tenant | Nenhuma hoje (não há LLM real ainda) | Quando houver LLM real: texto livre dentro do Evidence Package (ex.: nome de cliente, observação de laudo) precisa ser tratado como DADO dentro do prompt, nunca como instrução — mesma disciplina que `claude-prescription-provider.ts` já aplica ao tratar `technicalSources` como conteúdo, nunca como comando |
| Chave de API no browser | Já é regra do projeto (`CLAUDE.md`) e já é como `claude-prescription-provider.ts` funciona (`process.env` só no servidor) | Nada novo |
| Ações arbitrárias | Sem mecanismo de execução hoje | Seção 7 — allowlist fechado + revalidação server-side |
| Resposta não fundamentada | Provider local hoje só responde com dado real ou recusa | `requires_professional_review` calculado por código (seção 6.1); nunca apresentar `hypotheses` como `facts` |
| Isolamento de tenant do endpoint | RLS + sessão real | **Falta teste e2e automatizado** (achado real, seção 1.3, item 7) — deveria ser o primeiro item de um bloco de implementação, antes de qualquer coisa nova |
| Limites de contexto | Evidence packages hoje são pequenos (uma análise) | Builders por tela (seção 5) precisam ter um teto explícito de tamanho (ex.: histórico limitado a N registros, como `evidence-package.ts` já limita a 5) |

---

## 9. Auditoria

### 9.1 O que já existe e cobre o pedido

`ai_generations` (seção 1.2) já tem: usuário (`created_by`), tenant (`tenant_id`, RLS), provider, model,
prompt_version, request_payload/response_payload (jsonb — cabe qualquer coisa), tokens_used, cost_usd,
status de revisão profissional (`reviewer_note`/`reviewed_by`/`reviewed_at`), horário (`created_at`),
cadeia de gerações (`superseded_by`). `audit_events` já registra a ação em paralelo.

### 9.2 O que realmente falta (nenhum item exige migração)

- **Contexto de tela**: já cabe dentro de `request_payload` (é `jsonb` livre) — só passar
  `screenContext` no objeto gravado por `recordOperationalAssistantGeneration` (hoje só grava
  `{question, screenContext}` — já grava, só não é usado pra nada ainda).
- **Referência ao Evidence Package usado**: proponho gravar um hash (`sha256` do JSON do evidence package,
  mesmo padrão já usado em `reports.sha256` pro snapshot de relatório publicado) dentro de
  `request_payload.evidenceHash`, e opcionalmente o pacote inteiro dentro do mesmo jsonb quando pequeno —
  sem coluna nova.
- **Ações sugeridas**: cabem dentro de `response_payload.suggestedActions` — já é jsonb livre.
- **Regras técnicas utilizadas**: quando `patterns`/`hypotheses` citam uma regra (ex.:
  `parameter-predominance-v1`) ou uma fonte técnica, isso já cabe no mesmo jsonb.
- **Gatilho de revisão profissional**: hoje `recordOperationalAssistantGeneration` grava sempre
  `status = 'APPROVED'`. Proponho que, quando `requires_professional_review === true` (seção 6.1), a
  inserção use `status = 'PENDING_REVIEW'` em vez de `'APPROVED'` — a COLUNA já aceita esse valor hoje
  (é o mesmo enum `ai_review_status` usado por narrativa/prescrição), é só uma mudança de qual valor a
  função passa, não uma migração.

**Conclusão**: nenhuma migração é necessária para a Fase 4 chegar num estado auditável completo. Se um dia
for necessário um `kind` novo (ex.: separar consultas do assistente por origem), o precedente de
`ALTER TYPE ... ADD VALUE IF NOT EXISTS` (migrações 017/018) já mostra que isso é aditivo e barato — mas
não há necessidade concreta disso agora.

---

## 10. Estratégia de provider

Ver `docs/COMPARATIVO_PROVEDORES_IA.md` para a comparação completa de custo/qualidade — não duplico aqui.
Resumo da conclusão já registrada lá: **para o Assistente RAIZ especificamente, adiar a contratação de um
LLM real até existir necessidade concreta de responder pergunta fora do repertório reconhecido**, e nesse
momento usar a opção mais barata (GPT mini/Gemini Flash) — o risco ali é baixo porque o assistente nunca
decide agronomia.

### 10.1 Menor evolução possível (não trocar o padrão, só generalizar o tipo)

`OperationalAssistantProvider`/`resolveOperationalAssistantProvider()` continuam exatamente como estão
estruturalmente. A única mudança de contrato é o `request`/`response` aceitarem o Evidence Package
tipado e o schema estruturado da seção 6, em vez do texto solto atual:

```ts
// hoje
ask(request: OperationalAssistantRequest): Promise<OperationalAssistantResponse>

// proposto -- mesma forma, payload mais rico
ask(request: OperationalAssistantRequest & { evidence: ScreenEvidencePackage }): Promise<AssistantStructuredResponse>
```

Quando (e se) um provedor real for autorizado, ele é **um novo arquivo** em `src/lib/ai/providers/`,
implementando a mesma interface — nenhuma tela, nenhuma rota, nenhum fluxo de auditoria muda, exatamente
como já aconteceu (documentado) para narrativa/prescrição.

---

## 11. UX proposta

### 11.1 Crítica ao estado atual

A bolha flutuante sozinha é adequada como ATALHO GLOBAL (perguntar de qualquer lugar), mas falha como
ÚNICA interface para o caso de uso "usuário já está numa tela específica, quer entender aquele dado" — o
usuário precisa notar a bolha, abrir, e não tem nenhum sinal visual de que a RAIZ "sabe" onde ele está
(as sugestões são as mesmas em qualquer lugar).

### 11.2 Proposta (evolutiva, não substitui o widget)

- **Mantém a bolha flutuante** como atalho global — não é descartada, ganha o contexto de tela completo
  (seção 4) e sugestões que mudam por tela.
- **Botão contextual por tela** (ex.: "Pergunte sobre este talhão" dentro de `/talhoes/[fieldId]`,
  "Pergunte sobre esta análise" em `/analises/[id]`) abrindo o MESMO painel, já com o contexto certo e uma
  pergunta inicial sugerida específica daquela tela (ex.: dentro de talhão: "O que mudou aqui?", "Existe
  pendência neste talhão?"; dentro de comparativo: "Existe coincidência entre os dois lados?").
- **Evidências clicáveis**: cada item de `facts`/`attention_points` na resposta, quando tiver origem
  rastreável (ex.: um resultado laboratorial específico), vira um link pro dado de origem — mesma disciplina
  de rastreabilidade já exigida em `CLAUDE.md`.
- **Ações que levam direto pro destino real** (seção 7) — nunca só texto dizendo "veja no mapa", sempre um
  botão que já abre `/mapas` com o talhão/parâmetro certos.
- **Estados de carregamento reais**: já existe parcialmente (`"Consultando dados reais…"`) — manter, e
  diferenciar visualmente "buscando evidência" de "aguardando modelo" quando houver LLM real (podem ter
  latências bem diferentes).
- **Indicação explícita de dado insuficiente**: quando `missing_information` não estiver vazio, mostrar
  isso na resposta com o mesmo peso visual do resto — nunca escondido num rodapé pequeno.
- **Histórico contextual**: o histórico de conversa (`ChatEntry[]`) já existe no widget, mas reinicia a cada
  troca de tela hoje (estado local do componente). Manter por sessão (não por tela) é suficiente — não
  proponho persistência em banco nesta fase (aumentaria escopo sem necessidade concreta ainda).

---

## 12. Fluxo completo de uma pergunta (exemplo concreto)

Usuário está em `/talhoes/<uuid>` (Talhão 360°) e abre o painel contextual, pergunta: **"O que mudou desde
a última safra?"**

1. Widget já sabe `screenContext = { type: "field", id: "<uuid>" }` (via `inferScreenContext` estendido).
2. `POST /api/assistant` com `{question, screenContext}`.
3. Sessão real resolvida (`tenantId`, `userId`, `role`).
4. `buildFieldEvidencePackage(tenantId, userId, fieldId)` chama `getFieldOverview` (dado já existente:
   `seasons` ordenadas por `createdAt DESC`) + `compareLatestTwoSeasons` (já existe em
   `assistant-queries.ts`) — nada novo consultado no banco além do que já é consultado hoje pra montar a
   própria tela Talhão 360°.
5. Provider (hoje: local-intent; futuro: LLM) recebe `{question, evidence, screenContext, role}`.
6. Resposta estruturada: `facts` (ex.: "Safra 2026/27: Soja, meta 65 sc/ha" vs "Safra 2025/26: Trigo, meta
   55 sc/ha"), `attention_points` (ex.: "3 pontos com P classificado como baixo na safra atual, contra 1 na
   anterior" — se `parameter-predominance` calculou isso), `suggested_actions` (`{kind: "compare_seasons",
   fieldId}` → resolvido em `/comparativos?mode=seasons&a=<seasonIdAtual>&b=<seasonIdAnterior>`).
7. `recordOperationalAssistantGeneration` grava tudo (`request_payload` com `screenContext` +
   `evidenceHash`; `response_payload` com a resposta estruturada completa).
8. Client renderiza: resumo, fatos lado a lado, ponto de atenção, botão "Ver comparativo completo" já
   apontando pro comparativo certo.

Nenhuma etapa deu ao provider acesso a SQL; nenhuma etapa gerou uma URL fora do allowlist.

---

## 13. Outros exemplos do diretor, resolvidos com dado real

| Pergunta | Evidence Package usado | Campo(s) da resposta |
|---|---|---|
| "Por que este talhão está em atenção?" | `field` — reaproveita a MESMA lógica de `computeFieldOverviewSynthesis` (já real, já determinística) | `attention_points` = exatamente o array `attention` que a tela já calcula |
| "Quais são os três principais problemas desta propriedade?" | `property` — `getPropertyExecutiveReportData` já devolve `attentionFields` | `attention_points` ordenado, cortado em 3 |
| "Mostre apenas os pontos críticos." | contexto atual (`field`/`map`) | `suggested_actions: [{kind:"filter_critical", scope:"queue"}]` → resolve pro filtro real já existente na fila/mapa |
| "Compare esta análise com a anterior." | `analysis` — `assistant-queries.compareLatestTwoSeasons` ou histórico de `evidence-package.ts` (`history`) | `facts` com os dois lados + `suggested_actions: [{kind:"compare_seasons"}]` |
| "Existe coincidência entre baixo vigor e os pontos de baixa fertilidade?" | `field` — cruza `ndviSnapshots` (zona) com `computeParameterPredominance` dos resultados de P/K | `patterns` (nunca `facts`) — ex.: "A região de menor vigor coincide com 4 de 5 pontos classificados como baixos para P" — **nunca** "o baixo P causou o baixo NDVI" (isso seria `hypotheses`, se algum dia justificável, nunca `facts`/`patterns`) |
| "Quais evidências sustentam essa conclusão?" | reaproveita o MESMO evidence package já usado na resposta anterior (por isso o hash em auditoria importa) | lista `facts`/`patterns` já citados, nunca inventa novos |
| "Prepare um resumo para o produtor." | `analysis`/`field` | reaproveita a MESMA lógica do relatório "Resumo ao produtor" já existente (`/relatorios/produtor/[analysisId]`), nunca um texto novo e paralelo |

---

## 14. Plano de implementação em blocos (para quando houver autorização de código)

1. **Bloco 0 — rede de segurança primeiro**: teste e2e de isolamento de tenant para `/api/assistant` (a
   lacuna real do item 1.3.7), antes de qualquer funcionalidade nova.
2. **Bloco 1 — contexto de tela**: estender `AssistantScreenContext` e `inferScreenContext` (seção 4).
   Nenhuma mudança de schema de resposta ainda — só o assistente passa a saber onde o usuário está.
3. **Bloco 2 — Evidence Package Builders por tela**: um builder por tipo (seção 5), reaproveitando
   repositórios existentes. Nenhuma tabela nova.
4. **Bloco 3 — schema de resposta estruturado**: migrar `local-intent-assistant-provider.ts` pra devolver o
   novo formato (seção 6) mantendo as MESMAS intenções reconhecidas hoje — sem LLM ainda, só reestruturando
   a saída.
5. **Bloco 4 — ações estruturadas**: schema fechado (seção 7) + resolução server-side + allowlist por
   `ScreenContext`.
6. **Bloco 5 — UX contextual**: botão "Pergunte sobre..." por tela, sugestões dinâmicas, evidências
   clicáveis (seção 11) — consumindo o schema do Bloco 3/4.
7. **Bloco 6 — auditoria completa**: gravar `evidenceHash`/`suggestedActions`/gatilho de
   `PENDING_REVIEW` (seção 9.2) — sem migração.
8. **Bloco 7 (fora desta fase, sob autorização explícita)**: conectar um provedor real, seguindo
   `docs/COMPARATIVO_PROVEDORES_IA.md`, implementando a mesma interface — só depois de Blocos 0-6 provados
   com o provedor local.

Cada bloco é entregável e testável isoladamente — nenhum depende de LLM real para funcionar.

---

## 15. Riscos

- **Escopo do Evidence Package crescer demais** (histórico ilimitado, todas as safras, todos os pontos) —
  mitigar com teto explícito por builder, como `evidence-package.ts` já faz (`LIMIT 5`).
  Fica mais crítico quando houver LLM real (custo por token).
- **`suggested_actions` virar uma superfície de bug de navegação** se o allowlist não for exaustivo — cada
  novo tipo de ação precisa de teste e2e provando que IDs de outro tenant são rejeitados na resolução.
  server-side, não só no client.
- **Confundir `patterns`/`hypotheses` com `facts` na renderização** — risco de UX, não só de dado: a
  interface precisa diferenciar visualmente essas categorias sempre, não só a estrutura de dados ter os
  campos certos.
- **Pressão pra "só ligar um LLM logo"** — `docs/COMPARATIVO_PROVEDORES_IA.md` já documenta que isso é
  adiável; ligar cedo demais custa dinheiro sem necessidade comprovada (o repertório determinístico ainda
  cobre a maior parte das perguntas reais).
- **Revisão profissional viesada por confiar no LLM se autoavaliar** — por isso `requires_professional_review`
  precisa ser regra de código, nunca campo que o modelo preenche livremente (seção 6.1).

---

## 16. O que NÃO construir nesta fase (reafirmado)

Replicando exatamente o limite dado pelo diretor, sem ambiguidade:

- Chat LLM em produção.
- Prescrição autônoma / recomendação de fertilizante não homologada.
- Hipótese automática apresentada como verdade (fato).
- Acesso direto do modelo ao banco.
- Execução arbitrária de SQL.
- Ações arbitrárias (fora do allowlist fechado da seção 7).
- RAG improvisado (a Biblioteca Técnica já tem campo reservado pra busca semântica futura, sem
  implementação — não é desta fase).
- Migration.
- Alteração de regra/fórmula agronômica.
- Merge em `main`.

---

## 17. Estado desta entrega

Nenhum código funcional foi alterado. Nenhuma migração foi executada. Nenhum provedor de IA generativa foi
conectado. Este documento é o único artefato desta etapa, na branch `feature/raiz-2.0-fase4`, sem merge.

Peço revisão do diretor antes de qualquer bloco da seção 14 começar a ser implementado.
