# RAIZ 2.0, Fase 2 — Exploração visual de talhões, mapas, satélite e comparativos

Branch: `feature/raiz-2.0-fase2`, criada a partir de `feature/raiz-2.0-fase1` no commit `ce620d3`
(fechamento da Fase 1, já entregue). Nada foi publicado em `develop`/`main`, nenhuma migração
executada, nenhum serviço pago contratado, nenhum dado de produção alterado.

## Conclusão objetiva

**Pronta para revisão.** Os 5 blocos do escopo (A–E) foram implementados com dado real, verificados
visualmente (screenshot real, sessão de banco de dev real) e cobertos por teste automatizado focado.
Nenhuma capacidade dependente de infraestrutura ausente foi simulada: onde a base não tem raster de
satélite armazenado (só estatística agregada), a tela deixa isso explícito em vez de fingir uma camada
espacial que não existe — ver Bloco D.

---

## Preparação — o que existe de verdade (antes de desenhar qualquer tela)

Investigação de código real, sem presumir capacidade:

- **NDVI/satélite**: a tabela `field_ndvi_snapshots` guarda só `mean_ndvi`/`min_ndvi`/`max_ndvi`/
  `stddev_ndvi`/`pixel_count`/`cloud_cover_pct`/`zone_breakdown_pct` — **nenhum raster ou tile
  armazenado**. O provedor real (Copernicus/Sentinel Hub Statistical API) devolve histograma agregado,
  nunca pixel bruto. Confirmado em `db/migrations/023_satellite_ndvi.sql` e
  `src/lib/satellite/copernicus-ndvi-provider.ts`.
- **Mapas**: Leaflet + Esri World Imagery (satélite real) já em uso (`real-field-map.tsx`,
  `agronomic-map-explorer.tsx`, `portfolio-map.tsx`). O toggle "Interpolação" já evitava simular uma
  zona espacial inventada (aviso explícito, mapa real preservado) — reaproveitado, não recriado.
- **Talhão 360°**: a aba Evidências já separava pontos de coleta e NDVI em dois blocos sequenciais —
  faltava a sub-navegação explícita e o controle de parâmetro dentro dela.
  `field-overview-tabs.tsx`/`field-overview.ts`.
- **Resultados laboratoriais**: `lab_results` (parâmetro/valor/unidade/método) e `sample_points`
  (profundidade/tipo de amostra via `lab_samples.sample_type`) já existem — faltava uma visão de
  distribuição (mín/máx/média/mediana/quantidade), só existia tabela crua ou médias por safra inteira.
- **Comparativos**: `comparisons.ts` comparava a última interpretação inteira, sem checar
  compatibilidade de unidade/método/profundidade entre os dois lados — pareava por parâmetro sem
  verificar se a medida era do mesmo tipo.
- **Qualidade GPS**: `accuracy_m`/`gps_source` existiam na tabela mas o endpoint `map-layer` não os
  devolvia — o painel de detalhe do ponto nunca mostrava essa informação na prática, apesar do código já
  saber renderizá-la.

---

## Bloco A — Mapa como área de trabalho

`src/components/agronomic-map-explorer.tsx` (reescrito), `src/lib/repositories/map-data.ts`
(estendido), `src/app/globals.css`.

- **Lista pesquisável**: campo de busca filtra por nome do talhão, propriedade ou cliente em tempo
  real; o talhão já selecionado nunca desaparece da lista só porque o texto digitado não bate mais com
  ele (evita perder contexto ao digitar).
- **Contexto de cliente/propriedade/safra**: já visível em cada linha da lista (reaproveitado da Fase 1,
  ampliado com a safra da primeira ordem do grupo).
- **Mapa com espaço dominante + controles próximos**: toolbar de camada (parâmetro/status/interpolação/
  satélite) fica imediatamente acima do mapa, nunca em painel separado.
- **Painel de detalhe da seleção**: o painel lateral do `RealFieldMap` (já existente) agora recebe
  **precisão de GPS, origem, observação e coordenada observada** por ponto — campos que a tabela já
  tinha mas o endpoint `map-layer` nunca devolvia (bug real corrigido: `map-data.ts` agora seleciona
  `accuracy_m`, `gps_source`, `notes`, `observed_position`, `subsample_count`, `sequence`).
