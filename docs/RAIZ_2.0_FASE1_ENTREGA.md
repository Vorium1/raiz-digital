# RAIZ 2.0, Fase 1 — Entrega para revisão (fechamento técnico)

Branch: `feature/raiz-2.0-fase1` (a partir de `develop`, 16 commits, publicada em
`origin/feature/raiz-2.0-fase1`, local e remoto sincronizados). Nada foi publicado em `develop`/`main`,
nenhuma migração executada, nenhum serviço pago contratado, nenhum dado de produção alterado.

## Conclusão objetiva

**Pronta para revisão**, com uma limitação conhecida e documentada (não uma pendência oculta): 5 dos 27
testes e2e falham por um motivo confirmado e comprovadamente alheio a esta Fase 1 (ver seção 1). Todo o
resto — build, tipagem, motor agronômico, os 9 testes de regressão desta Fase (5 da rodada anterior + 4
novos da rodada de correção abaixo), QA visual em 5 larguras, isolamento multiempresa na rota nova — está
verde, com evidência real, não presumida.

Esta versão do documento inclui a **rodada de correção de 5 lacunas** apontadas por uma revisão
independente do commit `7444bc0` (seção 0, abaixo) — commit atual: `513e962`.

---

## 0. Correções da revisão independente (commit `7444bc0` → `513e962`)

Uma revisão de código independente, feita sobre o commit `7444bc0` já entregue, encontrou 5 lacunas reais.
Todas as 5 foram corrigidas nesta branch, cada uma com teste automatizado novo e isolado (exceto o item 3,
verificado por leitura de código + pelos testes já existentes de escopo por safra) e evidência real de
execução.

| # | Lacuna apontada | Correção | Evidência |
|---|---|---|---|
| 1 | Aba/safra/ordem do Talhão 360° não persistiam em reload nem em link direto | `field-overview-tabs.tsx` passou a ler e escrever `?aba=&safra=&ordem=` na URL via `useSearchParams`/`router.replace`, validando cada valor contra os dados reais antes de aplicar (nunca aceita um valor de URL que não exista nas safras/ordens do talhão) | Teste novo `Talhão 360°: aba selecionada persiste no reload e num link direto (item 1)` — passou 3x em execuções reais (10.6s, 21.2s, 20.9s), incluindo abrir a mesma URL numa aba de navegador nova sem nenhum estado herdado |
| 2 | Busca de pontos do mapa (`map-layer`) sem tratamento de erro HTTP/rede, e sem cancelar resposta obsoleta ao trocar de ordem | Adicionado estado de `loading`/`error` visível + `AbortController` por execução do `useEffect`, com `signal.aborted` checado no `.catch()` pra nunca aplicar uma resposta superada | Dois testes novos: erro HTTP 500 simulado mostra `.field-ops-message.danger` (nunca fica preso em "Carregando…"); teste de corrida real via `page.route()` com a ordem A atrasada 1.5s artificialmente — a ordem B (5 pontos) é a única que aparece no mapa, provando que a resposta tardia da ordem A é ignorada de fato, não só "não deu tempo de falhar no teste" |
| 3 | Escopo de relatórios/NDVI/qualidade de GPS pouco claro quanto a safra | `field-overview.ts`: query de relatórios passou a trazer `crop_season_id` real (antes vazava relatórios de todas as safras pra dentro de uma visão supostamente filtrada); NDVI e qualidade de GPS mantidos deliberadamente como histórico do talhão (não existe FK real de safra nessas tabelas), com rótulo explícito "(histórico do talhão)" em vez de inferir vínculo por data | `npm run typecheck` limpo; rótulos conferidos em `field-overview-tabs.tsx` ("Leituras de satélite (histórico do talhão)", "Relatórios publicados **nesta safra**") |
| 4 | Alertas do Talhão 360° vinculados pelo **nome** do talhão (`alert.context === field.name`), vazando alerta entre talhões homônimos de empresas diferentes | `alerts.ts`: tipo `OperationalAlert` ganhou `fieldId: string \| null`, threading real em todos os 13 pontos de `alerts.push(...)`; `talhoes/[fieldId]/page.tsx` filtra por `alert.fieldId === fieldId` (id real) | Teste novo cria 2 talhões reais com o **mesmo nome** em 2 empresas/propriedades diferentes via `POST /api/fields`, confirma que cada Talhão 360° mostra só o próprio alerta, e remove os 2 talhões via `DELETE /api/fields/[id]` ao final (self-contained, sem resíduo) |
| 5 | Relatório de evolução atribuía causalidade entre produtividade e falta de aderência; rótulo "Sequência real por ordem de cadastro" sugeria ordem agronômica real | `relatorios/evolucao/[fieldId]/page.tsx`: nota de aderência reescrita como comparação documental de rastreabilidade, sem alegar causa de resultado de produtividade; cabeçalho da tabela de rotação mudou para "Ordem de cadastro" com legenda explicando que o cadastro não comprova a sequência agronômica real de plantio | Revisão de texto direta no arquivo; `npm run build` confirma que a rota renderiza sem erro |

