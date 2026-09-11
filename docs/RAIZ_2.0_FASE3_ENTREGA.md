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

## Fechamento técnico (pós-entrega, mesma branch, sem merge)

O diretor encontrou uma inconsistência real no Bloco B e pediu dois ajustes antes de avançar pra Fase 4.
Os dois foram corrigidos nesta mesma branch, sem alterar fórmulas/faixas agronômicas, sem homologar
regra nova, sem migração e sem merge/deploy.

### 1. "Padrão espacial" corrigido para "predominância observada"

`src/domain/parameter-patterns.ts` (renomeado para `src/domain/parameter-predominance.ts`,
`computeSpatialPatterns`→`computeParameterPredominance`, `SpatialPattern`→`ParameterPredominance`) nunca
leu coordenada, proximidade, vizinhança ou qualquer geometria — era puramente uma contagem/proporção de
classificação entre os pontos já classificados de uma coleta. Chamar isso de "padrão espacial" na UI era
uma afirmação que o algoritmo não sustentava. Corrigido:

- **Semântica**: categoria 3 do cockpit agora fala em "predominância de classificação observada" — nunca
  mais "padrão espacial". Exemplo real de texto: "P em 6 de 8 pontos avaliados desta coleta", nunca
  "Padrão espacial de P baixo".
- **Divergência real entre texto e algoritmo, corrigida**: a UI dizia "pelo menos 3 pontos com a mesma
  classificação", mas a regra antiga (`MIN_OBSERVATIONS=3` + `MIN_SHARE=0.6`) permitia reportar com só 2
  de 3 concordando (66,7% ≥ 60%). Regra nova, simples e explícita, documentada no topo do arquivo: só é
  reportada predominância quando a mesma classificação aparece (a) em **mais da metade** dos pontos
  avaliados do parâmetro (maioria real, não pluralidade) **e** (b) em **pelo menos 3 pontos** — as duas
  condições juntas, nunca uma sozinha. Nenhuma significância estatística é atribuída; é só contagem e
  proporção, rotuladas como tal.
