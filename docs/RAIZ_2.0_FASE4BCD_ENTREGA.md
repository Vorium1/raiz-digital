# RAIZ 2.0, Fase 4 — Assistente RAIZ: Blocos 4, 5 e 6 (implementação)

Branch: `feature/raiz-2.0-fase4`, sem merge em `develop`/`main`, sem migração executada, sem provedor de IA
generativa conectado. Continuação de `docs/RAIZ_2.0_FASE4A_ENTREGA.md` (Blocos 0-3, aprovados no commit
`429d9b1`) — esta entrega implementa **os Blocos 4, 5 e 6**, mais 2 pré-ajustes de segurança encontrados e
corrigidos antes de começar, exatamente como autorizado. **Bloco 7 (provedor de IA generativa real) não foi
tocado.**

## Resumo objetivo

- **Pré-ajuste 1**: `EvidenceManifest.screenContext` deixou de usar `screenContext ?? {type:"dashboard"}` —
  um contexto explicitamente inválido nunca mais é auditado como se tivesse acontecido no Dashboard.
- **Pré-ajuste 2**: os 4 filtros de `ScreenState` de Inteligência (`clientId`/`propertyId`/`fieldId`/
  `seasonId`) passaram a ser validados como formato de UUID **antes** de qualquer consulta — um valor
  malformado nunca chega no `::uuid` do PostgreSQL e nunca amplia a consulta além do que o usuário pediu.
- **Bloco 4**: schema fechado de ações (`AssistantAction`), validado em duas camadas (formato/allowlist
  puro + posse/tenant/role no banco), nunca um `href` vindo do provider.
- **Bloco 5**: painel contextual real — cabeçalho que diz onde a RAIZ está operando, perguntas sugeridas
  por tela, resposta visualmente estruturada, pontos de entrada contextuais em 5 telas, reação visível a
  troca de contexto, layout mobile em drawer de altura cheia.
- **Bloco 6**: auditoria completa em `ai_generations` (ações sugeridas E resolvidas, separadamente),
  documentação corrigida de `evidenceHash`/`factsSnapshot`, migração progressiva dos cards legados.
- Um bug real de CSS foi encontrado e corrigido durante a verificação visual: o mapa (Leaflet) renderizava
  por cima do painel do Assistente em `/mapas` — ver seção "Bugs encontrados e corrigidos".

## Pré-ajuste 1 — `EvidenceManifest` nunca finge que um contexto inválido é o Dashboard

**Achado do diretor**: `buildEvidenceManifest` recebia `screenContext ?? {type:"dashboard"}` em
`route.ts` — como um contexto explicitamente inválido faz a variável local `screenContext` virar
`undefined` (a resposta já era corretamente fail-closed, ver Fase 4A), o manifesto de auditoria registrava
a tentativa como se tivesse acontecido no Dashboard, mesmo não sendo verdade.

- **`src/lib/ai/assistant-evidence-manifest.ts`**: `EvidenceManifest.screenContext` agora é
  `AssistantScreenContext | { type: "invalid" }`, sem migração (continua dentro do mesmo `jsonb`).
- **`src/app/api/assistant/route.ts`**: passa `{ type: "invalid" }` explicitamente quando
  `parseAssistantScreenContext` devolveu `INVALID_SCREEN_CONTEXT` — nunca deixa o valor "cair" pra
  dashboard por ausência de outra coisa pra colocar ali.

**Testes**: cobertos pelos testes e2e já existentes de contexto inválido (`assistant-fase4a.spec.ts`), que
inspecionam `ai_generations.request_payload.evidenceManifest.screenContext` real — nenhum deles nunca é
`{type:"dashboard"}` pra um contexto que era inválido.

## Pré-ajuste 2 — filtro de Inteligência inválido nunca chega no banco, nunca amplia a consulta

**Achado do diretor**: `clientId`/`propertyId`/`fieldId`/`seasonId` de `ScreenState` viajavam como string
livre até `getIntelligenceQueue`, que faz `::uuid` no PostgreSQL — um valor malformado lançava erro de cast
direto do banco. Preferência explícita do diretor: *"um filtro explicitamente informado porém inválido
resulta em estado de contexto/filtro indisponível, não em uma consulta mais ampla do que o usuário
pretendia."*

