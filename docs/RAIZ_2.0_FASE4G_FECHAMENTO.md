# RAIZ 2.0, Fase 4G — Provider Routing + Controle de Custo + Fechamento do Assistente

Branch: `feature/raiz-2.0-fase4`, sem merge em `develop`/`main`, sem migração, sem alteração agronômica.
Continuação de `docs/RAIZ_2.0_FASE4F_GROUNDING_GATE.md` (aprovado no commit `b942ece`). Esta é a entrega
FINAL da Fase 4 — fecha o Assistente RAIZ como um produto local-first, com uma camada opcional de
inteligência generativa, controle de custo real, e uma arquitetura pronta pra receber um modelo próprio da
RAIZ no futuro sem reconstrução.

## Objetivo central (reafirmado)

A RAIZ **não pode depender** de Gemini, Claude, OpenAI ou qualquer API paga para funcionar comercialmente.
O Assistente continua **plenamente utilizável só com o provider local**. Um provider generativo é uma
**camada opcional** de inteligência adicional — nunca uma dependência. A arquitetura já está pronta para,
no futuro, conectar um modelo open-weight/self-hosted da própria RAIZ trocando só uma peça (item 9), sem
reconstruir nada.

## Arquitetura final do Assistente

```
Pergunta + ScreenContext/ScreenState (do client, nunca confiados como autorização)
  ↓
Evidence Package (buildAssistantEvidence -- tenant-escopado, resolvido ANTES de qualquer provider, route.ts)
  ↓
Provider Router (assistant-provider-router.ts) ──────────────────────────────────┐
  ↓                                                                                │
Provider Local (localIntentAssistantProvider, SEMPRE chamado primeiro)            │
  ↓ handling: "handled" | "insufficient_evidence" | "unsupported"                 │
  │                                                                                │
  ├─ "handled"/"insufficient_evidence" → resposta local, FIM                     │
  │                                                                                │
  └─ "unsupported" E modo híbrido E provider generativo configurado E dentro      │
     do limite diário →                                                          │
       Provider Generativo (Evidence Catalog + refs, Fase 4F) ────────────────────┘
         ↓ (timeout configurável)
       Grounding Gate (assistant-grounding-gate.ts)
         ↓
       aprovado → resposta generativa (cards/actions cruas ainda passam pela
                  validação server-side de sempre, route.ts)
         │
       reprovado/erro/timeout/limite → fallback: resposta LOCAL (a mesma que já
                  tínhamos calculado), NUNCA um erro técnico exposto ao cliente
```

Auditoria completa de cada decisão de roteamento vai pra `ai_generations.response_payload.routing`
(item 7) — nunca aparece na resposta que o client recebe (item 8).

## Item 1 — Provider local continua sendo a base

`localIntentAssistantProvider` é chamado **sempre**, primeiro, incondicionalmente — o router nunca pula
essa etapa. Continua funcionando idêntico mesmo se `GEMINI_API_KEY` não existir, Gemini estiver sem cota,
retornar 429/503, estiver lento, ou qualquer provider externo estiver fora do ar — nenhuma dessas
condições é sequer CONSULTADA antes de responder com o local (o router só olha pra elas DEPOIS de saber que
o local não resolveu). Nenhuma regra agronômica foi alterada. Benchmark local: **49/49** (Fase 4F,
confirmado de novo depois de todas as mudanças desta fase — `e2e/assistant-fase4g.spec.ts`, item 14).

## Item 2 — `AssistantHandlingResult`: sinalização estruturada, nunca por texto

```ts
export type AssistantHandlingResult = "handled" | "unsupported" | "insufficient_evidence";
```

Campo `handling`, agora OBRIGATÓRIO em `OperationalAssistantResponse` — todo provider (local hoje,
Gemini/self-hosted amanhã) declara isso explicitamente. Nunca `summary.includes("não entendi")`.

- **`"handled"`** — reconheceu a pergunta e respondeu com dado real, inclusive uma contagem "0" honesta
  (resposta completa, não uma lacuna).