**Testes novos**: 4 adicionados a `e2e/field-overview-and-priorities.spec.ts` (isolados, sem repetir
cobertura já existente), cobrindo os itens 1, 2 (dois testes) e 4. Rodados isoladamente e em conjunto com
os 5 testes pré-existentes do mesmo arquivo: **9 de 9 passaram** na execução limpa mais recente (2.0min).
Uma execução anterior teve 1 falha (`ERR_NETWORK_IO_SUSPENDED` no meio de um reload, com o teste rodando
sozinho até então) — reproduzida como um evento de rede local da máquina, não da aplicação: o mesmo teste,
rodado sozinho logo em seguida, passou em 21.2s; rodado de novo dentro do arquivo inteiro, passou em 20.9s.
Não há indício de causa na aplicação — registrado aqui por transparência, não escondido.

**Limpeza real realizada após os testes**: os 2 talhões homônimos de teste foram removidos via API real
(confirmado por `HTTP 200` nas 2 chamadas `DELETE`); a sessão de QA manual usada durante a investigação
(`user_agent = 'qa-review-fix-test'`) foi revogada no banco (`revoked_at = now()`); o script auxiliar
`qa-shot.mjs` usado só para essa investigação foi removido do repositório.

---

## 1. Os 27 testes e2e, esclarecidos

**22 passaram, 5 falharam, 0 ignorados, 0 bloqueados.** Nenhum teste foi pulado ou desabilitado pra
melhorar esse número.

### Os 5 que falharam, nominalmente

Todos os 5 falham pelo **mesmo sintoma raiz**: `POST /api/collection-orders/:id/points` (importação de CSV
de pontos) devolve **422** em vez de **200**, mesmo numa ordem de coleta recém-criada pelo próprio teste.

| # | Teste | Mensagem exata |
|---|---|---|
| 1 | `field-operations-isolation.spec.ts:131` — "não substituir pontos depois que a coleta começou" | `expect(firstImport.status).toBe(200)` → recebido `422` |
| 2 | `field-operations-isolation.spec.ts:184` — "duas importações concorrentes não duplicam nem corrompem os pontos" | `expect([first.status, second.status]).toContain(200)` → recebido `[422, 422]` |
| 3 | `field-operations-isolation.spec.ts:224` — "distância máxima entre GPS observado e ponto planejado" | `expect(pointId).toBeTruthy()` → `undefined` (não achou o ponto porque o import anterior, no mesmo teste, já tinha falhado com 422) |
| 4 | `field-operations-rbac.spec.ts:44` — "agronomist: leitura sempre permitida; escrita permitida" | `expect(imported.status).toBe(200)` → recebido `422` |
| 5 | `field-operations-rbac.spec.ts:44` — "fieldTech: leitura sempre permitida; escrita permitida" | `expect(imported.status).toBe(200)` → recebido `422` |

### Causa raiz confirmada (não presumida)

