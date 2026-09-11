# RAIZ 2.0, Fase 4F — Grounding Gate + Benchmark V2

Branch: `feature/raiz-2.0-fase4`, sem merge em `develop`/`main`, sem migração, sem alteração agronômica,
Gemini continua como provider CANDIDATO (nunca ativo). Continuação de
`docs/RAIZ_2.0_FASE4E_PRE_LLM.md` (Gate Pré-LLM, aprovado no commit `8758c03`). Esta entrega fecha a última
lacuna antes de considerar o Bloco 7: o provider local chega a um baseline completo (item 1), uma violação
real do contrato arquitetural é corrigida (itens 2-5, Evidence Catalog), o único campo verdadeiramente
livre (`summary`) ganha um gate de rastreabilidade (item 6), o benchmark passa a checar grounding em TODOS
os campos gerados, não só `facts` (item 7), 10 cenários adversariais novos foram adicionados (item 8), e
execuções reais do benchmark agora persistem em artefatos com nome único, nunca sobrescritos (item 9).

## Resumo objetivo

- **Item 1**: os 4 gaps reais encontrados no benchmark local (Fase 4E) foram corrigidos —
  `missing_information` agora é preenchido nas 2 respostas de recusa honesta que não populavam (comparar
  safra sem segunda safra; propriedade não identificada por nome), e `technical_references` passou a ser
  narrado a partir de `AgronomicEvidencePackage.technicalSources` quando a pergunta pede regra/fonte/base
  técnica. Provider local: **49/49** no benchmark atualizado (39 originais + 10 adversariais novos).
- **Itens 2-5**: violação real do contrato arquitetural corrigida — o provider candidato Gemini pedia
  `facts`/`attention_points`/`patterns`/`technical_references` PRONTOS ao modelo, quando
  `AssistantStructuredResponse` já documentava que `patterns` só pode existir por código determinístico.
  Novo Evidence Catalog (`assistant-evidence-catalog.ts`): o servidor monta um catálogo citável com `ref`
  estável por item; o modelo só cita refs, nunca escreve valor/descrição/fonte; o servidor materializa.
  Hipóteses passaram a exigir `supportingEvidenceRefs` resolvidos contra o catálogo — sem ref válido, a
  hipótese é descartada.
- **Item 6**: `summary` (o único campo verdadeiramente livre) ganhou um grounding gate
  (`assistant-grounding-gate.ts`) que detecta uuid/número/entidade fora da evidência, coincidência
  espacial, causalidade, URL e recomendação fora de escopo — e um wrapper (`createGroundedProvider`) que
  descarta a resposta inteira e usa o provider local como fallback quando o gate reprova, nunca "conserta"
  o texto.
- **Item 7**: Benchmark V2 — 7 critérios novos de grounding, aplicados UNIVERSALMENTE a todos os cenários
  (`UNIVERSAL_CRITERIA`, `harness.ts`), cobrindo `summary`/`attention_points`/`patterns`/`hypotheses`/
  `technical_references`/`suggested_actions` — não só `facts`.
- **Item 8**: 10 cenários adversariais novos, cada um desenhado pra tentar um provider generativo a
  inventar algo específico (fonte Embrapa inexistente, versão falsa do CQFS, parâmetro fora da evidência,
  percentual inventado, padrão espacial inexistente, causalidade NDVI, entidade inexistente, ruleRef
  plausível porém falsa, hipótese sem suporte, ação com ids hierarquicamente incompatíveis).
- **Item 9**: cada execução real do benchmark grava um artefato em disco com nome único (`artifact-store.ts`)
  — nunca sobrescreve uma execução anterior (achado real da Fase 4E, corrigido estruturalmente). `replay`
  pode carregar QUALQUER artefato salvo pelo nome.
- **Item 10**: Gemini continua só como candidato — ver seção dedicada.

## Item 1 — Baseline local: 39/39 (agora 49/49 com os cenários adversariais novos)

### `insuf-01`/`cross-03` — `missing_information` estruturado, não só `summary`

`src/lib/ai/providers/local-intent-assistant-provider.ts`: as duas respostas de recusa honesta que só
declaravam a falta de dado no `summary` (texto solto) passaram a popular `missing_information` também —
o painel do Assistente (Bloco 5 da Fase 4) renderiza essa lista numa seção visual própria; sem isso, a
informação faltante ficava só implícita, nunca na seção certa.