- **`"insufficient_evidence"`** — reconheceu a INTENÇÃO, mas a evidência necessária não existe/não
  resolveu (comparar safra sem segunda safra, contexto inválido, entidade de outro tenant/inexistente).
  **O router NUNCA escalona este caso** — se o dado não existe, um provider generativo também não pode
  inventá-lo, exatamente como pedido.
- **`"unsupported"`** — nenhuma intenção/capacidade reconhecida. Único caso que o router considera
  escalonar (modo híbrido).

`local-intent-assistant-provider.ts`: a maioria das branches usa uma inferência estrutural padrão
(`inferHandling`, baseada em se a resposta tem fato/ponto de atenção/fonte técnica real — nunca no texto).
Só 2 casos precisam de tag explícita, porque a inferência erraria: o fallback final (tem `facts` genéricos
do painel executivo, mas a pergunta em si não foi reconhecida) e `INVALID_CONTEXT_RESPONSE`.

**Achado real corrigido durante a validação**: um contexto de tela RECONHECIDO (ex. `type:"field"`) mas
cuja ENTIDADE específica não existe/não pertence ao tenant (`evidence.found === false`) caía no fallback
genérico (painel executivo, seguro, sem vazamento) quando a pergunta não batia com nenhuma intenção
específica -- e ficava classificado como `"unsupported"`, o que faria o router (em modo híbrido) tentar
escalonar pro generativo desnecessariamente. Corrigido com uma sobrescrita pontual em `ask()`: `handling`
vira `"insufficient_evidence"` sempre que `evidence.found === false` (contexto reconhecido, entidade não
resolvida) — nunca muda o TEXTO da resposta (que já era seguro), só a classificação que o router usa.

## Item 3 — Router de providers

`src/lib/ai/assistant-provider-router.ts`, `routeAssistantRequest(request, options)`. Deliberadamente
desacoplado do Gemini — trabalha só com `OperationalAssistantProvider`. `options.generativeProvider` é
injetado pelo CHAMADOR (`route.ts`, via `assistant-generative-provider-resolver.ts`) — o router em si
nunca importa Gemini. Um `SelfHostedOperationalAssistantProvider` (item 9) entra só trocando o que
`resolveGenerativeProvider()` devolve — zero linha do router muda.

Sanitiza `cards` (`sanitizeLegacyCards`) na resposta final, não importa qual caminho respondeu — defesa em
profundidade, redundante com o que `route.ts` já fazia (Fase 4E/4F), mas garantida no próprio router.

## Item 4 — Modos de operação

```
RAIZ_ASSISTANT_MODE=local    (padrão -- qualquer valor que não seja exatamente "hybrid" cai aqui)
RAIZ_ASSISTANT_MODE=hybrid
```

`resolveAssistantMode()` — fail-safe pro modo mais restrito: ausente, vazio, com erro de digitação, tudo
vira `"local"`. Nunca o contrário. **`GEMINI_API_KEY` configurada NUNCA basta sozinha** —
`resolveGenerativeProvider()` exige `RAIZ_ASSISTANT_MODE=hybrid` **E** a chave presente, os dois. Ter
credencial não é autorização de uso.

## Item 5 — Gemini como provider opcional

Nenhuma integração recriada — o candidato já existia (Fase 4E/4F), reaproveitado como está. Em modo
híbrido: só é chamado quando o local devolve `"unsupported"`; passa pelo Grounding Gate (Fase 4F,
`assistant-evidence-catalog.ts`/`assistant-grounding-gate.ts`); nunca recebe conexão de banco (contrato já
garantia isso desde a Fase 4F); `cards` sempre `[]`; `patterns`/fontes/fatos determinísticos só vêm de refs
resolvidos contra o Evidence Catalog, nunca escritos livremente pelo modelo. 429/503/timeout/JSON
inválido/reprovação do gate → fallback local, sem exceção.

