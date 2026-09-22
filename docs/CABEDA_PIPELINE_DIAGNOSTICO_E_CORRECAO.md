# Diagnóstico e correção — pipeline LAUDO → INTERPRETAÇÃO → REVISÃO → RECOMENDAÇÃO → RELATÓRIO

Auditoria disparada por um bloqueador comercial real reportado pelo diretor em 2026-09-11: as 3 análises
reais do Rafael Cabeda (AN-CABEDA-01/02/03) e a safra do Talhão 3/Fazenda Bela Vista apareciam como
"impossível interpretar" em `/inteligencia`. Não é Fase 5 — é fechamento do fluxo principal antes de
qualquer nova fase. Branch: sem migração de schema (só correção de dado + código já existente).

## 1. Causa raiz exata

**Nenhum parâmetro de nenhuma cultura no banco inteiro estava `ACTIVE`.** Não é um problema específico do
Cabeda nem da Soja — é estrutural: `crop_profile_parameters` tinha 100% das linhas em `DRAFT`, para as 53
culturas cadastradas no catálogo (Soja, Milho, Trigo, Videira, Citros, etc.). O mecanismo de homologação
(`setCropProfileParameterStatus`, `activateAllCropProfileParameters`) existe, funciona e é testado (inclusive
um teste e2e que homologa e reverte) — mas nunca tinha sido executado de propósito, de verdade, pra nenhuma
cultura.

`interpretOne` (`src/domain/agronomic-engine.ts:257`) só considera parâmetros com `status === "ACTIVE"`:

```ts
const codeMatches = cropProfile.parameters.filter((param) => param.parameterCode === result.parameterCode && param.status === "ACTIVE");
if (codeMatches.length === 0) {
  return { ...base, interpretable: false, reason: `O perfil "${cropProfile.name}" não tem um parâmetro homologado para ${result.parameterCode}.`, code: "PARAMETER_NOT_IN_PROFILE" };
}
```

Com **todos** os 16 parâmetros de cada análise devolvendo `PARAMETER_NOT_IN_PROFILE`, e
`runInterpretationForAnalysis` (`src/lib/repositories/interpretations.ts:80`) gravando só
`engineResult.pendencies[0]` como `not_interpretable_reason`:

```ts
const notInterpretableReason = engineResult.interpretable ? null : (engineResult.pendencies[0] ?? "...");
```

...e a query de `lab_results` (mesmo arquivo, linha 64) ordenando por `ls.laboratory_code, lr.parameter_code`
— **AL** apareceu como `pendencies[0]` só porque é o primeiro em ordem alfabética entre os 16 parâmetros do
laudo, não porque é o problema real. Os outros 15 parâmetros (incluindo P/K/Ca/Mg, que tinham faixa
verificada e pronta) estavam igualmente bloqueados, escondidos atrás dessa única mensagem.

A hipótese do diretor (item 2 do pedido) estava certa quanto ao mecanismo (`status === "ACTIVE"` /
`pendencies[0]` / ordenação alfabética) — só era mais ampla do que "efeito colateral do
`seed-soja-cqfs-2016.mjs`": os parâmetros da Soja nasceram `DRAFT` de propósito (é assim que
`seed-soja-cqfs-2016.mjs` foi desenhado — "TUDO aqui nasce DRAFT... nenhuma análise real é afetada até um
agrônomo responsável revisar e promover para ACTIVE", comentário já existente no próprio script) e nunca
foram promovidos depois. O `DELETE` que o script faz antes de reinserir não reverteu nada que estivesse
`ACTIVE` — confirmado que não havia nenhum parâmetro `ACTIVE` em NENHUMA cultura antes desta auditoria.

## 2. Tabela por parâmetro — AN-CABEDA-01 (Área 01, 8 pontos × 16 parâmetros = 128 resultados)