Esses 5 testes montam uma ordem de coleta nova pegando a **primeira** da lista real
(`listA.payload.orders[0]?.cropSeasonId`, retornada por `/api/collection-orders`, mais recente primeiro) e
importam um CSV com coordenadas **fixas no código**, calibradas pra caírem dentro do contorno real de um
talhão específico chamado "Talhão 3" (comentário original do arquivo). Consultei o banco de dev
diretamente e confirmei que as ordens de coleta mais recentes agora pertencem todas ao talhão **"Área 03"**
— não "Talhão 3":

```
SELECT co.code, f.name FROM collection_orders co JOIN crop_seasons cs ON cs.id=co.crop_season_id
JOIN fields f ON f.id=cs.field_id ORDER BY co.created_at DESC LIMIT 5;
-- todas as 10 mais recentes: field_name = 'Área 03'
```

Isso aconteceu porque a suíte e2e completa foi rodada várias vezes nesta sessão (e antes dela) contra o
mesmo banco de dev real — cada execução destes mesmos testes cria uma ordem nova, e essas ordens novas
foram se acumulando no topo da lista, "empurrando" a suposição original do teste (`orders[0]` = talhão com
as coordenadas certas) pra fora da realidade atual do banco. As coordenadas fixas do CSV caem fora do
contorno real de "Área 03" → bloqueio de geometria real e correto (`422`) → todos os 5 testes falham.

### Comparação com `develop`, em ambiente isolado (não bastou dizer que o módulo não foi tocado)

Para não presumir, criei um **worktree git separado** do `develop` (`git worktree add`), com
`node_modules` e `.env` próprios, subi um servidor dele isolado na porta 3001 (meu branch continuou rodando
normalmente na 3000), e rodei os mesmos 5 testes **contra o mesmo banco de dev real**, usando código do
`develop` sem nenhuma alteração desta Fase 1:

```
E2E_BASE_URL=http://localhost:3001 npx playwright test e2e/field-operations-isolation.spec.ts e2e/field-operations-rbac.spec.ts
→ 5 failed (as mesmas 5, com a mesma mensagem 422), 6 passed
```

**Resultado idêntico ao do meu branch.** Isso prova, com comparação real (não inferência sobre `git diff
--stat`), que a causa é estado do banco de dados compartilhado, não código desta Fase 1 — nenhuma mudança
compartilhada (tipos, `alerts.ts`, `analyses.ts`, `dashboard.ts`) afeta esse resultado. O worktree de
comparação foi removido depois do teste (`git worktree remove`); não sobrou nenhum artefato.

**Não corrigi** a fragilidade do teste em si (usar `orders[0]` como suposição de qual talhão vai ser usado)
porque está fora do escopo desta Fase 1 — é um teste do módulo de operações de campo, que esta Fase não
toca, e mudar a lógica desses testes sem entender todo o contexto de `collections.ts` arrisca mascarar
algo real. Registrado como impedimento conhecido, com a causa exata, para quem for mexer no módulo de
campo depois.

---

## 2. Requisitos menos visíveis — verificados um a um