**Patch de pré-merge, item 2 (cancelamento real, não só "parar de esperar")**: `OperationalAssistantRequest`
ganhou um campo opcional `signal?: AbortSignal`. O router cria um `AbortController` por tentativa
generativa e chama `controller.abort()` no exato momento em que o timeout dispara (antes de rejeitar a
promessa que o `route.ts` está esperando) — qualquer provider que faça I/O de rede precisa repassar esse
`signal` pra sua chamada real. `gemini-operational-assistant-provider.ts` agora passa
`signal: request.signal` pro `fetch`; um abort faz o `fetch` rejeitar imediatamente com `AbortError`, que
escapa do loop de retry sem passar pela lógica de "tentar de novo" (nenhum código extra precisou checar
isso no caminho do `fetch` em andamento). O único ponto que precisava de uma checagem explícita é o
intervalo de espera ENTRE tentativas (`sleep(RETRY_DELAYS_MS[...])`, usado só quando o Gemini responde
429/503 e o provider decide tentar de novo) — sem essa checagem, um abort que chegasse durante essa espera
ainda deixaria uma 2ª chamada real disparar depois que o router já tinha desistido; agora o loop confere
`request.signal?.aborted` logo depois do `sleep` e para ali, sem nova tentativa. Contrato válido pra
qualquer provider generativo futuro (self-hosted incluso, item 9).

Teste dedicado (`e2e/assistant-fase4g.spec.ts`, "Patch pré-merge, item 2"): um provider fake que nunca
resolve sozinho (só reage ao `AbortSignal`, exatamente como o `fetch` real reagiria) confirma que o abort
disparou de verdade dentro do provider (`abortProbe.wasAborted === true`) e que `ask()` foi chamado
exatamente uma vez (`abortProbe.attempts === 1`) — nenhuma segunda tentativa depois do abort.

## Item 6 — Controle de custo/uso

`src/lib/ai/assistant-usage-limits.ts`. Reaproveita `ai_generations` (já existe, já é gravado em toda
resposta) — **nenhuma migração, nenhuma tabela nova**. Contador real via consulta SQL — nunca um contador
em memória de processo Node/serverless (que zeraria a cada cold start e não seria compartilhado entre
instâncias).

**Patch de pré-merge, item 1 (correção real de contagem)**: a consulta original filtrava por
`provider <> 'raiz-local-intent'`. Isso perdia toda tentativa generativa que caiu em fallback — quando o
Gemini falha/dá timeout/é reprovado pelo Grounding Gate, `route.ts` grava a geração final com `provider` =
LOCAL (é a resposta que o cliente de fato recebeu), mesmo tendo havido uma chamada externa real. Um
provider instável (ou um Grounding Gate que reprova com frequência) virava, na prática, um jeito de gastar
cota externa paga sem nunca bater no limite diário. Corrigido: a consulta agora conta por
`response_payload -> 'routing' ->> 'escalatedToGenerative'` (o campo que `assistant-provider-router.ts`
grava com precisão — só fica `true` nos 4 desfechos que realmente iniciaram uma chamada externa: `approved`,
`rejected_by_gate`, `provider_error`, `timeout`; fica `false` tanto quando nunca houve motivo de escalonar
quanto quando o limite já bloqueou ANTES da chamada, `rate_limited`), não mais pela coluna `provider`:

```sql
SELECT count(*) FILTER (WHERE created_by = $2::uuid) AS "userCount", count(*) AS "tenantCount"
FROM ai_generations
WHERE tenant_id = $1::uuid AND kind = 'OPERATIONAL_ASSISTANT' AND created_at >= date_trunc('day', now())
  AND (response_payload -> 'routing' ->> 'escalatedToGenerative')::boolean IS TRUE
```

Teste dedicado (`e2e/assistant-fase4g.spec.ts`, "Patch pré-merge, item 1"): insere 21 linhas reais com
`provider = 'raiz-local-intent'` mas `routing.escalatedToGenerative: true` (simulando 21 perguntas que
escalonaram e caíram em fallback) e confirma que o limite diário é atingido mesmo assim — o mesmo cenário
que, com a consulta antiga, jamais contaria contra o limite (`provider` sempre era local nessas linhas).

```
RAIZ_ASSISTANT_MAX_GENERATIVE_CALLS_PER_USER_DAY     (padrão: 20)
RAIZ_ASSISTANT_MAX_GENERATIVE_CALLS_PER_TENANT_DAY   (padrão: 200)
RAIZ_ASSISTANT_GENERATIVE_TIMEOUT_MS                 (padrão: 15000)
RAIZ_ASSISTANT_GENERATIVE_MAX_TOKENS                 (opcional -- sem padrão, cada provider usa o próprio)
```