- **`src/lib/ai/assistant-screen.ts`**: novo `UUID_EXACT` exportado + `buildIntelligenceState` (usado por
  `inferScreenState` E `parseAssistantScreenState`, uma única implementação): se pelo menos um dos 4 ids
  veio preenchido mas fora do formato de UUID, marca `invalidFilter: true` e **zera os 4** (nunca alguns
  preenchidos e outros não — evitaria filtrar por um subconjunto diferente do que o usuário pediu).
- **`src/lib/ai/assistant-evidence.ts`**: `IntelligenceEvidence` virou uma união discriminada
  (`{ready:true, items, totalCount}` | `{ready:false}`); `buildIntelligenceEvidence` verifica
  `screenState.invalidFilter` **antes** de chamar `getIntelligenceQueue` — o banco nunca vê o valor
  malformado.
- **`local-intent-assistant-provider.ts`**: quando `ready:false`, responde honestamente "o filtro atual da
  fila de Inteligência não pôde ser aplicado", nunca a fila inteira sem filtro.

**Testes**: `scripts/test-assistant-screen.mjs` ganhou 5 cenários novos (23 no total) — um id malformado
zera os 4, todos malformados, `interpretationState`/`reviewState` não afetados (não são UUID), ausência ≠
malformação, e a regra do client (`inferScreenState`) bate exatamente com a do servidor
(`parseAssistantScreenState`).

## Bloco 4 — Ações Contextuais Seguras

Regra central, aplicada à risca: **o provider sugere uma intenção tipada; o servidor valida; a interface
só renderiza a ação já resolvida.** Em nenhum ponto do código existe um caminho onde um `href` chega ao
navegador sem passar por `resolveActionHref` com uma `AssistantAction` já validada em duas camadas.

### Auditoria das rotas reais antes de aceitar a union proposta

O diretor pediu explicitamente para não aceitar a union sugerida sem auditar as rotas primeiro. 3 ajustes
reais, documentados em comentário no próprio `assistant-actions-schema.ts`:

1. **`show_on_map` usa `collectionOrderId`, não `fieldId`** — `/mapas` só seleciona por `?ordem=` (um id de
   `collection_orders`), nunca por `fieldId`; um talhão pode ter várias ordens (safras diferentes), então
   não existe "a" ordem de um talhão sem ambiguidade — quem sugere a ação já precisa saber qual ordem.
2. **`compare_seasons` foi fundido em `open_comparison({mode:"seasons"})`** — a rota de destino
   (`/comparativos?mode=&a=&b=`) é estruturalmente idêntica, só com nomes de campo diferentes
   (`seasonA`/`seasonB` vs `a`/`b`); nenhuma capacidade perdida.
3. **`open_report` com `reportType:"field"` usa `id` = ID DA ANÁLISE**, não do talhão — mesma convenção já
   usada em `AssistantScreenContext` (`report-field`), rota real `/relatorios/talhao/[analysisId]`.

Schema final (`src/lib/ai/assistant-actions-schema.ts`):

```ts
type AssistantAction =
  | { kind: "show_on_map"; collectionOrderId: string; parameter?: string; status?: "all"|"collected"|"pending"; satellite?: boolean }
  | { kind: "open_comparison"; mode: "fields"|"seasons"|"points"|"properties"; a: string; b: string }
  | { kind: "open_analysis"; analysisId: string }
  | { kind: "open_field"; fieldId: string }
  | { kind: "open_report"; reportType: "field"|"property"; id: string }
  | { kind: "filter_intelligence"; interpretationState?: string; reviewState?: string; clientId?: string; propertyId?: string; fieldId?: string; seasonId?: string };

type ResolvedAssistantAction = { kind: AssistantAction["kind"]; label: string; description: string; href: string };
```

### Duas camadas de validação, dois arquivos