| Parâmetro | Método (laboratório) | Unidade (laboratório) | Faixa CQFS-RS/SC 2016? | Grupo | Situação final |
|---|---|---|---|---|---|
| CA | KCl 1 mol/L | cmolc/dm³ | Sim (Tabela 6.11, p.97) | A | **ACTIVE** — 8/8 classificados |
| MG | KCl 1 mol/L | cmolc/dm³ | Sim (Tabela 6.11, p.97) | A | **ACTIVE** — 8/8 classificados |
| MO | Oxidação sulfocrômica | % | Sim (Tabela 6.1, p.91) | A | **ACTIVE** — 8/8 classificados |
| CU | Mehlich-1 | mg/dm³ | Sim (Tabela 6.12, p.98) | A | **ACTIVE** — 8/8 classificados |
| ZN | Mehlich-1 | mg/dm³ | Sim (Tabela 6.12, p.98) | A | **ACTIVE** — 8/8 classificados |
| K | Mehlich-1 | mg/L → **mg/dm³** | Sim (Tabela 6.9, p.95-96, por classe de CTC) | A | **ACTIVE** — 8/8 classificados |
| P | Mehlich-1 | mg/L → **mg/dm³** | Sim (Tabela 6.4, p.93, por classe de argila) | A | **ACTIVE** — 8/8 classificados |
| CTC | "Calculado: Ca+Mg+K+(H+Al)" → **"Calculado: CTCpH7,0 = Ca + Mg + K + (H+Al)"** | cmolc/dm³ | Sim (Tabela 6.1, p.91) | B | Método corrigido, **DRAFT** — pendente de revisão do agrônomo |
| S | "Turbidimetria" → **"Ca(H2PO4)2 500mg P/L, turbidimetria"** | mg/dm³ | Sim (Tabela 6.11, p.97, soja=leguminosa) | B | Método corrigido, **DRAFT** — pendente de revisão |
| B | "Água quente" → **"Água quente, colorimetria com curcumina"** | mg/dm³ | Sim (Tabela 6.12, p.98) | B | Método corrigido, **DRAFT** — pendente de revisão |
| MN | "KCl 1 mol/L" → **"KCl 1 mol/L (acidificado com HCl 2%)"** | mg/dm³ | Sim (Tabela 6.12, p.98) | B | Método corrigido, **DRAFT** — pendente de revisão |
| AL | KCl 1 mol/L | cmolc/dm³ | **Não** (edição 2016 não usa faixa estática) | D | Sem faixa — `PARAMETER_NOT_IN_PROFILE`, legítimo |
| PH | H2O | (índice) | **Não** (2016 usa SMP+dose direta, não faixa de pH) | D | Sem faixa — legítimo |
| SMP | Índice SMP | (índice) | **Não** (insumo do cálculo de calagem, não um alvo de classificação) | D | Sem faixa — legítimo |
| H_AL | SMP | cmolc/dm³ | **Não** (não classificável isoladamente, só como parte de CTC/V%) | D | Sem faixa — legítimo |
| CLAY | Densímetro | % | Não é um alvo de classificação (é só a CONDIÇÃO usada por P) | D | Sem faixa própria — esperado por design |

AN-CABEDA-02 e AN-CABEDA-03 (4 pontos cada, Áreas 02/03) têm exatamente o mesmo quadro por parâmetro —
só a contagem de linhas muda (4 pontos × 16 = 64 resultados cada).

### Contagem real por análise

| Análise | Resultados totais | Interpretáveis (Grupo A) | Não interpretáveis | Status final da interpretação |
|---|---|---|---|---|
| AN-CABEDA-01 | 128 | **56** (43,75%) | 72 | `IN_REVIEW` → aprovada nesta auditoria → `APPROVED` |
| AN-CABEDA-02 | 64 | **28** (43,75%) | 36 | `IN_REVIEW` |
| AN-CABEDA-03 | 64 | **28** (43,75%) | 36 | `IN_REVIEW` |

Reproduzível com `node --experimental-strip-types --env-file=.env scripts/diagnose-cabeda.mjs` (read-only,
imprime o diagnóstico completo por análise/parâmetro/amostra, incluindo o código exato devolvido pelo motor
para cada resultado não interpretável) e verificado com asserções em
`npm run test:cabeda-acceptance` (`scripts/acceptance-cabeda.mjs`).

## 3. Hipótese confirmada no banco (item 2 do pedido)

Confirmado, não suposto:

- `runAgronomicEngine` (`agronomic-engine.ts:257`) só considera `status === "ACTIVE"` — **confirmado no
  código**.