- **Legenda sempre compreensível + metadado por camada**: cada camada ativa mostra, em texto, o que
  representa, unidade, data, fonte, método (quando pertinente) e limitação — nunca um toggle mudo.
- **Camada satélite (talhão inteiro)**: novo toggle "Satélite (talhão inteiro)" busca a última leitura
  NDVI salva do talhão e preenche o contorno com a cor da faixa de vigor dominante — com o texto de
  limitação explícito ("é uma aproximação de talhão inteiro... não representa variação espacial real").
  Nunca mistura com a cor de seleção/classificação dos pontos, que continuam com sua própria paleta.
- **Estado sobrevive à navegação**: ordem/parâmetro/status/satélite na URL (`?ordem=&parametro=&
  status=&satelite=`), restaurados em reload — mesmo padrão já validado na Fase 1 para o Talhão 360°.
- **Mobile**: alternância explícita "Lista"/"Mapa" (abas, não mais empilhamento silencioso) — o painel
  de detalhe do ponto já era touch-friendly (Fase 1).

**Evidência real**: screenshot desktop com camada satélite ligada mostra o contorno preenchido de verde
(80,65% "Vigor muito alto" real, Área 01, Rafael Cabeda) com 8 pontos reais coloridos por status de
coleta por cima — provando que as duas cores nunca se confundem. Screenshot mobile confirma a
alternância Lista/Mapa. Teste e2e confirma busca filtrando corretamente e estado sobrevivendo a reload.

## Bloco B — Solo e Fertilidade no Talhão 360°

`src/components/field-overview-tabs.tsx`, `src/domain/parameter-distribution.ts` (novo).

- Evidências ganhou sub-seleção **Solo e Fertilidade / Coletas / Satélite** (`?evidencia=`), persistida
  na URL.
- **Solo e Fertilidade**: seletor de parâmetro com profundidade da coleta sempre visível ao lado
  ("Profundidade desta coleta: 0–20 cm"); ao clicar num ponto, abre valor/unidade/método/origem/situação
  da classificação (painel já existente do `RealFieldMap`, agora com dado completo); links reais "Abrir
  análise de origem" e "Abrir laudo publicado" (só aparecem quando existem de verdade — `analysisId`/
  `reportId` adicionados ao endpoint `map-layer`).
- **Distribuição real, nunca escondida por falta de homologação**: painel mostra amostras coletadas, com
  valor lançado, sem valor ainda, mínimo, máximo, média e mediana — calculado só com os valores
  realmente observados (`computeParameterDistribution`, puro, sem inferência). Confirmado ao vivo: o
  parâmetro AL do talhão Área 03 (perfil "Soja" sem faixa homologada) mostra os 4 valores reais
  (0,10–0,20 cmolc/dm³, média 0,13) com os pontos em cinza "sem classificação" — o dado nunca some.
- **Coletas**: mapa simples por status de coleta (comportamento anterior preservado).
- **Satélite**: `FieldNdviPanel` embutido (ver Bloco D).

**Evidência real**: screenshot com 4 pontos reais coloridos + tabela de distribuição preenchida com
números reais do banco de dev.

## Bloco C — Visão Geral do Talhão 360°

`src/domain/field-overview-synthesis.ts` (novo), `src/components/field-overview-tabs.tsx`.

- Três caixas estruturadas **"O que está disponível" / "O que exige atenção" / "Próxima ação"**, cada
  linha derivada de uma contagem ou estado real já carregado (pontos coletados, análises registradas,
  relatórios publicados, última leitura de satélite, % de GPS confirmado, motivo exato de não-
  interpretável) — nenhum parágrafo genérico, nenhum diagnóstico/responsável/prazo inventado.
- **Próxima ação** segue a cadeia determinística real do fluxo operacional (safra → coleta → laudo →
  motor → revisão → publicação) e aponta pro registro exato (ex.: `/analises/{id}`) — nunca um texto
  sem destino.
- Prioridades limitadas a 3 na Visão Geral (as demais ficam a um clique, em "Decisões"), evitando repetir
  a lista inteira em duas telas.