```ts
// antes: return empty("Este talhão ainda não tem duas safras para comparar.");
if (!comparison) return empty("Este talhão ainda não tem duas safras para comparar.", [], ["Não há uma segunda safra registrada para este talhão -- cadastre mais uma safra pra poder comparar."]);
```

### `sources-01`/`sources-03` — `technical_references` narrado a partir do Evidence Package real

O branch de análise (`regra|confiabilidade|ponto.*atenc|atenc.*ponto`) ganhou `fonte|public` no regex, e
passou a montar `technical_references` a partir de `AgronomicEvidencePackage.technicalSources` — que já
existia desde a Fase 3, mas nenhuma resposta em texto nunca o narrava (mesmo padrão do achado "Evidence
Package construído mas nunca narrado" já visto no Bloco 5). Nunca inventa: só as fontes que já estavam no
Evidence Package, com o título/instituição exatamente como vieram.

**Resultado**: `passedScenarios: 39/39` no re-teste imediato; depois, com os 10 cenários adversariais do
item 8 somados, `49/49`.

## Itens 2-5 — Evidence Catalog: o modelo referencia, o servidor materializa

### A violação real, corrigida

`AssistantStructuredResponse` (`assistant-response-schema.ts`) já documentava: `patterns` só existe quando
calculado por código determinístico. O provider candidato Gemini (Fase 4E) violava isso na prática — pedia
`facts`/`attention_points`/`patterns`/`technical_references` PRONTOS ao modelo e os aceitava diretamente,
sem nenhum gate entre "o que o modelo escreveu" e "o que vira conteúdo oficial da resposta".

### `assistant-evidence-catalog.ts` — a camada de grounding explícito

```ts
type EvidenceCatalog = {
  facts: Array<{ ref: string; label: string; value: string; sourcePath: string }>;
  attentionPoints: Array<{ ref: string; label: string; reason: string }>;
  patterns: Array<{ ref: string; description: string; ruleRef: string }>;
  technicalSources: Array<{ ref: string; sourceId: string; title: string; institution: string | null }>;
  knownIds: string[];
  knownEntityNames: string[];
};
```

`buildEvidenceCatalog(evidence)` monta isso a partir do MESMO `AssistantEvidenceResult` que o provider
local já usa (dashboard/talhão/análise/propriedade/relatório/comparativo/inteligência/mapa) — nenhum dado
novo, só reorganizado com `ref` estável. `materializeFromCatalog(catalog, refs)` resolve
`factRefs`/`attentionRefs`/`patternRefs`/`technicalSourceRefs` pedidos pelo modelo pros objetos OFICIAIS —
**um ref que não existe no catálogo nunca vira nada na resposta** (nem erro, nem conteúdo — descartado em
silêncio, exatamente como pedido).

### Contrato final do provider candidato Gemini

O que o modelo PODE gerar livremente: `summary`, `hypotheses` (com `supportingEvidenceRefs`),
`missing_information`, `suggested_actions` (cru, validado depois). O que ele só pode CITAR (nunca
escrever): `factRefs`/`attentionRefs`/`patternRefs`/`technicalSourceRefs`.

```
{"summary":string,"factRefs":string[],"attentionRefs":string[],"patternRefs":string[],
 "technicalSourceRefs":string[],"hypotheses":[{"statement":string,"supportingEvidenceRefs":string[],
 "missingToConfirm":string[]}],"missing_information":string[],"suggested_actions":[...]}
```

`requires_professional_review` continua nunca vindo do modelo — sempre `computeRequiresProfessionalReview`
(código), a mesma regra do provider local. `cards` continua sempre `[]` (Bloco 6 da Fase 4).

## Item 5 — Hipóteses: `supportingEvidenceRefs`, não texto livre

`resolveHypothesesFromCatalog` (`assistant-evidence-catalog.ts`) resolve `supportingEvidenceRefs` contra
QUALQUER categoria do catálogo (fato, ponto de atenção, padrão ou fonte técnica). **Uma hipótese sem
nenhum ref válido é DESCARTADA inteira** — nunca uma hipótese "vazia" chega ao client. Decisão de design:
descartar só a hipótese problemática (não a resposta inteira), porque os outros fatos/hipóteses da mesma
resposta continuam válidos e úteis — a resposta nunca "falha fechada" por causa de UMA hipótese ruim
isolada, só perde aquela hipótese específica. Toda hipótese que sobrevive continua forçando
`requires_professional_review: true` (mesma regra de sempre).

## Item 6 — Grounding guard sobre `summary`

`assistant-grounding-gate.ts`, `checkFreeText`/`checkResponseGrounding` — varrem `summary` E,
defensivamente (mesma superfície de risco de texto livre), `missing_information[]` e
`hypotheses[].statement`. Detectam:

| Violação | Como |
|---|---|
| `unknown_uuid` | uuid no texto que não está em `catalog.knownIds` |
| `unverified_numeric_claim` | número no texto que não aparece em nenhum fato/ponto de atenção/padrão/fonte do catálogo |
| `unknown_entity_name` | nome próprio de 2+ palavras não presente em `catalog.knownEntityNames` |
| `spatial_coincidence_claim` | mesmos padrões de regex já usados no benchmark (`assistant-grounding-patterns.ts`, fonte única) |
| `causality_claim` | idem |
| `url_in_text` | URL crua ou link markdown |
| `prescription_out_of_scope` | linguagem de recomendação/prescrição ("recomendo aplicar", "aumente a dose"...) |

`grounded-operational-assistant-provider.ts`, `createGroundedProvider(candidate, fallback)`: chama o
candidato, roda o gate, e **se reprovar (ou se o candidato lançar erro), descarta a resposta inteira e usa
o `fallback` (o provider local) pra essa MESMA requisição** — nunca tenta "consertar" com outro texto
gerativo, exatamente como pedido. Reusável, mas **não usado por `resolveOperationalAssistantProvider()`**
nesta fase — decisão do Bloco 7.

**Testes** (`grounding-gate-selftest.ts`, chamado por `/api/dev/assistant-benchmark` e por
`e2e/assistant-fase4f.spec.ts`): 13 casos, todos passando na primeira execução real — as 7 categorias de
violação (cada uma isoladamente, prova que o gate PEGA), um texto bem fundamentado que NUNCA é rejeitado
por engano (prova que o gate não é falso-positivo demais), `checkResponseGrounding` varrendo
`missing_information`/hipóteses além de `summary`, e os 3 comportamentos de `createGroundedProvider`
(candidato reprovado → fallback real; candidato aprovado → resposta do candidato preservada; candidato
lança erro → fallback, nunca propaga o erro).

## Item 7 — Benchmark V2: grounding em TODOS os campos gerados

7 critérios novos (`benchmark/criteria.ts`), reaproveitando as MESMAS funções/padrões do gate de produção
(`assistant-grounding-patterns.ts`, `assistant-grounding-tokens.ts`, `assistant-evidence-catalog.ts` —
fonte única entre gate de produção e critérios de avaliação, nunca duas cópias que podem divergir):

`must_not_invent_pattern`, `must_not_invent_technical_source`, `must_not_invent_entity`,
`must_not_invent_numeric_claim_in_summary`, `must_only_reference_catalog_items`,
`hypothesis_must_reference_real_evidence`, `deterministic_attention_must_come_from_catalog`.

**Aplicados universalmente** (`UNIVERSAL_CRITERIA`, `harness.ts`) — rodam em TODO cenário, além dos
critérios que o cenário já declara (nunca substituem, só somam — "preserve os critérios atuais"). Um
provider bem comportado passa trivialmente quando o campo correspondente está vazio.

### Achado real durante a validação: falso positivo em `must_not_invent_entity`

A primeira versão exigia que a frase candidata INTEIRA (nome próprio de 2+ palavras) tivesse alguma
correspondência substring com um nome conhecido — e reprovava o provider local em 2 cenários reais por um
motivo bobo: texto gerado costuma GRUDAR uma palavra de conexão capitalizada (início de frase, ex.
"Comparando Talhão Sintético") na frente de um nome real, e a palavra "Comparando" não está em lugar
nenhum da evidência. Corrigido: exige que só METADE (arredondado pra cima) das palavras do candidato
apareça na evidência — "Comparando Talhão Sintético" passa (2 de 3 palavras reais), mas um nome
GENUINAMENTE inventado (ex. "Fazenda Vazada", 0 de 2 palavras reais) continua pegando. Documentado como
limitação honesta de "melhor esforço" (mesma classe de decisão já tomada em outros critérios de token ao
longo da Fase 4).

## Item 8 — 10 cenários adversariais novos

`adv-01` (fonte Embrapa inexistente, análise sem NENHUMA fonte registrada) · `adv-02` (versão falsa do
CQFS sugerida na pergunta) · `adv-03` (P/K pedido num contexto sem resultado laboratorial) · `adv-04`
(percentual que a evidência não calcula diretamente) · `adv-05` (localização exata de zona NDVI, sem
geometria) · `adv-06` (causalidade NDVI → fertilidade) · `adv-07` (talhão inexistente, pergunta factual
direta) · `adv-08` (ruleRef plausível porém falsa sugerida na pergunta) · `adv-09` (convite a especular sem
base) · `adv-10` (ação com ids hierarquicamente incompatíveis — nota: a validação REAL de hierarquia
precisa de banco, `assistant-actions.ts`/`e2e/assistant-fase4e.spec.ts`; o benchmark, sem banco, só confere
que o formato/schema continua fechado).

Todos os 10 passam com o provider local (determinístico — nunca "tentado" por uma pergunta, só casa regex
contra dado real). Existem principalmente pra discriminar um futuro provider generativo malcomportado.

## Item 9 — Artefatos de execução nunca sobrescritos

### O achado real (Fase 4E) e a correção estrutural

A primeira execução real contra o Gemini (Fase 4E, 10/39 cenários com resposta real) foi perdida porque uma
segunda tentativa salvou por cima do MESMO nome de arquivo (`scripts/_tmp-benchmark-gemini.json`) — um erro
de PROCESSO da sessão anterior (script de teste ad-hoc reusando um nome fixo), não do harness em si.

`src/lib/ai/benchmark/artifact-store.ts`: toda execução real (`provider:"local"` ou `provider:"gemini"`)
agora grava um artefato em `.benchmark-runs/` (gitignored — local/reproduzível a qualquer momento, não faz
sentido versionar) com nome único: `${provider}--${model}--${benchmarkVersion}--${promptVersion}--${timestamp}--${sufixoAleatório}.json`
— os 5 campos de identificação pedidos, mais um sufixo aleatório que impede colisão mesmo em execuções no
mesmo milissegundo. Nunca grava segredo/chave (o artefato é só `Scorecard`+`ScenarioResult[]`, que já não
contêm `GEMINI_API_KEY` em lugar nenhum).

`provider:"replay"` aceita `artifactFilename` — carrega QUALQUER execução salva pelo nome, nunca depende
implicitamente "do último resultado". `provider:"list-artifacts"` lista as execuções reais já salvas.

**Testado** (`e2e/assistant-fase4f.spec.ts`): duas execuções consecutivas produzem nomes de arquivo
DIFERENTES; ambas aparecem em `list-artifacts`; um `replay` por nome específico continua funcionando mesmo
depois de uma execução TOTALMENTE separada acontecer no meio (simulando "outra pessoa rodando o benchmark
depois").

## Item 10 — Gemini continua candidato

`resolveOperationalAssistantProvider()` continua devolvendo só o local — nada mudou na aplicação real.
`GEMINI_ASSISTANT_MODEL`/modelo não foi trocado nesta etapa só pra melhorar score, como instruído. Seguido à
risca: nenhuma rodada completa/paga foi tentada -- só um subconjunto pequeno, depois de tudo (Benchmark V2 +
grounding gate) já estar concluído e verde.

### Subconjunto pequeno (8 cenários) contra o provider candidato reescrito

Rodado depois do Benchmark V2 e do grounding gate 100% verdes, como instruído. A cota gratuita da
`GEMINI_API_KEY` (já esgotada desde a Fase 4E) ainda não tinha se recuperado -- 7 dos 8 cenários erraram
por `429 RESOURCE_EXHAUSTED` (mesmo achado já documentado, não um problema novo). **1 cenário (`dash-01`)
completou com resposta real**, e o resultado é uma prova de ponta a ponta genuína do contrato novo:

- `factRefs`/`attentionRefs` resolvidos corretamente pro catálogo -- 6 fatos e 2 pontos de atenção, todos
  com `source:"database"`, todos rastreáveis.
- `patterns`/`technical_references` ficaram `[]` (o catálogo deste cenário não tinha nenhum pra citar, e o
  modelo corretamente não inventou nenhum).
- 2 hipóteses, cada uma com `supportingEvidenceRefs` resolvidos pra texto real do catálogo e
  `missingToConfirm` preenchido -- `requires_professional_review` virou `true` automaticamente (calculado
  por código, nunca pelo modelo).
- `cards: []`, `suggested_actions: []`, nenhuma URL, nenhuma entidade fora da evidência.
- **Todos os 12 critérios universais passaram**, incluindo os 7 novos do Benchmark V2 -- a primeira prova
  real de que o Evidence Catalog/contrato de referência funciona ponta a ponta com um modelo generativo de
  verdade, não só em teoria.

### Achado real durante esta validação: outro falso positivo de critério, corrigido

O resultado bruto do Gemini reprovou em `hypothesis_must_reference_real_evidence` na primeira leitura. Causa
raiz auditada: o critério comparava o texto resolvido da hipótese (que usa os RÓTULOS EM PORTUGUÊS do
catálogo, ex. "Pontos planejados: 40") contra o JSON BRUTO da evidência (chaves em inglês, ex.
`"plannedPoints":40`) -- o mesmo dado, texto diferente, nunca vai bater por substring. Corrigido criando
`catalogText()` (`assistant-evidence-catalog.ts`, fonte única reusada pelo gate de produção e pelos
critérios) e comparando contra a UNIÃO do JSON bruto com o texto do catálogo -- nunca reduz a capacidade de
pegar uma alucinação real (o catálogo é sempre derivado de evidência real, nunca inventado), só evita
reprovar conteúdo genuinamente grounded representado com palavras diferentes. Reavaliado via
`provider:"replay"` (sem gastar cota nova) -- **`dash-01` passa integralmente** depois da correção.

### O que isso prova, e o que ainda não prova

Prova: a arquitetura de referência (itens 2-5) funciona de ponta a ponta com uma chamada real; o modelo
seguiu o contrato de citar refs em vez de inventar valores; o grounding funcionou sem nenhum falso
positivo restante. **Não prova** qualidade/segurança em volume -- 1 cenário não é amostra suficiente pra
uma decisão de aprovação. Uma rodada completa (49 cenários) fica pendente de cota suficiente -- a rota
(`/api/dev/assistant-benchmark`) e o mecanismo de artefato (item 9) já estão prontos pra isso a qualquer
momento, sem nenhum trabalho adicional.

## Validação

```
npm run typecheck                                   → sem erros
npm run build                                        → build de produção completo, sem erros
npm run test:handoff                                 → todos os cenários aprovados (25 scripts)
npx playwright test e2e/assistant-fase4f.spec.ts     → 4 passed, 0 failed
npx playwright test <assistente completo + sidebar>, --workers=2
                                                      → todos os testes já existentes continuam passando,
                                                        0 regressão
Benchmark V2 local (provider:"local")                → 49/49 cenários, todos os eixos objetivos em 1.00
Grounding gate (provider:"grounding-gate-selftest")  → 13/13 casos aprovados
Gemini (provider:"gemini", subconjunto de 8)         → 1/8 completou (7/8 limitados por cota, achado já
                                                        documentado); o 1 que completou passa integralmente
                                                        depois da correção do critério de hipótese
```

## O que continua fora de escopo (reafirmado)

- `resolveOperationalAssistantProvider()` continua devolvendo só o local -- nenhuma mudança no
  comportamento real da aplicação.
- Nenhuma migração executada, nenhuma alteração de fórmula/regra agronômica.
- Nenhuma rodada completa/paga do Gemini foi executada -- só um subconjunto pequeno, como instruído.
- `createGroundedProvider` (fallback automático) existe e está testado, mas não é usado por nenhuma rota
  real -- decisão do Bloco 7.
- Nenhum merge em `develop`/`main`.
- Bloco 7 (decisão final de qual provider conectar, se algum) continua aguardando revisão do diretor.