1. **`assistant-actions-schema.ts`** (puro, sem banco) — `parseAssistantAction(raw)`: `kind` via allowlist
   fechada (`switch`, `default` devolve `null`), enums (`status`/`mode`/`reportType`/`interpretationState`/
   `reviewState`) contra `Set`s fixos, todo id no formato exato de UUID (regex RFC 4122 v1-5, duplicada
   localmente — ver nota técnica abaixo), `parameter` contra um regex de código de parâmetro
   (`/^[A-Za-z0-9_.-]{1,40}$/`, nunca texto livre longo). Qualquer falha → `null`, nunca uma ação
   parcialmente aceita. `resolveActionHref(action)` constrói `label`/`description`/`href` **só** a partir de
   uma `AssistantAction` já validada, sempre via `URLSearchParams` (nunca concatenação de string com valor
   externo).
2. **`assistant-actions.ts`** (impuro, banco) — `validateAssistantAction(session, raw)`:
   `parseAssistantAction` → `isRoleAllowed` (role real da plataforma; `ROLE_RESTRICTIONS` existe e roda de
   verdade a cada chamada, hoje vazio porque nenhuma das 6 ações aponta pra uma rota role-restrita — ver
   nota abaixo) → `verifyOwnership` (reconsulta `WHERE tenant_id = $1::uuid AND id = $2::uuid` pra cada
   entidade referenciada, nunca confia que "estava no Evidence Package") → só então `resolveActionHref`.
   Qualquer falha em qualquer etapa → `null`, nunca um fallback permissivo.

`/api/assistant/route.ts` chama `validateAssistantActions(session, result.suggested_actions)` e só manda ao
client o array já resolvido (`ClientAssistantResponse.suggested_actions: ResolvedAssistantAction[]`) — o
tipo `AssistantAction[]` cru do provider **nunca** sai do servidor.

### Sobre a cobertura de "ação cross-tenant"

Auditoria honesta, documentada em comentário no próprio teste: hoje não existe nenhum caminho legítimo
(sem LLM conectado) pelo qual o provedor local sugira uma ação referenciando uma entidade de outro tenant —
todo `AssistantAction` que ele monta usa um id que já veio de um Evidence Package tenant-escopado (Bloco 2)
ou não é anexado. A cobertura de teste reflete isso em 3 camadas, não uma só:
(a) `scripts/test-assistant-actions-schema.mjs` prova exaustivamente que a PRIMEIRA linha de defesa
(formato/allowlist) é hermética; (b) `verifyOwnership` reusa o MESMO padrão `WHERE tenant_id = $1::uuid`
já provado seguro em dezenas de outros testes de isolamento desta base (não é um mecanismo novo e
não-testado); (c) um teste e2e estrutural prova que o provider nunca emite uma ação quando o Evidence
Package subjacente não resolveu (`assistant-fase4a.spec.ts`, cross-tenant compare-safra →
`suggested_actions` sempre `[]`).

### Nota técnica: por que o regex de UUID está duplicado em `assistant-actions-schema.ts`

`node --experimental-strip-types` (usado pelos scripts de teste puro desta base) não resolve import de
VALOR via alias `@/...` — só `import type` (erased em tempo de execução). Confirmado empiricamente com um
repro isolado nesta rodada. Como `assistant-actions-schema.ts` precisa do REGEX EM SI (não só do tipo),
duplicar a constante localmente (com comentário explicando o motivo) foi a opção mais simples — trocar o
import de `@/lib/db` por um caminho relativo só pra viabilizar teste, ou escrever um loader ESM customizado,
foram consideradas e descartadas por desviarem da convenção `@/` do resto da base sem necessidade real.

**Testes**:
- `scripts/test-assistant-actions-schema.mjs` (`npm run test:assistant-actions-schema`), 8 cenários —
  allowlist fechada por kind, todo id/enum malformado rejeitado, `href` sempre via `URLSearchParams`.
- `e2e/assistant-actions.spec.ts`, 7 testes: comparar safras de um talhão real resolve `href` EXATO;
  resumo de propriedade resolve `href` EXATO pro relatório; dentro de uma análise real, `open_field`
  sempre presente com `href` EXATO; contexto inválido nunca sugere ação nenhuma; FIELD_TECH recebe ações
  normalmente (RBAC roda sem quebrar pra uma role real); filtro ativo na fila de Inteligência sugere
  `filter_intelligence` refletindo o MESMO filtro; sem filtro nenhum, não sugere `filter_intelligence`
  (ação sem propósito real nunca é oferecida).