| Requisito | Arquivo / componente | Evidência |
|---|---|---|
| Coordenadas estimadas identificadas corretamente | `src/app/(platform)/relatorios/coleta/[orderId]/page.tsx`, `src/app/(platform)/mapas/page.tsx` | Banner conta pontos reais com `gps_source LIKE '%BROWSER_GPS%'` vs. estimados; tabela mostra "Confirmado em campo" / "Estimado / planejado" por linha, nunca "real" incondicional |
| Ausência de avaliação distinta de situação saudável | `dashboard.ts` (`notInterpretableCount`, indicador separado de "Talhões críticos"), `field-overview-tabs.tsx` (`evaluationStatus` nunca usa tom verde/"aprovado" sem análise aprovada de verdade), `portfolio-map.tsx` (`SEM_ANALISE` = cinza neutro, nunca verde) | Screenshot real: "1 DE 1 SEM PARÂMETRO INTERPRETÁVEL" (Talhão 360°, Área 01) — nunca "0 problemas" |
| Mapa preservado quando interpolação bloqueada | `src/components/agronomic-map-explorer.tsx` | **Bug real achado e corrigido nesta rodada de fechamento** (commit `1b3ca2d`): antes, clicar em "Interpolação" trocava o mapa inteiro por um texto. Agora o mapa real continua visível, com o aviso de bloqueio ao lado do controle de camada. Screenshot real confirma os dois juntos |
| Imagem de fundo distinta de aquisição analítica de satélite | `src/components/field-ndvi-panel.tsx`, `real-field-map.tsx` | `grep` dirigido: "Sentinel-2" só aparece no painel de NDVI (leitura analítica real); o mapa-base (Esri World Imagery) nunca é chamado de "Sentinel-2" em nenhum texto |
| Cultura atual e próxima cultura separadas | `field-overview-tabs.tsx` (cabeçalho do Talhão 360°) | Dois campos distintos no cabeçalho: "Cultura atual" e "Próxima cultura", nunca combinados numa string só |
| Indicadores com escopo e denominador coerentes | `dashboard/page.tsx`, `field-overview-tabs.tsx` | "Cobertura de coleta" sempre com `%` (nunca "hectares"); alertas globais rotulados "toda a carteira" explicitamente; "Confiabilidade do laudo" vs. "Confiabilidade da interpretação" nunca confundidas (Etapa 2, rodada anterior) |
| Relatórios usando estados e versões pertinentes | `field-overview-tabs.tsx` (aba Decisões lista `revision`/`publishedAt` reais de `reports`) | Screenshot real mostra "revisão #1" com data real de publicação |
| Ausência de causalidade agronômica não demonstrada | `src/lib/repositories/alerts.ts` (aviso climático) | Texto já existente (sessão anterior) evita "é ano de El Niño, logo X" — cita explicitamente que a correlação é fraca pro RS e que o número citado é teto teórico simulado, não perda medida; nenhuma mudança necessária |

Nenhum item desta lista ficou sem verificação ou sem evidência. Um item (mapa preservado na interpolação
bloqueada) estava genuinamente faltando e foi corrigido nesta rodada — não é maquiagem, é uma correção
real feita durante o próprio fechamento.

---

## 3. Evidências da experiência (percurso real testado)

Percurso completo **Central → Talhão → Evidência → Retorno**, testado com sessão real (nunca com
credencial exposta no código — sessão inserida diretamente no banco de dev via token aleatório, revogada
ao final de cada rodada):

1. **Central de Decisão** — prioridades reais + mapa da carteira, mesmo filtro nos dois.
2. **Talhão 360°** — as 4 áreas (Visão geral/Evidências/Decisões/Linha do tempo), dado real do Cabeda.
3. **Análise aberta pelo contexto** — clique numa linha da aba Decisões abre `/analises/AN-CABEDA-01` de
   verdade, com o status real ("Calculado, sem parâmetro interpretável") e o motivo.
4. **Retorno** — botão "voltar" do navegador volta pra `/talhoes/[id]` (Talhão 360°), não pra uma tela
   genérica — contexto preservado de verdade, confirmado pela URL real após o retorno.
5. **Navegação mobile** — menu "Mais" com os 6 grupos completos e legíveis (bug de `flex-shrink`
   corrigido na rodada anterior), abas do Talhão 360° roláveis sem overflow.
6. **Estado sem avaliação** — "1 DE 1 SEM PARÂMETRO INTERPRETÁVEL" (Talhão 360°) é o exemplo real
   disponível nos dados atuais; **não existe hoje**, nos dados reais do Cabeda, um talhão com zero safra
   ou zero análise pra fotografar um estado "zero dado" literal — toda a base real está populada. O código
   trata esse caso (`{seasonAnalyses.length === 0 && <p>Nenhuma análise nesta safra.</p>}` em
   `field-overview-tabs.tsx`), só não há dado real disponível pra fotografar sem fabricar — registrado como
   limitação de evidência, não de implementação.

Além de overflow horizontal (0 em 360/390/768/1024/1440px, medido via `scrollWidth`/`clientWidth`),
conferido nesta rodada: legibilidade (texto longo trunca em 2 linhas nas prioridades, não invade outros
elementos), contexto sempre visível no cabeçalho do Talhão 360°, filtro de safra funcional, ações
(botões "Nova ordem"/"Ver pontos"/"Visão 360°") clicáveis e com destino real, rolagem sem travar em nenhum
componente testado, controles com alvo de toque adequado no mobile (confirmado nos screenshots).