**Evidência real**: screenshot mobile mostra "Próxima ação: Resolver a pendência que impede a
interpretação" apontando pra análise real (`/analises/0464127a-...`); teste e2e clicou o link e
confirmou a navegação de verdade.

## Bloco D — Satélite com utilidade visual (caminho "só estatística agregada")

`src/components/field-ndvi-panel.tsx` (estendido).

A instância **não tem raster/tile armazenado** (ver Preparação) — por isso a tela segue explicitamente
o caminho definido no briefing pra essa situação, em vez de simular uma camada espacial:

- **Histórico organizado em gráfico + lista**: gráfico de linha (SVG puro, sem biblioteca) com domínio
  fixo 0–1 (as mesmas faixas de vigor já usadas em `ndvi-engine.ts`, nunca auto-escalado — isso
  exageraria diferenças pequenas), faixas coloridas de fundo, um ponto por aquisição real. Lista abaixo
  com data, NDVI médio, faixa de vigor, e a métrica real de qualidade (% da área do talhão sem pixel
  válido nesta cena — não confundida com cobertura de nuvem da cena inteira, ver nota abaixo).
- **Dependência concreta declarada**: texto fixo no topo do painel ("Esta instância guarda só a
  estatística por aquisição... A dependência concreta para habilitar essa camada é armazenar (ou servir
  sob demanda) o raster/tile da cena, o que esta instância ainda não faz.") — nunca omitido.
- **Nunca simula raster**: a camada "satélite (talhão inteiro)" do Bloco A é sempre rotulada como
  aproximação de talhão inteiro, nunca uma superfície espacial.
- **Nuvem vs. qualidade dentro do talhão**: `cloudCoverPct` salvo é `noDataCount / totalPixels` dentro
  do próprio polígono do talhão (não o metadado de nuvem da cena inteira do Sentinel-2) — confirmado em
  `copernicus-ndvi-provider.ts:194`; o texto da tela reflete exatamente essa métrica.
- **Sem invenção de anomalia**: nenhum texto de "tendência" ou "anomalia" é gerado a partir do
  histórico — só os números reais, em gráfico e lista.

**Evidência real**: campo Área 01 buscou uma leitura real via API Sentinel-2 (credenciais Copernicus já
configuradas nesta instância) e o histórico renderizou corretamente com 1 aquisição real (NDVI 0,78,
07/09/2026, Sentinel-2, 0% sem pixel válido); clicar "Atualizar leitura" de novo confirmou o upsert (sem
duplicar a linha).

## Bloco E — Comparativos que mostram a diferença

`src/lib/repositories/comparisons.ts` (reescrito), `src/components/comparison-explorer.tsx`
(reescrito).

- **Talhão×Talhão e Safra×Safra** agora comparam por parâmetro de verdade (query agregada real sobre
  `lab_results`/`sample_points`/`lab_samples`, não mais só a última interpretação inteira): valor médio
  observado de cada lado, quantidade de amostras (n), classificação mais recente quando existe.
- **Diferença absoluta real**, nunca percentual sobre base inválida: pH mostra diferença em unidades de
  pH puras (sem sufixo); parâmetros em `%` mostram a diferença em **pontos percentuais** ("pp"), nunca
  como percentual do percentual.
- **Compatibilidade verificada, não presumida**: cada linha checa se as duas unidades batem, se existe
  ao menos um método analítico em comum, se os tipos de amostra têm interseção (ex.: nunca compara solo
  com foliar como se fossem a mesma medida) e se as faixas de profundidade se sobrepõem. Quando não bate,
  a linha aparece marcada "Não comparável" com o motivo exato escrito por extenso — os valores
  individuais de cada lado continuam visíveis, nunca escondidos.
- **Gráfico de diferenças** (SVG puro): só os parâmetros efetivamente comparáveis, ordenados pela
  magnitude da diferença, barra positiva/negativa a partir do zero.
- **Mapas lado a lado** (Talhão×Talhão): contorno real de cada talhão, evidência espacial honesta sem
  presumir uma ordem de coleta específica pra um talhão inteiro.
- **Ponto×Ponto** reescrito no mesmo formato unificado (antes eram duas tabelas cruas lado a lado, sem
  diferença calculada nem checagem de compatibilidade).

**Evidência real**: comparação real Área 01 × Área 02 (Rafael Cabeda) — 16 parâmetros, todos comparáveis
(mesmo tipo de amostra/método/profundidade), diferenças corretas (`CLAY +8,75 pp`, `PH +0,47` sem
unidade, `K +22,15 mg/L`), gráfico de barras renderizado, mapas reais lado a lado. Teste e2e verificou
numericamente que `absoluteDifference === avgB - avgA` para toda linha marcada comparável, e que toda
linha não-comparável carrega pelo menos um motivo.

---

## Direção visual

Nenhum elemento novo de "glow", animação decorativa ou banner sem ação foi introduzido. Camadas de
mapa usam a mesma paleta de classificação já homologada (`classification-colors.ts`); o gráfico de NDVI
e o de diferenças usam as mesmas faixas/cores já estabelecidas (`ndvi-engine.ts` e paleta padrão de
positivo/negativo). Estados de carregamento, erro e indisponibilidade (falta de dado observado, falta de
faixa homologada, falta de leitura de satélite) são sempre texto explícito, nunca uma tela em branco.

## Limites respeitados

Nenhuma alteração em `agronomic-engine.ts` (motor/fórmulas), homologações, autenticação, RLS ou dado de
produção. Nenhum merge, deploy ou migração executada. Nenhum serviço pago novo contratado — o único
provedor externo usado (Copernicus/Sentinel Hub) já estava integrado e configurado antes desta Fase.
Nenhum chatbot generativo, ERP ou previsão de produtividade iniciado.

## Testes executados, com resultado

```
npm run typecheck                                                       → sem erros
npm run build                                                            → build de produção completo, sem erros
npx playwright test e2e/field-overview-and-priorities.spec.ts \
  e2e/fase2-map-workspace-and-comparisons.spec.ts                        → 13 passed, 1 skipped
                                                                            (skip: 1º talhão da lista sem
                                                                            parâmetro real na 1ª ordem —
                                                                            poluição de dado de teste já
                                                                            documentada na Fase 1, não um
                                                                            código quebrado)
```

Os 5 testes novos e focados (`e2e/fase2-map-workspace-and-comparisons.spec.ts`) cobrem exatamente os
comportamentos alterados nos Blocos A/B/C/E, descobrindo dado real em tempo de execução (nunca id fixo) e
pulando com `test.skip` quando o dado atual do banco não sustenta o cenário, em vez de fingir sucesso.

## Limitações concretas (documentadas, não escondidas)

- **Camada NDVI espacial (raster)**: não implementada nesta Fase, por não haver raster armazenado nem
  pipeline de tile — a dependência exata está declarada na própria tela (Bloco D). Habilitar exigiria
  armazenar ou servir sob demanda o raster/tile da cena Sentinel-2, decisão de infraestrutura fora do
  escopo autorizado desta Fase.
- **Histórico de NDVI com poucos pontos reais**: só existe 1 aquisição real salva no banco de
  desenvolvimento no momento desta entrega — o gráfico foi verificado com 1 ponto (renderiza
  corretamente) e por leitura de código para o caso multi-ponto; não há hoje um talhão real com 3+
  aquisições pra fotografar visualmente uma tendência longa.
- **Poluição de dado de teste pré-existente** (já documentada no fechamento da Fase 1): o talhão "Área
  03" acumulou 30 ordens de coleta vazias de execuções anteriores da suíte e2e, o que faz a ordem
  "padrão" (mais recente) nem sempre ser a que tem pontos reais — não é um bug desta Fase, mas afeta a
  primeira impressão ao abrir Evidências nesse talhão específico sem trocar de ordem manualmente.

## Estado local e remoto

```
git branch --show-current                              → feature/raiz-2.0-fase2
git log feature/raiz-2.0-fase2 --not feature/raiz-2.0-fase1   → commits desta Fase (ver hash no fechamento)
```

Nenhum merge, deploy, migração ou alteração de produção foi executado.