- `crop_profile_parameters` da Soja: **17 linhas, todas `DRAFT`**, antes desta correção (consulta direta ao
  banco, 2026-09-11).
- **Achado mais amplo que a hipótese original**: não só a Soja — as **53 culturas do catálogo inteiro**
  tinham 100% dos parâmetros `DRAFT`. O `DELETE` de `seed-soja-cqfs-2016.mjs` não é a causa de nada ter sido
  revertido — não havia nada `ACTIVE` pra reverter.
- `runInterpretationForAnalysis` grava só `pendencies[0]` — **confirmado no código**
  (`interpretations.ts:80`).
- Resultados ordenados por `parameter_code` — **confirmado no código** (`interpretations.ts:64`,
  `ORDER BY ls.laboratory_code, lr.parameter_code`) — AL é alfabeticamente o primeiro entre os 16 parâmetros
  do laudo Cabeda, por isso aparecia como a única pendência visível.

## 4. Classificação em grupos (item 3 do pedido) e o que foi feito

**Grupo A — tecnicamente verificados e prontos para `ACTIVE`** (método e unidade batem exatamente com o
cadastro, faixa já verificada contra o PDF oficial CQFS-RS/SC 2016 na criação do cadastro, com tabela/página
citadas em `technical_notes`): **CA, MG, MO, CU, ZN, K, P** (13 linhas de `crop_profile_parameters`, contando
as 4 faixas condicionais de K por classe de CTC e as 4 de P por classe de argila). **Homologados para
`ACTIVE` nesta auditoria**, com autorização explícita do diretor, via `scripts/homologate-soja-cqfs-2016-group-a.mjs`
— mesmo efeito que um curador clicando "homologar" na Biblioteca Técnica, auditado em `audit_events`.

**Grupo B — tecnicamente válidos, mas com incompatibilidade de nomenclatura de método** (a faixa em si nunca
foi questionada — só o texto do método que o laboratório escreveu no laudo não batia, caractere por
caractere, com o texto homologado): **CTC, S, B, MN**. Corrigido na NORMALIZAÇÃO/importação (item 4 abaixo),
nunca no motor. **`status` continua `DRAFT`** — a correção de nomenclatura não é uma homologação; a decisão
de promover essas 4 pra `ACTIVE` continua exigindo um agrônomo responsável revisar a faixa em si (não fiz
essa promoção — só corrigi o texto do método pra que, quando um agrônomo revisar e homologar, o resultado
real do Cabeda já bata sem mais fricção).

**Grupo C — não classificáveis isoladamente pelo modelo atual**: nenhum caiu aqui além do que já está no
Grupo D — o motor não tem hoje um conceito de "classificação combinada" (ex.: V%/m% como critério auxiliar
de decisão de calagem) que pudesse tornar AL/PH/SMP classificável com mais trabalho de engenharia; ficam
como Grupo D mesmo.

**Grupo D — sem fonte suficiente / realmente pendentes**: **AL, PH, SMP, H_AL** (mais CLAY, que nunca foi
pra ser um alvo de classificação, só uma condição). Nenhuma faixa estática existe pra esses 4 na edição 2016
do Manual CQFS-RS/SC — confirmado no próprio comentário de `seed-soja-cqfs-2016.mjs`, escrito na criação do
cadastro: a partir de 2016 o manual usa índice SMP + pH de referência por cultura pra calcular a dose de
calcário diretamente (Tabela 5.2), tratando V%/m% como critério AUXILIAR de decisão, não como faixa. Isso
exige lógica de CÁLCULO (like `DERIVED_PARAMETER_FUNCTIONS`), não uma faixa estática — fica registrado como
pendência real de engenharia futura, **não implementado nesta auditoria** (não inventei uma faixa fixa pra
substituir um cálculo que a fonte oficial não usa mais).

## 5. Importador do Cabeda — incompatibilidades corrigidas (item 4 do pedido)

Auditoria de `scripts/import-cabeda-solo-2026.mjs` contra `crop_profile_parameters` confirmou exatamente as
suspeitas do diretor:

- **CTC**: laboratório grava `"Calculado: Ca+Mg+K+(H+Al)"`; perfil homologado espera
  `"Calculado: CTCpH7,0 = Ca + Mg + K + (H+Al)"`. Mesma fórmula, notação abreviada.
- **S**: laboratório grava `"Turbidimetria"` (só a etapa de leitura); perfil espera
  `"Ca(H2PO4)2 500mg P/L, turbidimetria"` (extrator + leitura). Mesmo método, nome incompleto.
- **P/K**: laboratório grava unidade `"mg/L"`; perfil espera `"mg/dm³"`. **Não é uma incompatibilidade real**
  — 1 L = 1 dm³ exatamente, é a mesma grandeza física, só rótulo diferente. Normalizado por consistência,
  nenhuma conversão de valor.
- **AL / PH / SMP / H_AL**: confirmado que são, respectivamente, um parâmetro sem faixa estática nesta
  edição (AL), um índice/insumo de cálculo (PH, SMP) e um componente parcial da CTC (H_AL) — nenhum dos 4 é
  um alvo de classificação isolada no manual oficial. Não são "faltando homologar", são "não classificáveis
  isoladamente" por desenho da própria fonte técnica.

**Camada de normalização criada** (`src/domain/lab-method-normalization.ts`) — tradução de nome de método
NA INGESTÃO, nunca dentro do motor (`agronomic-engine.ts` continua fazendo só comparação exata de string, de
propósito — nenhuma correspondência frouxa dentro da regra agronômica). Cada entrada é uma correção AUDITADA
com o motivo documentado (mesma técnica, nome diferente — nunca uma equivalência suposta). Ligada em dois
lugares:

1. `src/domain/lab-import.ts` (o importador REAL usado por qualquer cliente via `/api/import/*`) — um
   laboratório futuro que escreva "Turbidimetria" em vez do nome completo já é traduzido automaticamente,
   com aviso (`METHOD_INFERRED`) pro usuário conferir.
2. `scripts/import-cabeda-solo-2026.mjs` — corrigido na fonte pra nascer certo se algum dia for reexecutado
   do zero.

Como os dados do Cabeda já tinham sido importados ANTES desta correção existir, rodei uma correção de dado
única (não migração de schema) — `scripts/fix-cabeda-analytical-methods.mjs` — que corrigiu 64 linhas de
método (16 amostras × 4 parâmetros) e 32 linhas de unidade (16 × 2), preservando o texto exatamente como
importado em `original_payload.rawMethod`/`rawUnit` (rastreabilidade completa, nada foi perdido).

## 6. Correção da tela de Inteligência (item 5 do pedido)

Antes: `agronomic-intelligence-panel.tsx` mostrava só `latest.notInterpretableReason` (a 1ª pendência, quando
existia) e a fila (`/inteligencia`) mostrava a mesma coisa num card compacto — nenhuma contagem, nenhuma
distinção entre impedimento global e por parâmetro.

Depois (dado já existia em `structuredOutput.interpretation`, uma linha por ponto×parâmetro — só nunca tinha
sido agregado nem mostrado):

- **Painel da análise**: nova faixa de resumo — `"0 de 128 resultados interpretados"` (bloqueio total,
  tom de alerta), `"Interpretação parcial — 28/64 resultados cobertos"` (cobertura parcial, tom de espera) ou
  `"64/64 resultados interpretados"` (cobertura total, tom de sucesso) — sempre com números reais, nunca
  hardcode. Botão **"Ver todos os impedimentos (N)"** abre uma lista agrupada por `(código do motor,
  parâmetro)` com contagem real, ex. `"4× PARAMETER_NOT_IN_PROFILE — AL: O perfil "Soja" não tem um
  parâmetro homologado para AL."` — sem duplicar 8× a mesma linha por amostra.
- **Distinção impedimento global × por parâmetro**: `NO_CROP_PROFILE` (a safra inteira não tem perfil
  vinculado) é destacado separadamente como **"Impedimento global"**; todo o resto (`PARAMETER_NOT_IN_PROFILE`,
  `METHOD_NOT_SUPPORTED`, etc.) é listado como impedimento por parâmetro — nunca misturados.