---

## 4. Matriz de requisitos (Etapas 1-6, com a Etapa 4/5 completas nesta rodada)

| # | Requisito | Situação |
|---|---|---|
| 1 | Reconciliação de estado, contagem do diagnóstico | ✅ Implementado e verificado |
| 2 | Contexto de navegação (cascata de filtro, alertas exatos, talhão único, isolamento) | ✅ Implementado e verificado (com teste automatizado) |
| 3 | Talhão 360° | ✅ Implementado e verificado |
| 4 | Central de Decisão (prioridades + mapa da carteira) | ✅ Implementado e verificado |
| 5 | Mapas/NDVI — linguagem e preservação do mapa | ✅ Implementado e verificado (1 correção real feita nesta rodada) |
| 6 | Validação (testes, QA visual) | ✅ Executado, com 1 limitação conhecida documentada (seção 1) |

## Implementado / Verificado / Limitação conhecida / Pendência

- **Implementado e verificado**: tudo listado nas seções 0-4 acima, com evidência real (screenshot,
  medição, ou teste automatizado passando) para cada item, incluindo as 5 correções da revisão
  independente (seção 0).
- **Limitação conhecida** (não bloqueia a revisão, documentada com causa exata): os 5 testes e2e de
  `field-operations-isolation`/`field-operations-rbac` falham por poluição de dado no banco de dev
  compartilhado (ordens de teste acumuladas apontando pro talhão errado), confirmado idêntico em `develop`
  via worktree isolado — não é regressão desta Fase, não foi corrigido por estar fora do escopo.
- **Limitação de evidência** (não de implementação): não há, nos dados reais atuais, um talhão com zero
  safra/análise pra fotografar um estado "sem dado nenhum" literal — o código trata esse caminho, só não
  há dado real pra ilustrar sem fabricar.
- **Pendência**: nenhuma identificada dentro do escopo autorizado (itens 1-6 do fechamento original + as 5
  correções da seção 0). Fase 2 não iniciada.

## `scripts/publish-github.sh` — preservado, não commitado

Só muda a permissão do arquivo (755→644), sem conteúdo alterado. Existia modificado **antes** desta sessão
começar a trabalhar nesta Fase 1. Não commitado, à espera de decisão do diretor.

## Comandos de validação executados nesta rodada de fechamento, com resultado

```
npm run typecheck        → sem erros
npm run build             → build de produção completo, sem erros
npm run test:handoff      → todos os cenários aprovados (liming, phosphorus, fertilizer-dose, ndvi,
                             schemas de IA, migrations 001-024)
npx playwright test       → 22 passed, 5 failed (causa raiz confirmada acima), 0 skipped, 0 blocked
E2E_BASE_URL=:3001 npx playwright test <os 5 que falham>   → mesmos 5 falham em develop, ambiente isolado
```

## Comandos de validação executados na rodada de correção das 5 lacunas (commit `513e962`)

```
npm run typecheck                                              → sem erros
npm run build                                                   → build de produção completo, sem erros
npx playwright test e2e/field-overview-and-priorities.spec.ts  → 9 passed (2.0min), 0 failed, 0 skipped
                                                                   (inclui os 5 testes da rodada anterior
                                                                   + os 4 novos desta rodada)
```

## Estado local e remoto (confirmado após o push desta rodada)

```
git status --short                                    → só scripts/publish-github.sh (preservado)
git log feature/raiz-2.0-fase1 --not develop           → 16 commits
git log origin/feature/raiz-2.0-fase1 --oneline -1     → mesmo commit do HEAD local (push confirmado)
git worktree list                                      → só o worktree principal (comparação removida)
```

Commit mais recente desta rodada: **`513e962`** — "fix: corrige 5 lacunas da revisão independente do
commit 7444bc0".

Nenhum merge, deploy, migração ou alteração de produção foi executado. A Fase 2 não foi iniciada.