- `e2e/assistant-fase4a.spec.ts`: 1 assertion adicionada ao teste de cross-tenant existente
  (`suggested_actions` sempre `[]`).

## Bloco 5 — UX Contextual do Assistente

Objetivo do diretor, verbatim: *"O Assistente RAIZ não pode continuar parecendo apenas uma bolha de chat
genérica."* `src/components/assistant-raiz-widget.tsx` foi reescrito por completo.

### Cabeçalho contextual

Novo endpoint dedicado **`POST /api/assistant/context`** (`src/app/api/assistant/context/route.ts`) —
resolve só o rótulo (`{label, valid}`), reaproveitando a MESMA pipeline de validação/evidência do
`/api/assistant` (mesma sessão, mesmo `buildAssistantEvidence`), mas **nunca chama o provider e nunca grava
em `ai_generations`** (decisão deliberada: não é uma pergunta, é a tela dizendo "onde estou"; grava-la como
pergunta poluiria o log de auditoria e amarraria a atualização do cabeçalho a "o usuário já perguntou algo",
o que impediria o cabeçalho de aparecer proativamente ao abrir o painel).

`src/lib/ai/assistant-context-label.ts` (novo, puro): `deriveContextLabel(evidence)` — switch sobre
`evidence.kind`, sempre derivado do Evidence Package JÁ resolvido e validado no servidor (nunca do que o
client afirma que a tela é). `found: false` ou `kind: "invalid"` → `null` sempre — o painel mostra
"Contexto indisponível", nunca inventa um rótulo. Exemplos reais produzidos: "Talhão 04 · Fazenda Cabeda",
"Análise AN-2026-014", "Central de Decisão", "Mapa · Talhão 04", "Comparativo · Talhão 04 × Talhão 07"
(só quando o comparativo já está `ready`, senão "Comparativos" genérico honesto).

O widget busca o rótulo assim que o painel abre e de novo sempre que o contexto muda enquanto está aberto
(reset explícito pra "Contexto indisponível" antes de cada busca — nunca deixa o rótulo antigo parecer
válido durante o carregamento).

### Perguntas sugeridas por tela

`CONTEXTUAL_SUGGESTIONS` (`assistant-raiz-widget.tsx`) — um array de perguntas por
`AssistantScreenContext["type"]`, auditado pergunta a pergunta contra as 12 intenções reais do
`local-intent-assistant-provider.ts` antes de entrar na lista. Nenhuma pergunta "aspiracional": quando uma
pergunta do exemplo do diretor não batia com nenhum `regex`/Evidence Package real, ou foi descartada, ou —
onde a EVIDÊNCIA já existia mas nunca era narrada em texto — o provedor ganhou uma intenção nova (ver
"Capacidade real do provedor" abaixo) pra tornar a pergunta genuinamente respondível, em vez de fingir
capacidade ou empobrecer a UX por omissão.

### Resposta visualmente estruturada

Nunca mais um bloco de texto só. Seções distintas, cada uma só renderizada quando o campo correspondente do
`AssistantStructuredResponse` tem conteúdo:

- **Resumo** — `summary`, sempre presente.
- **Fatos** (`.assistant-facts`) — dado rastreável, `label`/`value`.
- **Pontos de atenção** (`.assistant-attention`) — destacado visualmente (cor de atenção + ícone).
- **Padrão identificado** (`.assistant-patterns`) — só quando um Evidence Package Builder calculou algo
  real (`patterns[].ruleRef` visível como código monoespaçado); hoje sempre vazio no provedor local (nenhum
  builder gera `patterns` ainda), mas a seção já existe estruturalmente pro dia em que existir.