Quando o limite é atingido: o provider local continua respondendo normalmente pra aquela pergunta — nada
quebra, nenhuma mensagem sobre cota/API é mostrada (`routing.generativeOutcome: "rate_limited"` fica só na
auditoria). O provider local nunca conta contra o limite (é gratuito/sempre disponível).

## Item 7 — Auditoria/telemetria

`AssistantRoutingTelemetry` (`assistant-provider-router.ts`), gravado em
`ai_generations.response_payload.routing` (mesmo jsonb já existente, sem migração):

```ts
type AssistantRoutingTelemetry = {
  mode: "local" | "hybrid";
  localHandling: AssistantHandlingResult;
  escalatedToGenerative: boolean;
  generativeOutcome: "not_attempted" | "approved" | "rejected_by_gate" | "provider_error" | "timeout" | "rate_limited";
  generativeProvider?: string; generativeModel?: string;
  generativeLatencyMs?: number; generativeTokensUsed?: number;
  fallbackReason?: string; // frase curta, nunca um erro técnico cru de um provedor externo
};
```

`promptVersion` registrado na auditoria agora reflete quem REALMENTE respondeu (local ou Gemini), não mais
um valor fixo assumindo sempre o local. `costUsd` nunca é inventado — só gravado quando o provider devolve
um valor real (nenhuma tabela de preço configurada nesta base ainda, então fica `null`/ausente, honesto).

## Item 8 — Experiência do cliente

O cliente nunca vê "Gemini"/"Google"/"provider local"/"429"/"API quota" — a marca é sempre **Assistente
RAIZ**. O painel (`assistant-raiz-widget.tsx`) trocou o selo antes chamado "Motor local · sem custo"/"IA"
por texto neutro: **"Resposta baseada nos dados da sua operação"** (provider local) e **"Análise
assistida"** (provider generativo aprovado pelo gate). `isRealLanguageModel` continua guiando a UI
internamente — só o TEXTO mudou. Nenhum detalhe de `routing`/provider/erro externo trafega na resposta que
o client recebe — fica exclusivamente em `ai_generations` (auditoria/admin).

## Item 9 — Futuro modelo próprio: só preparação

**Nada implementado nesta fase** — sem Ollama/vLLM/servidor GPU/modelo baixado/infraestrutura reservada.
Só o contrato documentado:

```ts
export const selfHostedOperationalAssistantProvider: OperationalAssistantProvider = {
  name: "raiz-self-hosted",
  model: "<nome/versão do modelo próprio>",
  isRealLanguageModel: true,
  async ask(request: OperationalAssistantRequest): Promise<OperationalAssistantResponse> {
    // 1. buildEvidenceCatalog(request.evidence) -- MESMO catálogo do Gemini (assistant-evidence-catalog.ts)
    // 2. prompt/chamada pro modelo self-hosted -- só question/screenContext/screenState/role/catálogo,
    //    NUNCA conexão de banco (mesmo contrato de OperationalAssistantProvider.ask)
    // 3. materializeFromCatalog + resolveHypothesesFromCatalog -- MESMA materialização server-side
    // 4. requires_professional_review = computeRequiresProfessionalReview(...) -- NUNCA do modelo
    // 5. cards: [] -- NUNCA do modelo
    // 6. handling: "handled" | "insufficient_evidence" -- inferido da forma da resposta
  },
};
```

Fluxo idêntico ao já implementado: Evidence Catalog → modelo → resposta por refs → Grounding Gate → ações
validadas → Assistente RAIZ. Ativar isso no futuro é **só**:
1. Criar o arquivo do provider (implementando `OperationalAssistantProvider`, reaproveitando
   `assistant-evidence-catalog.ts`/`assistant-grounding-gate.ts` como estão).
2. Trocar o que `assistant-generative-provider-resolver.ts` devolve (ou estender pra escolher entre
   Gemini/self-hosted por configuração).