- **Fila de Inteligência** (`/inteligencia`): card de cada análise agora mostra a contagem real
  (`getIntelligenceQueue`, SQL nova conta `jsonb_array_length`/`jsonb_array_elements` sobre o mesmo
  `structured_output` já gravado, sem coluna nova) — bloqueada mostra `"0 de N resultados interpretados —
  <motivo>"`, parcial mostra `"Interpretação parcial — X/N resultados cobertos"`.
- **Bucket da fila (`interpretationQueueBucket`) não precisou mudar** — já estava correto por desenho: só
  vira `BLOQUEADA` quando `status === "CALCULATED"` (motor achou ZERO parâmetro interpretável); assim que
  pelo menos 1 parâmetro classifica, `runInterpretationForAnalysis` já grava `status: "IN_REVIEW"` e a
  análise sai do bucket "bloqueada" — o problema nunca foi o agrupamento por bucket, era só a mensagem
  dentro dele mostrar uma única pendência sem contexto.

Validado visualmente (screenshot, `/analises/AN-CABEDA-03`, depois de "Ver todos os impedimentos"): mostra
"Interpretação parcial — 28/64 resultados cobertos." e a lista completa das 9 pendências agrupadas com
contagem real (4× cada, já que a análise tem 4 amostras).

## 7. Bela Vista / Talhão 3 (item 7 do pedido)

Investigado separadamente. Estado antes da correção:

```
current_crop: "Soja"
next_crop: null
crop_profile_id: null
```

Cultura **conhecida** (`current_crop = "Soja"`, texto exato igual ao `code` do perfil já cadastrado) — a
safra só não estava vinculada ao perfil técnico correspondente, apesar dele existir. Vinculação feita
(`scripts/link-bela-vista-crop-profile.mjs`, update cirúrgico só na coluna `crop_profile_id`, auditado). As
3 análises hoje associadas a essa safra (`AN-2026-80DD57`, `AN-2026-630A73`, `AN-2026-184122`) **não têm
nenhum `lab_result` persistido ainda** (são fixtures usadas por outras suítes de teste desta sessão, focadas
em fluxo de coleta/import, não em laudo completo) — por isso não há uma reinterpretação real pra rodar
aqui ainda; a vinculação garante que, quando um laudo de verdade for importado pra este talhão, o motor já
encontra o perfil certo sem mais um bloqueio de "safra sem cultura vinculada".

## 8. Recomendação/Prescrição — lacuna de governança real encontrada e corrigida (item 8 do pedido)

Auditoria de `/api/analyses/[id]/agronomic-prescription` (`POST`) encontrou exatamente o que o diretor
suspeitava: a rota conferia (1) papel do usuário, (2) limite mensal de prescrições, (3) se existe QUALQUER
`lab_result` — mas **nunca conferia se a interpretação determinística chegou a classificar alguma coisa**.
`buildAgronomicPrescriptionEvidencePackage` manda pra IA o `numeric_value` CRU do laboratório, sem passar
pela classificação/homologação — ou seja, era possível pedir (e a IA tentar responder) uma "prescrição
assistida" pra um laudo cuja interpretação nunca rodou, ou rodou e não achou nenhum parâmetro interpretável
(exatamente o estado em que as 3 análises do Cabeda estavam antes desta correção).

**Gate corrigido** (`src/app/api/analyses/[id]/agronomic-prescription/route.ts`): a rota agora busca a
interpretação mais recente ANTES de chamar o provider e recusa com `409` quando ela não existe ou está em
`CALCULATED` (zero parâmetro interpretável) — só permite seguir quando `status` é `IN_REVIEW` ou `APPROVED`
(pelo menos um parâmetro classificado de verdade). Fluxo correto ficou:

```
interpretação válida (≥1 parâmetro classificado, IN_REVIEW/APPROVED)
  → revisão profissional (reviewInterpretation, já existia)
  → prescrição/recomendação assistida (agronomic-prescription, gate novo aqui)
  → revisão/aprovação da prescrição (reviewAgronomicPrescription, já existia)
  → recomendação oficial (promovida pra input_recommendations só se APPROVED, já existia)
```