- **Hipóteses** (`.assistant-hypotheses`) — bordas tracejadas + rótulo explícito "Hipótese — não é fato
  confirmado", nunca no mesmo bloco visual dos Fatos. Hoje sempre vazio (provedor determinístico nunca gera
  hipótese) — a seção existe porque o schema já a declara (Fase 4A, Bloco 3), não é uma capacidade nova.
- **Informações faltantes** (`.assistant-missing-info`) — sempre visível quando existe, nunca escondida.
- **Fontes técnicas** (`.assistant-technical-refs`) — só quando `technical_references` tem conteúdo real.
- **Ações** (`.assistant-actions`) — botões gerados a partir de `ResolvedAssistantAction[]` (Bloco 4);
  cards legados (ver Bloco 6) continuam renderizando logo abaixo, sem rótulo visível "legado" (é um detalhe
  de arquitetura interna, não algo que o usuário precisa ver).

### Pontos de entrada contextuais

Novo componente `src/components/assistant-entry-button.tsx` — um único componente reaproveitado nas 5 telas
prioritárias (Talhão 360°, Análise, Inteligência, Mapas, Comparativos), cada um passando só um `label`
estático (ou dinâmico, como o nome real do talhão). Dispara um evento DOM global
(`window.dispatchEvent(new Event("raiz-assistant:open"))`), que `AssistantRaizWidget` escuta pra se abrir —
**um único Assistente RAIZ**, sempre com o contexto real derivado do `pathname`/`searchParams` no momento do
clique (o botão não passa contexto nenhum pro widget; nunca 5 componentes de assistente diferentes).
Inserido nas 5 páginas, só no branch de banco de dados real (`isDatabaseMode()`) — as versões de
demonstração dessas telas usam ids de exemplo que não existem no banco, então o botão não foi adicionado lá
(evita abrir o Assistente real contra dado fictício, o que contradiria a regra de `DATA_MODE=database`).

### Contexto visualmente percebido

Cada entrada do histórico (`ChatEntry`) guarda o `contextLabel` capturado no momento em que a pergunta foi
feita (`.assistant-entry-context`, uma tag pequena acima de cada bolha de pergunta) — trocar de talhão
nunca faz uma resposta antiga parecer que pertence ao novo contexto; o cabeçalho do painel muda
imediatamente, mas o histórico continua honesto sobre em qual contexto cada resposta foi gerada. Histórico
de conversa continua **só em memória** (nenhuma persistência em banco nesta fase, como instruído).

Provado com um teste e2e que troca de talhão via navegação client-side (sem reload de página, o cenário
real de risco) dentro de `/mapas` e confirma: cabeçalho muda pro novo talhão, mensagem antiga continua
rotulada com o talhão antigo.

### Mobile e responsividade

- Desktop: painel flutuante controlado (`420px` de largura, `min(700px, 80vh)` de altura máxima) —
  mesmo padrão de antes (canto inferior direito), só maior e com cabeçalho/seções redesenhados.
- Mobile (`max-width: 760px`): o painel vira um **drawer de altura cheia** (`top:0` até
  `calc(69px + env(safe-area-inset-bottom))`, exatamente acima da barra de navegação inferior — nunca a
  cobre, nunca esconde conteúdo importante abaixo da viewport), sem cantos arredondados no topo removidos
  (`border-radius: 18px 18px 0 0`), com `padding-top` extra pra `safe-area-inset-top` (notch). A caixa de
  pergunta fica sempre alcançável, fixa na base do drawer.
- Testado visualmente (screenshots reais, ver seção dedicada) em 1366×768, 1440×900, 390×844 — nenhuma
  quebra da correção de sidebar recente (`sidebar-responsiveness.spec.ts` continua 100% verde).

### Capacidade real do provedor — de 9 para 12 intenções

Pra que as perguntas sugeridas por tela fossem honestas (nunca "fingir capacidade futura"), 3 intenções
novas foram adicionadas ao `local-intent-assistant-provider.ts`, todas reaproveitando Evidence Packages que
o Bloco 2 já montava mas que nenhuma resposta em texto consumia ainda:

1. **Dentro de uma análise**: "Qual a confiabilidade desta interpretação?" / "Qual regra técnica foi usada
   nesta análise?" / "Quais são os pontos de atenção desta análise?" — narra `AgronomicEvidencePackage.
   confidence`/`.ruleUsed` (já existiam desde a Fase 3) e classificações não-interpretáveis como pontos de
   atenção reais.
2. **Dentro do mapa**: "O que estou vendo neste mapa?" narra o talhão delegado (nome, área, pontos
   coletados) ou admite honestamente que nada está selecionado; "Mostre só os pontos pendentes" vira uma
   AÇÃO real (`show_on_map`, `status:"pending"`), não só texto.
3. **Dentro de um comparativo**: "Resuma este comparativo" / "Qual a diferença entre os dois lados?" narra
   `ComparisonEvidence` (labelA/labelB/rowCount) quando já `ready`, senão admite que faltam os dois lados.

## Bloco 6 — Auditoria Completa e Polimento

### Campos de auditoria em `ai_generations` (sem migração — mesmo `jsonb`)

`requestPayload`: `{question, screenContext, screenState, evidenceManifest}`. `responsePayload`:
`{...resposta estruturada completa (summary/facts/attention_points/patterns/hypotheses/
missing_information/technical_references/cards/requires_professional_review/suggestedQuestions/provider/
model/isRealLanguageModel/generatedAt), suggested_actions (cru, o que o provider sugeriu), resolved_actions
(o que sobreviveu à validação)}` — as duas listas de ações gravadas **separadamente**, exatamente como
pedido ("ações sugeridas; ações resolvidas"), permitindo auditar tanto o que o provider propôs quanto o que
realmente chegou ao usuário. `promptVersion` (`"local-intent-v3-actions"`), `provider`/`model`, `status`
(`APPROVED`/`PENDING_REVIEW`, calculado por código). `tokensUsed`/`costUsd` ficam `null` — honesto: o
provedor local não tem tokens nem custo real; o campo existe pro dia em que houver.

### `evidenceHash`/`factsSnapshot` — correção de documentação (instrução explícita do diretor)

Um comentário pré-existente em `assistant-evidence-manifest.ts` (e o mesmo texto em
`docs/RAIZ_2.0_FASE4A_ENTREGA.md`) dizia que o hash era **"reconstruível reconsultando o banco com os
mesmos `entityIds`"** — exatamente a afirmação que o diretor pediu pra nunca escrever. Corrigido nos dois
lugares nesta rodada:

- **`evidenceHash`** = fingerprint (SHA-256) do Evidence Package resolvido no momento da resposta. Prova
  **igualdade/integridade** (duas respostas com o mesmo hash usaram exatamente a mesma evidência; um hash
  diferente prova que algo mudou) — **nunca** "reconstruibilidade". Se o banco mudar depois (edição, nova
  coleta, revisão), reconsultar `entityIds` com o hash em mãos devolve o estado ATUAL, não o pacote
  original.
- **`factsSnapshot`** = recorte dos fatos efetivamente citados na resposta (até 20 itens) — isto, e não o
  hash, é o que preserva o conteúdo caso o banco mude depois.
- **IDs/versões/fontes** (`ruleRefs`/`technicalSourceIds`/`entityIds`) = referências pra rastreabilidade,
  não pra reconstrução do objeto original.
- Uma futura IA generativa real pode exigir um snapshot normalizado mais completo do INPUT efetivamente
  usado — deliberadamente **não implementado** nesta fase (fora de escopo, ver seção final).

### Cards legados vs. mecanismo oficial novo

`AssistantCard`/`cards` (pré-existente, desde antes da Fase 4A) continuam funcionando sem quebra — é
navegação com `href` computado inteiramente pelo próprio provider local determinístico (nunca sugerido por
um modelo). `suggested_actions`/`ResolvedAssistantAction` (Bloco 4) é o mecanismo **oficial** novo a partir
de agora — o único que um futuro LLM poderá influenciar, porque passa por validação server-side completa
antes de virar link. Migração deliberadamente **progressiva**, não um "big bang": os 2 lugares do provedor
que já emitiam `cards` com `href` continuam emitindo (compatibilidade das intenções existentes), enquanto os
pontos novos/ações executáveis (comparar safra, ver relatório de propriedade, ver no mapa, filtrar
Inteligência, ver talhão a partir de análise) usam exclusivamente `suggested_actions`. Documentado em
comentário direto no schema (`assistant-response-schema.ts`, campo `cards`): **um futuro provider de LLM
real nunca deve poder popular `cards.href` diretamente**, só `suggested_actions` — essa é a garantia
estrutural que sobrevive à introdução de um LLM real no Bloco 7.

## Bugs encontrados e corrigidos durante a verificação visual

Screenshots reais tiradas em 1366×768, 1440×900 e 390×844 (ver seção "Screenshots" abaixo) revelaram um bug
real de CSS que nenhum teste automatizado (que não olha pixel) capturaria:

**O mapa (Leaflet, `/mapas`) renderizava por cima do painel do Assistente.** O painel resolvia o contexto
corretamente (confirmado inspecionando o DOM: `.assistant-context-badge` continha o texto certo), mas
visualmente ficava coberto pelos tiles do mapa — `z-index:60` do painel perdia pra alguma camada interna do
Leaflet que estabelece um novo contexto de empilhamento. Corrigido subindo `.assistant-fab`/`.assistant-
panel` pra `z-index:950` (abaixo só do link de acessibilidade "pular pro conteúdo", que é `1000` e
deliberadamente sempre o mais alto da base) — um painel flutuante global não deveria perder pra conteúdo de
página nenhum. Confirmado corrigido com screenshot antes/depois.

Um segundo ajuste, também descoberto visualmente: o botão de entrada contextual (`.assistant-entry-button`)
com o nome real de um talhão longo estourava a largura da topbar em 390px — adicionado `max-width` +
`text-overflow: ellipsis` só no breakpoint mobile (desktop continua mostrando o texto inteiro).

## Screenshots

Capturados com Playwright, sessão real (`admin@raiz.local`), dado real do banco de desenvolvimento —
nenhum mockup. Vistos e avaliados antes de considerar a entrega concluída (auto-checagem do diretor: *"Isso
agora parece um copiloto integrado à RAIZ ou ainda parece um chat genérico?"*):

- **1366×768 e 1440×900**: Dashboard (vazio + resposta estruturada completa com Fatos/Pontos de
  atenção/Ações), Talhão 360° (cabeçalho "Talhão 3 · Sede Bela Vista", sugestões específicas, botão de
  entrada contextual na topbar), Análise (cabeçalho "Análise AN-CABEDA-03"), Inteligência (cabeçalho
  "Inteligência Agronômica", sugestões específicas), Mapas (cabeçalho "Mapa · Área 03", corrigido o bug de
  z-index acima), Comparativos (cabeçalho "Comparativos"), relatório de propriedade (resposta completa com
  Fatos + Pontos de atenção + Ação nova "Ver relatório da propriedade" + card legado "Ver relatório
  executivo" lado a lado, prova visual da migração progressiva do Bloco 6).
- **390×844**: painel fechado (fab visível acima da navegação inferior), painel aberto (drawer de altura
  cheia, sugestões específicas, caixa de pergunta alcançável), resposta estruturada renderizando dentro do
  drawer, botão de entrada contextual truncado corretamente na topbar do Talhão 360°.

**Resposta à auto-checagem**: sim — cabeçalho contextual real, perguntas específicas por tela, seções
visuais distintas (nunca fato/hipótese misturados), ações como botões de verdade (não texto solto), e
pontos de entrada nas telas de maior valor lêem como um copiloto integrado, não uma bolha de chat genérica
anexada por cima do produto.

## Arquivos alterados/criados

**Novos**:
- `src/lib/ai/assistant-actions-schema.ts` (Bloco 4 — puro)
- `src/lib/ai/assistant-actions.ts` (Bloco 4 — banco)
- `src/lib/ai/assistant-context-label.ts` (Bloco 5 — puro)
- `src/app/api/assistant/context/route.ts` (Bloco 5)
- `src/components/assistant-entry-button.tsx` (Bloco 5)
- `scripts/test-assistant-actions-schema.mjs`, `scripts/test-assistant-context-label.mjs`
- `e2e/assistant-actions.spec.ts`, `e2e/assistant-widget-ux.spec.ts`

**Alterados**:
- `src/lib/ai/assistant-screen.ts` — pré-ajuste 2 (`buildIntelligenceState`/`invalidFilter`, `UUID_EXACT`
  exportado)
- `src/lib/ai/assistant-evidence.ts` — pré-ajuste 2 (`IntelligenceEvidence` como união discriminada)
- `src/lib/ai/assistant-evidence-manifest.ts` — pré-ajuste 1 (`screenContext` inclui `"invalid"`) + Bloco 6
  (documentação corrigida de `evidenceHash`/`factsSnapshot`)
- `src/lib/ai/assistant-response-schema.ts` — `suggested_actions: AssistantAction[]`, `cards` documentado
  como legado
- `src/lib/ai/providers/local-intent-assistant-provider.ts` — 3 intenções novas (12 no total), ações
  anexadas em 4 pontos (fila de Inteligência, comparar safra, resumo de propriedade, análise → ver talhão)
- `src/app/api/assistant/route.ts` — valida ações (`validateAssistantActions`), grava auditoria completa
  (ações sugeridas + resolvidas separadas)
- `src/components/assistant-raiz-widget.tsx` — reescrito por completo (Bloco 5)
- `src/components/icon.tsx` — `IconName` exportado (usado pelo mapeamento de ícone por tipo de ação)
- `src/app/globals.css` — seção `/* Assistente RAIZ */` reescrita (painel premium, badge de contexto,
  seções estruturadas, drawer mobile) + correção de z-index (bug encontrado na verificação visual)
- `src/app/(platform)/talhoes/[fieldId]/page.tsx`, `.../analises/[id]/page.tsx`,
  `.../inteligencia/page.tsx`, `.../mapas/page.tsx`, `.../comparativos/page.tsx` — botão de entrada
  contextual (só no branch de banco real)
- `docs/RAIZ_2.0_FASE4A_ENTREGA.md` — correção pontual da mesma imprecisão sobre `evidenceHash`
- `package.json` — 2 scripts de teste novos, incluídos em `test:handoff`

## Validação

```
npm run typecheck                                 → sem erros
npm run build                                      → build de produção completo, sem erros
npm run test:handoff                                → todos os cenários aprovados (inclui os 2 scripts
                                                        novos: test:assistant-actions-schema, 8 cenários;
                                                        test:assistant-context-label, 10 cenários; e
                                                        test:assistant-screen, agora 23 cenários)