**Nenhuma outra linha do produto muda** — UI, Evidence Catalog, ações, grounding, auditoria, RBAC e rotas
já são genéricos o bastante (nenhum `if (provider === "gemini")` espalhado pela aplicação — confirmado:
`assistant-provider-router.ts` e `grounded-operational-assistant-provider.ts` nunca mencionam "gemini" em
lugar nenhum do código).

## Item 10 — Testes

`e2e/assistant-fase4g.spec.ts`, 14 testes, todos contra um provider generativo **FAKE**
(`/api/dev/assistant-router-test`, dev-only, nunca o Gemini real — "não gastar cota real do Gemini nos
testes normais"):

1. modo local funciona sem nenhum provider generativo injetado.
2. modo local nunca chama o generativo, mesmo unsupported.
3. pergunta suportada pelo local nunca escalona em modo híbrido.
4. pergunta unsupported escalona e usa a resposta aprovada pelo gate.
5. `insufficient_evidence` nunca escalona (contexto inválido).
6. cross-tenant/entidade inexistente nunca vira "unsupported" escalonável (mesma proteção do item 5).
7. 429 → fallback, sem erro técnico exposto na resposta.
8. 503 → fallback.
9. timeout (500ms nesta rota de teste) → fallback, nunca trava.
10. JSON inválido → fallback.
11. Grounding Gate reprovado → fallback, conteúdo ungrounded nunca chega ao client.
12. `cards`/href malicioso nunca sobrevive na resposta final.
13. limite diário atingido (21 linhas reais inseridas em `ai_generations`, removidas depois) → local
    continua respondendo, nada quebra, nenhuma menção a "quota"/"429".
14. benchmark local continua 49/49 depois de todas as mudanças desta fase.

Chamadas reais ao Gemini só acontecem no benchmark explicitamente autorizado
(`/api/dev/assistant-benchmark`, `provider:"gemini"`), como já estabelecido nas Fases 4E/4F — nada disso
mudou.

Patch de pré-merge — 2 testes novos no mesmo arquivo: "tentativas generativas que caem em fallback ainda
consomem o limite diário" (item 6 acima) e "timeout aborta a chamada externa de verdade, sem 2ª tentativa
depois do abort" (item 2 acima). 16 testes no total no arquivo (14 anteriores + 2 novos).

## Patch de pré-merge — causa e correção dos 5 testes antigos de Field Operations

A suíte completa (rodada ao final da Fase 4G) revelou 5 falhas em `e2e/field-operations-isolation.spec.ts`
e `e2e/field-operations-rbac.spec.ts`, todas com o mesmo sintoma: `expect(imported.status).toBe(200)`
recebendo `422` numa importação de CSV de pontos.

**Causa raiz confirmada (não é bug de produção)**: os 4 pontos de teste envolvidos localizavam a safra alvo
com `list.payload.orders[0]?.cropSeasonId` — assumindo que a "primeira ordem" retornada pela API sempre
pertencia ao talhão-fixture usado pelas outras suítes ("Talhão 3", tenant A), cujo boundary geográfico real
cobre as coordenadas fixas do CSV de teste (`INSIDE_FIELD_POINTS_CSV`). O banco de desenvolvimento
acumulou ordens de coleta de várias suítes ao longo de meses de sessões — quando a "primeira" ordem da
lista passou a pertencer a outro talhão (não "Talhão 3"), a nova ordem criada a partir dessa
`cropSeasonId` ficava vinculada a um talhão cujo boundary real não cobre as coordenadas fixas do CSV, e a
importação era corretamente rejeitada com 422 (validação de geometria funcionando como deveria — nenhuma
regra de negócio alterada).

Confirmado consultando o banco de desenvolvimento diretamente: existem múltiplas ordens de coleta
associadas ao talhão "Talhão 3" (mesmo `crop_season_id` em todas), prova de que esse talhão-fixture já
tinha pelo menos uma ordem existente o tempo todo — só não era mais garantidamente a primeira da lista.

**Correção**: os 4 pontos trocaram `orders[0]?.cropSeasonId` por uma busca explícita pelo nome do talhão
(`orders.find(o => o.fieldName === "Talhão 3")?.cropSeasonId`) — nunca mais pela posição na lista. Isolamento
multiempresa e RBAC continuam sendo exercitados exatamente como antes (nenhuma asserção de segurança foi
enfraquecida ou removida) — só a forma de localizar a safra-fixture mudou. Confirmado: os 11 testes dos
2 arquivos passam 100% depois da correção, rodando isoladamente e dentro da suíte completa.

## Limitações atuais / o que fica pra fases futuras

- Gemini continua candidato — `resolveOperationalAssistantProvider()` (função original, ainda usada em
  outros pontos internos) continua devolvendo só o local; a aplicação real só considera Gemini quando um
  operador liga `RAIZ_ASSISTANT_MODE=hybrid` explicitamente (não ligado por padrão em nenhum ambiente).
- Nenhuma rodada completa/paga do Gemini foi executada nesta fase (não era objetivo -- ver Fase 4F pra a
  última medição real, parcial, por causa da cota gratuita).
- `costUsd` nunca é calculado de verdade nesta base -- nenhuma tabela de preço por token configurada;
  quando isso existir, basta o provider passar a devolver o valor real (o campo já existe no contrato).
- Modelo self-hosted: só documentado, zero código/infraestrutura.
- `RAIZ_ASSISTANT_MAX_GENERATIVE_CALLS_PER_USER_DAY`/`_TENANT_DAY` usam um "dia" definido pelo fuso do
  banco (`date_trunc('day', now())`) -- não configurável por fuso do tenant nesta fase.

## Validação

```
npm run typecheck                                   → sem erros
npm run build                                        → build de produção completo, sem erros (inclui as
                                                         2 rotas dev-only novas)
npm run test:handoff                                 → todos os cenários aprovados (25 scripts)
npx playwright test e2e/assistant-fase4g.spec.ts      → 14 passed, 0 failed
npx playwright test <assistente completo + sidebar>, --workers=2
                                                      → 61 tests, 57 passed, 4 skipped (honestos, os
                                                        mesmos já documentados nas entregas anteriores),
                                                        0 failed
Benchmark local (provider:"local")                    → 49/49, todos os eixos objetivos em 1.00
```

## Patch de pré-merge — validação final (suíte inteira)

Depois das 2 correções reais (item 6/contagem de limite, item 5/abort real) e da correção dos 5 testes
antigos de Field Operations:

```
npm run typecheck                                   → sem erros
npm run build                                        → build de produção completo, sem erros
npm run test:handoff                                 → todos os 25 scripts aprovados
e2e/field-operations-isolation.spec.ts +
e2e/field-operations-rbac.spec.ts (isolado)          → 11/11 passed, 0 failed
e2e/assistant-fase4g.spec.ts (16 testes: os 14
anteriores + 2 novos do patch)                        → 16/16 passed contra o banco real (14 direto, os
                                                        2 que dependem de DATABASE_URL confirmados à parte)
npx playwright test (SUÍTE INTEIRA, 16 arquivos,
--workers=2)                                          → 111 testes: 105 passed, 6 skipped (honestos,
                                                        já documentados em entregas anteriores -- nenhum
                                                        novo), 0 failed
```

**0 falhas na suíte completa.** Os 6 skips são os mesmos já conhecidos de entregas anteriores (dependem de
estado de fixture específico não montado neste ambiente, ex. duas safras do mesmo talhão pra comparação) --
nenhum skip novo, nenhum skip escondendo falha.

## O que continua fora de escopo (reafirmado)

- `RAIZ_ASSISTANT_MODE` continua `local` por padrão em todo ambiente -- ninguém liga o híbrido sem decisão
  explícita do diretor.
- Nenhuma migração executada, nenhuma alteração de fórmula/regra agronômica.
- Nenhum modelo self-hosted implementado -- só o contrato documentado (item 9).
- Nenhuma chamada real ao Gemini fora do benchmark explicitamente autorizado.
- Nenhum merge em `develop`/`main`.

A Fase 4 do Assistente RAIZ está, com esta entrega, **fechada**: local-first garantido, generativo
genuinamente opcional (nunca uma dependência), custo controlado de verdade, auditoria completa, e uma
arquitetura que aceita um modelo próprio da RAIZ no futuro trocando uma peça, não reconstruindo o produto.