- **Documentado explicitamente** (no cabeçalho do arquivo) que um padrão espacial de verdade exigiria
  geometria real dos pontos, uma definição de vizinhança e um método espacial validado (ex.:
  autocorrelação espacial/Moran's I, interpolação geoestatística com variograma) — nada disso implementado
  aqui, e nada disso foi improvisado nesta correção.
- **Teste novo**: `scripts/test-parameter-predominance.mjs` (`npm run test:predominance`, incluído em
  `npm run test:handoff`) — 9 cenários, incluindo a prova central pedida: dois pontos com coordenadas
  reais a mais de 2.500 km de distância um do outro produzem **exatamente o mesmo resultado** que dois
  pontos vizinhos com a mesma classificação — porque o algoritmo nunca lê esses campos — e o objeto de
  saída nunca carrega `latitude`/`longitude`/`distance`/`geometry`/`neighbor`/`spatial`. Também prova que
  "2 de 3" concordando (a divergência real encontrada) não é mais reportado.

### 2. Relatório publicado: "Versão atual" × "Versão publicada" (snapshot real)

Investigado antes de implementar: `saveReportSnapshot`/`readRawStoredFile` (`src/lib/storage.ts`) já
gravam e conseguem ler de volta o arquivo do snapshot quando `STORAGE_PROVIDER=local` (padrão desta
instância de dev, confirmado em `.env`). O que faltava era `getFieldAnalysisReportData` (e a tela) usar
essa leitura de volta — implementado, **sem nova migração**, reaproveitando a mesma tabela `reports` e a
mesma coluna `storage_key`/`sha256` já existentes:

- **`getPublishedReportSnapshot`** (novo, `src/lib/repositories/reports.ts`): busca o `reports` mais
  recente da análise, lê o arquivo real do storage, **recalcula o hash SHA-256 e verifica contra
  `reports.sha256`** (prova de integridade real, não presumida), e devolve o conteúdo exatamente como
  gravado — nunca reconstruído a partir da interpretação atual. Quando o arquivo não pode ser lido (outro
  `STORAGE_PROVIDER` não implementado, ou arquivo removido), devolve um `readError` explícito — nunca
  finge sucesso nem mostra o dado atual disfarçado de publicado.
- **Alternância real na tela** (`/relatorios/talhao/[analysisId]?versao=publicada`): "Versão atual" (como
  antes) e "Versão publicada", que só aparece habilitada quando o snapshot foi lido e verificado de
  verdade. A versão publicada mostra os dados que **de fato estavam no snapshot** (parâmetros
  laboratoriais, classificações, confiabilidade/base técnica — tudo vem de `interpretations.structured_output`,
  que é o que o publish grava) e marca com uma nota explícita as seções que **não** faziam parte do
  snapshot gravado (pontos/GPS, mapa, narrativa/prescrição de IA, comparação de insumo — esses vivem em
  outras tabelas, nunca capturados no momento do publish) — nunca mostra essas seções com dado atual como
  se fossem parte do documento imutável.
- **Hash/versionamento preservados**: nenhuma coluna nova, nenhuma migração — só leitura do que já existia.
- **Teste novo (e2e)**: `e2e/fase3-cockpit-and-reports.spec.ts` — monta um publish real (escreve o
  snapshot no mesmo caminho que `saveReportSnapshot` usaria, insere a linha real em `reports` apontando
  pra uma interpretação real já existente — nenhuma regra agronômica homologada por este teste), abre a
  tela real com `?versao=publicada`, confirma que o conteúdo de teste (marcado com código exclusivo)
  aparece e que "hash verificado, conteúdo íntegro" é mostrado, e limpa tudo ao final (linha `reports` e
  arquivo removidos — sem resíduo no banco/storage de dev compartilhado).

**Nenhuma infraestrutura faltou** pra este item — `STORAGE_PROVIDER=local` (o padrão de dev) já grava e
lê de verdade; a limitação real que permanece é só sobre **outros** provedores de storage (S3 etc.), que
`src/lib/storage.ts` ainda não implementa — nesse caso `getPublishedReportSnapshot` devolve `readError`
explícito, nunca dado inventado.

---

## Segundo fechamento técnico (ainda pós-entrega, mesma branch, sem merge)

O diretor revisou o primeiro fechamento e pediu mais 4 ajustes antes da Fase 4: fail closed na integridade
do snapshot, reprodutibilidade completa do documento (não só a interpretação), auditoria do storage de
produção, e testes específicos pra cada um. Nenhuma fórmula agronômica alterada, nenhuma regra
homologada, nenhuma migração executada, nenhum merge/deploy.

### 1. Integridade do snapshot — fail closed

Achado real do diretor: a tela abria "Versão publicada" sempre que `snapshot != null`, mesmo com
`hashVerified === false` — um hash divergente (arquivo adulterado/corrompido depois do publish) ainda
conseguia aparecer na tela como se fosse o documento oficial. Corrigido em duas camadas:

- **No repositório** (`getPublishedReportSnapshot`, `src/lib/repositories/reports.ts`): agora é a ÚNICA
  fonte de verdade sobre integridade. Quando o hash recalculado não bate com `reports.sha256`, a função
  devolve `snapshot: null` (mesmo tendo lido e conseguido fazer `JSON.parse` do arquivo com sucesso) — o
  conteúdo nunca sai do repositório pra quem chama usar "mesmo assim".
- **Na tela** (`/relatorios/talhao/[analysisId]`): `canShowPublishedView` agora exige explicitamente
  `snapshot != null && hashVerified === true` (antes só checava `snapshot != null`). Quando a integridade
  falha: (a) o conteúdo NUNCA é renderizado como oficial — a tela cai pra "Versão atual" de propósito; (b)
  um erro de integridade explícito aparece, **sempre visível** (não escondido atrás de nenhuma aba,
  aparece mesmo na aba "Versão atual"), com o prefixo do hash gravado pra conferência; (c) nunca é um
  fallback silencioso — o aviso é a primeira coisa visível na tela; (d) o botão "Exportar PDF" some
  enquanto a versão publicada solicitada estiver com integridade falha, pra nunca gerar um PDF rotulado
  como oficial a partir de conteúdo que não bateu no hash; (e) o toggle mostra "Versão publicada
  (integridade falhou)", nunca fica marcado como aba ativa.
- **Bug real encontrado testando esta correção**: `data.isShowingPublishedVersion` (o booleano que decide
  se a "Situação" mostra "Publicado") só comparava se `reports.interpretation_id` batia com a interpretação
  atual — nunca checou integridade. Resultado: mesmo com a integridade falhando e a tela caindo pra
  "Versão atual", a "Situação" continuava dizendo "Publicado" (porque a linha de `reports` realmente
  apontava pra revisão atual, só o ARQUIVO é que estava corrompido). Corrigido: a página agora usa
  `isShowingPublishedVersion = data.isShowingPublishedVersion && !integrityFailed`, nunca o valor cru do
  repositório.
- **Teste novo**: adultera o arquivo do snapshot DEPOIS de calculado o hash (simulando corrupção/
  adulteração pós-publicação) e prova que a RAIZ recusa mostrar aquele conteúdo como versão oficial, exibe
  o erro de integridade, mantém o toggle em "Versão atual", nunca rotula a tela como "Publicado" e nunca
  oferece "Exportar PDF" nesse estado.

### 2. Reprodutibilidade real do documento (schema versionado)

O snapshot só congelava `structuredOutput` — a tela da versão publicada continuava lendo cliente,
propriedade, talhão, área, safra, cultivar, sistema, textura, meta produtiva, laboratório e a marca da
empresa **ao vivo**, mesmo dentro de "Versão publicada". Corrigido com um schema versionado, sem
migração (a coluna `reports.storage_key` já guardava uma chave opaca pra um blob JSON — só o CONTEÚDO
desse blob mudou de formato):

```
{
  reportSnapshotVersion: 2,
  interpretationId, revision,
  publishedContext: { código, cliente, propriedade, talhão, área, safra, cultivar, sistema de cultivo,
                       textura do solo, meta produtiva, laboratório, confiabilidade do laudo, status,
                       período (createdAt/updatedAt) -- tudo que aparece no cabeçalho/meta-grid do
                       documento },
  structuredOutput: { facts, interpretation, confidence, trace -- como já era },
  brandingSnapshot: { nome/logo/responsável técnico da empresa no momento do publish },
  publishedAt, publishedBy,
}
```

- `publishFieldAnalysisReport` (`src/lib/repositories/reports.ts`) agora consulta o MESMO contexto que
  `getFieldAnalysisReportData` usaria (cliente/propriedade/talhão/safra...) e a marca real
  (`getTenantBranding`) no momento do publish, e grava tudo dentro do snapshot.
- A tela usa **exclusivamente** `publishedContext`/`brandingSnapshot` do snapshot pra tudo que faz parte
  do documento oficial quando "Versão publicada" está ativa — nunca mais o dado atual dessas entidades.
- **Compatibilidade com snapshots antigos**: um snapshot sem `reportSnapshotVersion` (formato anterior a
  esta correção) é tratado como versão 1 implícita — a tela mostra esses campos como "não capturados
  neste snapshot", nunca preenche com o dado atual como se fosse imutável. Nenhum publish real existe
  hoje neste ambiente, então essa compatibilidade é só defensiva (não há dado real pra migrar).
- **Teste novo**: publica um snapshot com um contexto SINTÉTICO e claramente diferente do dado real (ex.:
  "Cliente Congelado no Snapshot (teste)") — sem alterar nenhum registro real — e prova que "Versão
  publicada" mostra exatamente o contexto congelado, e "Versão atual" mostra o dado real, nunca o
  contrário nem uma mistura dos dois.

### 3. Storage de produção — auditoria (sem implementar infraestrutura paga)

`src/lib/storage.ts` ganhou um bloco de auditoria explícito no topo do arquivo (comentário, sem mudar
comportamento): `STORAGE_PROVIDER=local` grava no filesystem do processo, adequado só pra desenvolvimento
local contínuo — **não é armazenamento durável na Vercel** (funções serverless rodam em containers
efêmeros; escrever em disco local ali não garante que uma leitura futura, possivelmente noutro container,
vai achar o arquivo). Publicar um relatório em produção hoje, sem trocar o provedor, resultaria em "parece
publicado, mas nunca mais recuperável" — inaceitável pra um documento que precisa ser imutável.

Proposta documentada (não implementada — contratar um serviço de storage de objetos está fora do escopo
sem autorização explícita): uma interface `StorageProvider` comum (`save`/`read`), com `local` continuando
como está pra dev e um provedor real de objeto plugado por variável de ambiente
(`STORAGE_PROVIDER=local|s3|r2`) pra produção — Cloudflare R2 (compatível com API S3, sem custo de egress)
ou um bucket S3 padrão, ambos dentro da preferência de `CLAUDE.md` por soluções self-hosted/baratas/
substituíveis. Migrar pra essa interface não exigiria alterar `db/migrations/` (a coluna `storage_key` já
é uma chave opaca, independente de quem a resolve).

### Testes executados nesta rodada

```
npm run typecheck                → sem erros
npm run build                     → build de produção completo, sem erros
npm run test:handoff              → todos os cenários aprovados (inclui test:predominance)
npx playwright test <Fases 1-3>   → ver resultado consolidado na seção "Testes executados" abaixo
```

## Terceiro fechamento técnico (patch pequeno de consistência documental, mesma branch, sem merge)

Revisão final antes de encerrar a Fase 3. O diretor encontrou duas inconsistências que sobraram do
segundo fechamento: a data mostrada em "Versão publicada" ainda não era reprodutível, e a "Situação" da
"Versão atual" podia dizer "Publicado" só por coincidência de revisão técnica, mesmo sem prova nenhuma de
que o conteúdo exibido fosse igual ao documento oficial. Nenhuma fórmula agronômica alterada, nenhuma
regra homologada, nenhuma migração executada, nenhum merge/deploy.

### 1. Data do documento publicado

`/relatorios/talhao/[analysisId]` mostrava "Gerado em" usando `new Date()` mesmo na "Versão publicada" —
abrir o mesmo documento oficial em momentos diferentes mostrava horários diferentes, o que contradiz a
própria ideia de documento imutável.

Corrigido: quando `viewingPublished === true`, "Gerado em" usa exclusivamente
`publishedInfo.report.publishedAt` — o valor de `reports.published_at`, gravado uma única vez no `INSERT`
do publish e nunca alterado depois (nenhuma rotina no código escreve nesse campo de novo). A "Versão
atual" continua usando a data de agora, porque é literalmente o dado calculado no momento da requisição,
não um documento congelado.

**Teste novo**: abre a mesma "Versão publicada" duas vezes, com um intervalo real de 1,5s entre as
chamadas (tempo suficiente pra `new Date()` mudar de segundo se a correção não tivesse sido aplicada), e
prova que o texto de "Gerado em" é idêntico nas duas leituras.

### 2. Não confundir "versão atual" com documento publicado

Achado do diretor: `isShowingPublishedVersion` (o booleano que decidia se a "Situação" mostrava
"Publicado") comparava só `reports.interpretation_id` com a interpretação mais recente. Isso nunca provou
que a "versão atual" fosse idêntica ao documento oficial — desde o segundo fechamento, o snapshot v2
também congela contexto (cliente/propriedade/talhão/safra/marca), então a revisão técnica pode bater e
mesmo assim o talhão ter sido renomeado, a propriedade reatribuída ou a marca trocada depois do publish.
A tela rotulava "Situação: Publicado" na aba "Versão atual" só pela coincidência de revisão — exatamente
o tipo de confusão que o diretor pediu pra eliminar.

Regra aplicada, como pedido:

- `viewingPublished && snapshot íntegro` (hash verificado) → único caso rotulado como documento oficial
  ("Publicado (snapshot imutável)").
- "Versão atual" → sempre rotulada como versão de trabalho ("Rascunho..."), nunca "Publicado", em
  **nenhuma** circunstância.
- Quando a revisão técnica atual é a mesma da publicação, isso é informado **separadamente** — a
  "Situação" mostra "Rascunho (revisão igual à publicada)" e a nota abaixo do cabeçalho explica, por
  extenso, que isso não garante que o conteúdo exibido seja idêntico ao documento oficial (cliente,
  propriedade, talhão e marca podem ter mudado desde o publish) — sem nunca confundir com o snapshot
  oficial.
- Se o snapshot está ilegível (`readError`) ou não verificável (hash não conferido), a "versão atual"
  jamais herda o rótulo de documento publicado — o novo `sameRevisionAsPublished` exige
  `canShowPublishedView` (hash efetivamente verificado), não só a comparação crua de `interpretation_id`.

Implementação: `src/app/(platform)/relatorios/talhao/[analysisId]/page.tsx` — variável renomeada de
`isShowingPublishedVersion` para `sameRevisionAsPublished` (`data.isShowingPublishedVersion &&
canShowPublishedView`), usada só pra decidir qual nota informativa mostrar, nunca pra rotular a "versão
atual" como oficial. O botão "Exportar PDF" não precisou de mudança: já ficava disponível normalmente na
"versão atual" (que agora nunca se apresenta como o documento oficial, então imprimi-la não é mais
ambíguo) e já ficava oculto quando a integridade da "versão publicada" falhava (regra do segundo
fechamento, mantida).

**Testes novos**:
- publica um snapshot íntegro pra MESMA interpretação atual (revisão técnica igual) e prova que a "versão
  atual" nunca mostra "Publicado", mostra "Rascunho (revisão igual à publicada)", e a nota explica por
  que isso não é o documento oficial;
- insere uma linha em `reports` apontando pra uma chave de storage que nunca foi gravada (simula
  snapshot ilegível) e prova que a "versão atual" continua sem o rótulo "Publicado" mesmo nesse caso.

### Testes executados nesta rodada

```
npm run typecheck                → sem erros
npm run build                     → build de produção completo, sem erros
npm run test:handoff              → todos os cenários aprovados
npx playwright test <Fases 1-3>   → ver resultado consolidado na seção "Testes executados" abaixo
```

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
(reestruturado pra duas regiões), `src/domain/parameter-predominance.ts` (novo — **corrigido no
fechamento técnico**, ver seção própria abaixo), `src/domain/agronomic-engine.ts`/`src/lib/repositories/
interpretations.ts` (campo `source` MEASURED/CALCULATED thread­ado de `lab_results.source` até a tela —
antes existia na tabela mas nunca chegava na interface).

Duas regiões complementares (`.cockpit-evidence` / `.cockpit-technical`), contexto (talhão/safra/análise/
revisão) preservado no cabeçalho existente da página:

1. **Dado** — tabela real (ponto/parâmetro/resultado/método/origem), origem distinguindo medição de
   laboratório vs. calculado vs. "não registrada" (dado de antes desta rastreabilidade — nunca inventa
   retroativamente).
2. **Interpretação** — classificação real + base técnica/versão + motivo de bloqueio quando existir;
   síntese em linguagem simples (IA) embutida aqui, nunca misturada com a categoria Hipótese.
3. **Padrão** — **predominância de classificação observada** entre os pontos já classificados da mesma
   coleta (contagem e proporção, nunca análise espacial — ver correção abaixo); nunca gerado de uma
   observação isolada; sempre com contagem/proporção/limitação explícita.
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
npm run test:handoff                                                            → todos os cenários aprovados
                                                                                   (inclui test:predominance,
                                                                                   9 cenários novos)
npx playwright test e2e/field-overview-and-priorities.spec.ts \
  e2e/fase2-map-workspace-and-comparisons.spec.ts \
  e2e/fase3-cockpit-and-reports.spec.ts                                        → 25 passed, 1 skipped, 0 failed
                                                                                   (skip: estado da URL de
                                                                                   satélite/parâmetro em mapas
                                                                                   depende de dado que não
                                                                                   estava disponível nesta
                                                                                   execução -- não é falha)
```

Os 13 testes e2e novos e focados (`e2e/fase3-cockpit-and-reports.spec.ts`, 6 da entrega original + 1 do
1º fechamento técnico + 3 do 2º fechamento técnico + 3 do 3º fechamento técnico) cobrem: agrupamento da
fila por análise (Bloco A), as 6 categorias reais do cockpit (Bloco B), pré-seleção de comparativo pela
URL sem disparar comparação sozinha (Bloco C — encontrou e provou a correção do bug real do Strict Mode),
permissão real de aprovação por role (Bloco D), organização por destinatário + ausência de IA no resumo
ao produtor (Bloco E), identificação de rascunho/publicado (Bloco F), recuperação real do snapshot
publicado com hash válido, bloqueio real por hash divergente (adulteração pós-publicação — encontrou e
provou a correção do bug real de `isShowingPublishedVersion` não checar integridade), congelamento real
de contexto (metadado sintético publicado nunca vaza pra "Versão atual" nem o dado atual vaza pra "Versão
publicada"), data congelada em "Gerado em" da versão publicada (reabrir não muda o horário mostrado), e a
distinção final entre "versão atual" e documento oficial (revisão igual à publicada nunca é rotulada
"Publicado", nem quando o snapshot está ilegível). Todos descobrem dado real em tempo de execução (nunca
id fixo) e pulam com `test.skip` quando o dado atual do banco não sustenta o cenário, em vez de fingir
sucesso.

Um teste **pré-existente** da Fase 2 (`Solo e Fertilidade: mostra o valor observado real`) quebrou de
forma intermitente ao rodar em paralelo com os testes desta Fase (dependia da ordem de exibição do
`<select>` de parâmetros, que pode listar primeiro um parâmetro sem valor lançado num banco de dev
parcialmente poluído) — corrigido para escolher deterministicamente um parâmetro que realmente tenha
valor, em vez de confiar na primeira opção da lista.

## Limitações concretas (documentadas, não escondidas)

- **Reprodutibilidade do relatório publicado — resolvida no fechamento técnico** para
  `STORAGE_PROVIDER=local` (o padrão desta instância de dev): "Versão publicada" agora lê de volta o
  snapshot imutável real, com hash verificado (ver seção "Fechamento técnico" acima). A limitação que
  permanece é só sobre outros provedores de storage: `src/lib/storage.ts` só implementa leitura/escrita
  real para `local` — S3 (ou qualquer outro) segue não implementado, e `getPublishedReportSnapshot`
  devolve um erro explícito nesse caso, nunca dado inventado. Além disso, o snapshot gravado no publish
  captura só o que vinha de `interpretations.structured_output` (fatos + classificações + confiabilidade)
  — pontos/GPS, mapa, narrativa/prescrição de IA e comparação de insumo nunca foram capturados ali, então
  a "Versão publicada" os mostra como nota explícita de ausência, nunca como dado atual disfarçado de
  imutável.
- **Instruções operacionais de campo**: `collection_orders` não tem campo de texto livre pra
  instrução/objetivo — o relatório operacional declara isso explicitamente em vez de inventar texto.
  Resolver exigiria uma migração real (`ALTER TABLE collection_orders ADD COLUMN instructions text`), não
  executada aqui por instrução explícita ("documente a mudança necessária sem executar migração").
- **Predominância entre safras (temporal)**: a categoria "Padrão" do cockpit só avalia predominância de
  classificação DENTRO da mesma coleta (contagem/proporção, nunca análise espacial — ver "Fechamento
  técnico" acima) — comparar entre safras/datas diferentes exigiria a mesma disciplina de compatibilidade
  de profundidade/método/tipo de amostra já usada nos comparativos (Fase 2), e foi deixado de fora desta
  rodada por prudência (evitar uma "predominância" que na verdade combina medidas incompatíveis).
- **Padrão espacial real**: não implementado (nunca foi — a categoria "Padrão" nesta instância é só
  predominância de classificação, nunca leu coordenada/geometria). Exigiria latitude/longitude real dos
  pontos, uma definição de vizinhança e um método espacial validado (ex.: autocorrelação espacial/Moran's
  I, interpolação geoestatística com variograma) — nenhum desses implementado ou improvisado.
- **Hipótese diagnóstica**: nenhum mecanismo existe — categoria declarada como ausente, não simulada.

## Estado local e remoto

```
git branch --show-current                                       → feature/raiz-2.0-fase3
git log feature/raiz-2.0-fase3 --not feature/raiz-2.0-fase2      → commits desta Fase (ver hash no fechamento)
```

Nenhum merge, deploy, migração ou alteração de produção foi executado.