npx playwright test e2e/assistant-fase4a.spec.ts e2e/assistant-actions.spec.ts
                                                     → 21 passed, 3 skipped (honestos), 0 failed
npx playwright test e2e/assistant-widget-ux.spec.ts
                                                     → 5 passed, 1 skipped (honesto — talhão sem 2 safras
                                                       reais no banco de dev pra provar a ação de
                                                       comparação), 0 failed
npx playwright test <assistente completo + sidebar>, --workers=2
                                                     → 33 tests, 29 passed, 4 skipped, 0 failed
```

## O que continua fora de escopo (reafirmado)

- Nenhum provedor de IA generativa conectado (Claude/OpenAI/Gemini) — `resolveOperationalAssistantProvider()`
  continua devolvendo só o local.
- Nenhum RAG, nenhuma embedding.
- Nenhuma ação altera dado — todas as 6 ações desta rodada são navegação/filtro/seleção de uma tela que já
  existe; a mutação (se algum dia existir) fica pro clique do usuário na tela de destino, com as
  verificações normais daquela tela.
- Nenhuma aprovação de interpretação, publicação de relatório, prescrição ou recomendação autônoma gerada
  pelo Assistente.
- Nenhuma atribuição de causalidade NDVI × solo.
- Nenhuma fórmula/regra agronômica alterada.
- Nenhuma migração executada.
- Nenhuma persistência de histórico de conversa em banco (continua só em memória, por sessão do navegador).
- Nenhum merge em `develop`/`main`.

Bloco 7 (provedor de LLM real) aguarda autorização explícita antes de começar.