Validado contra AN-CABEDA-01 real: depois de aprovar a interpretação, o `POST` de prescrição passou do gate
(não foi mais recusado por falta de interpretação válida) — devolveu `502` por um problema SEPARADO e
pré-existente (o provider Gemini de prescrição devolveu um formato que o parser não reconheceu, "nada foi
salvo" — falha segura, sem inventar prescrição, mas é uma lacuna de infraestrutura distinta que fica
registrada aqui e **não foi corrigida nesta auditoria** por estar fora do escopo do bloqueador de
interpretação).

## 9. Relatórios (item 9 do pedido)

`interpretation.status = APPROVED` continua obrigatório pra publicar (preservado, nenhuma mudança). Validado
o fluxo completo em dev, contra AN-CABEDA-01 real, autenticado como `admin@raiz.local`:

1. Interpretação (revisão #3, `IN_REVIEW`) → aprovada via `POST /api/interpretations/{id}/review
   {approve:true}` → `200`, `status: "APPROVED"`.
2. Relatório publicado via `POST /api/interpretations/{id}/publish-report` → `201`, novo registro em
   `reports` com `storageKey` e hash (`sha256`) gravados.
3. `/relatorios/talhao/{analysisId}` → `200`, conteúdo confirmado mostrando **"Rafael Cabeda"** e
   **"Área 01"/"AN-CABEDA-01"** reais — a leitura do relatório publicado só mostra o snapshot quando o hash
   recalculado bate com o gravado (`hashVerified`, fail-closed já existente, preservado) — a página abriu
   normal, prova indireta de que o hash bateu (um hash divergente teria bloqueado o conteúdo, comportamento
   já testado em `e2e/fase3-cockpit-and-reports.spec.ts`).

Nenhuma publicação automática pra produção fora deste dev — a aprovação acima foi a revisão humana pedida
pelo diretor pra validar o fluxo, na mesma conta que ele usa.

## 10. Pipeline de automação — desenho (item 10, só documentação, não implementado)

```
IMPORTAÇÃO (import real ou script ad hoc, sempre com normalização de método/unidade na ingestão)
  ↓
VALIDAÇÃO DA INGESTÃO (blockers/warnings já existentes em lab-import.ts -- amostra/parâmetro/valor/unidade/
  método ausentes ou não reconhecidos bloqueiam antes de persistir; unidade/método inferido vira warning)
  ↓
READINESS CHECK (a safra tem crop_profile_id? existe pelo menos 1 lab_result persistido?)
  ↓
INTERPRETAÇÃO DETERMINÍSTICA AUTOMÁTICA (runAgronomicEngine -- já roda sob demanda via botão "Rodar motor
  determinístico"; candidato natural a rodar automaticamente logo após uma importação bem-sucedida, hoje é
  manual -- ver observação abaixo)
  ↓
SE totalmente BLOQUEADA (0 parâmetros interpretáveis) → fila técnica com TODOS os motivos agrupados
  (item 5, já entregue) -- alguém (curador/agrônomo) revisa o cadastro de parâmetro/normalização
  ↓
SE parcial ou totalmente INTERPRETÁVEL → status IN_REVIEW, aparece em "Calculada, aguardando revisão"
  ↓
REVISÃO PROFISSIONAL (reviewInterpretation, gate humano preservado)
  ↓
APÓS APROVAÇÃO → relatório disponível/publicável (publishFieldAnalysisReport, gate humano preservado)
  E → prescrição/recomendação assistida (gate novo do item 8, exige interpretação IN_REVIEW/APPROVED)
      → revisão/aprovação da prescrição (reviewAgronomicPrescription, gate humano preservado)
```

**Não implementado nesta auditoria** (deliberadamente, escopo desta entrega é o bloqueador de
interpretação, não uma automação de pipeline nova): disparar `runInterpretationForAnalysis` automaticamente
logo após uma importação persistir resultados, em vez de exigir o clique manual em "Rodar motor
determinístico". É uma mudança pequena e segura de se fazer depois (a interpretação já é 100%
determinística e sempre resultou em `CALCULATED`/`IN_REVIEW`, nunca em algo que precise de confirmação antes
de calcular) — registrado aqui como candidato natural pra uma próxima entrega, não decidido/feito agora.

## 11. Teste de aceitação (item 11 do pedido)

`scripts/acceptance-cabeda.mjs` (`npm run test:cabeda-acceptance`) — read-only, contra o banco real, com
asserções (não só prints):

```
AN-CABEDA-01: OK -- 56/128 interpretados, 9 pendências (todas esperadas).
AN-CABEDA-02: OK -- 28/64 interpretados, 9 pendências (todas esperadas).
AN-CABEDA-03: OK -- 28/64 interpretados, 9 pendências (todas esperadas).

OK -- todas as asserções passaram.
```

Confere: os 7 parâmetros do Grupo A continuam `ACTIVE`; a contagem exata de interpretados/total por análise;
que TODO item interpretável é de fato um dos 7 códigos do Grupo A (nunca um código fora da homologação
aprovada classificando por acidente); que toda pendência restante é uma das 9 esperadas (nunca uma pendência
nova/inesperada, o que pegaria uma regressão futura); e um sanity check manual da regra de Cálcio (`Ca ≥
4,0 cmolc/dm³ → "Alto"`, Tabela 6.11 p.97) contra os valores reais de cada ponto Cabeda que classificou
"Alto" — nenhum caiu fora da faixa.

`scripts/diagnose-cabeda.mjs` (`node --experimental-strip-types --env-file=.env scripts/diagnose-cabeda.mjs`)
continua disponível pra reexecutar o diagnóstico completo por análise/parâmetro/amostra a qualquer momento
(read-only).

## 12. Nada mascarado (item 12)

- **AL, PH, SMP, H_AL continuam sem classificação** — não inventei faixa nenhuma pra essas 4. A causa é
  legítima (a edição 2016 do CQFS-RS/SC não usa mais faixa estática pra elas) e fica registrada como
  pendência real de engenharia futura (item 4/Grupo D acima), não escondida.
- **CTC/S/B/MN continuam `DRAFT`** — corrigi só a nomenclatura de método (rastreável, auditado), nunca
  promovi o status. A decisão de homologar essas 4 continua sendo de um agrônomo responsável.
- **A falha de `502` na prescrição por IA (item 8) não foi consertada** — é uma lacuna de infraestrutura
  pré-existente e separada, registrada honestamente, não escondida atrás do sucesso do gate.
- Nenhuma classificação foi forçada a bater — os 7 parâmetros do Grupo A classificaram porque o método e a
  unidade batiam exatamente e a faixa já estava verificada contra a fonte oficial ANTES desta auditoria (na
  criação do cadastro, 2026-09-04) — esta auditoria só destravou o que já estava certo, não criou regra nova.

## Resumo executivo

| # | O que | Onde |
|---|---|---|
| 1 | Causa raiz: nenhum crop_profile_parameter `ACTIVE` em nenhuma cultura + UI mostrando só `pendencies[0]` | confirmado, não corrigido sozinho (ver #2/#5) |
| 2 | 7 parâmetros da Soja homologados p/ `ACTIVE` (Grupo A, autorizado pelo diretor) | `scripts/homologate-soja-cqfs-2016-group-a.mjs` |
| 3 | Normalização de método na ingestão (CTC/S/B/MN) + backfill dos dados já importados | `src/domain/lab-method-normalization.ts`, `src/domain/lab-import.ts`, `scripts/fix-cabeda-analytical-methods.mjs` |
| 4 | Talhão 3/Bela Vista vinculado ao perfil Soja | `scripts/link-bela-vista-crop-profile.mjs` |
| 5 | Tela de Inteligência mostra contagem real + impedimentos agrupados + distinção global/parâmetro | `agronomic-intelligence-panel.tsx`, `inteligencia/page.tsx`, `interpretations.ts` |
| 6 | Gate de governança: prescrição exige interpretação válida | `agronomic-prescription/route.ts` |
| 7 | 3 análises reais reinterpretadas com sucesso (56/128, 28/64, 28/64) | `scripts/reinterpret-cabeda.mjs` |
| 8 | Fluxo completo validado até relatório publicado com hash íntegro | `scripts/validate-cabeda-report-flow.mjs` |
| 9 | Teste de aceitação reproduzível | `scripts/acceptance-cabeda.mjs` / `npm run test:cabeda-acceptance` |

**Nenhuma Fase 5 iniciada. Nenhum merge feito.**
