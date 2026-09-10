# RAIZ 2.0 — Fase 1, Etapa 1: diagnóstico confirmado no código real

Branch: `feature/raiz-2.0-fase1` (a partir de `develop`). Investigação feita lendo o código real (não suposição), 2026-09-10.

## Resumo por item

| Item | Alegação | Veredito |
|---|---|---|
| A | Filtro de cliente no dashboard só atualiza parte dos indicadores | **CONFIRMADO** |
| B | "0 críticos"/"0 fora de faixa" confunde "não avaliado" com "OK" | **NÃO CONFIRMADO literalmente** — achado real correlato (ver abaixo) |
| C | Análise mostra estados contraditórios ao mesmo tempo | **CONFIRMADO** |
| D | Escore de confiabilidade diverge entre telas | **CONFIRMADO** |
| E | `/coletas` reúne tudo (talhão, mapa, satélite, cadastro, ordens) numa página só | **CONFIRMADO** |
| F1 | "Ver pontos" abre criar nova ordem | **CONFIRMADO** |
| F2 | "Análises" no talhão abre evolução histórica, não a lista de análises | **CONFIRMADO** |
| F3 | Alerta de pontos pendentes não pré-seleciona a ordem | **CONFIRMADO** |
| G | Lista "Talhões" em `/mapas` repete o talhão por ordem | **CONFIRMADO** |
| H | Texto "coordenada real"/"dados reais" ignora `gps_source` estimado | **CONFIRMADO** |
| I | Cabeçalho da Biblioteca Técnica é estático, não uma contagem real ACTIVE/DRAFT | **PARCIAL** (mitigado por aviso ao lado e badges corretos por item) |
| J | Estado vazio aparece antes do carregamento terminar | **NÃO CONFIRMADO** (padrão `loading`/`null` já usado corretamente) |

## A — Dashboard, filtro de cliente

`src/app/(platform)/dashboard/page.tsx:22-28` chama 5 fontes de dado em paralelo; só `getExecutiveDashboard` (grid "PAINEL EXECUTIVO") recebe `filters`. `getDashboardSnapshot`, `listAnalyses`, `listOperationalAlerts` (hero, "Indicadores reais", teaser de alertas, atividade recente) ignoram o cliente selecionado, sem nenhum aviso visual de escopo diferente.

## B — achado real correlato

A query de "Parâmetros fora de faixa" (`analytics-dashboard.ts:93-98`) já exclui itens não-interpretáveis corretamente. Mas: uma análise com parâmetro aguardando homologação vira `interpretations.status='CALCULATED'` + `analyses.status='READY_TO_INTERPRET'` (não `IN_REVIEW`, não `INCONSISTENT`) — por isso **não aparece nem em "Interpretações pendentes" nem em "Talhões críticos"** no dashboard. Fica só como alerta de prioridade baixa em `/alertas`, efetivamente invisível no painel principal.

## C — Estados contraditórios da análise

`src/lib/repositories/interpretations.ts:79-102`: quando o motor não interpreta nada (`interpretable=false`), grava `interpretations.status='CALCULATED'` (com motivo de bloqueio) **e** `analyses.status='READY_TO_INTERPRET'` — cujo rótulo é literalmente "Pronta para interpretar", mesmo já tendo rodado e falhado. As duas informações aparecem juntas na mesma tela de detalhe. Além disso, o mesmo valor de enum (`CALCULATED`) tem **dois rótulos diferentes** em duas telas (`agronomic-intelligence-panel.tsx:34` vs `inteligencia/page.tsx:13`).

## D — Duas fórmulas de confiabilidade

- Fórmula 1 (qualidade do laudo importado): `src/domain/lab-import.ts:251-268`, salva em `analyses.confidence_score`.
- Fórmula 2 (completude da interpretação agronômica): `src/domain/agronomic-engine.ts:380-387`, salva só dentro de `interpretations.structured_output->'confidence'`.

Ambas chamadas só de "Confiabilidade" nas telas, com pesos e fontes diferentes. O relatório publicado usa a Fórmula 1; o snapshot realmente hasheado em `reports` carrega a Fórmula 2 dentro do JSON, mas nenhuma tela lê esse campo.

## Mapa real do pipeline (pra Etapa 2)

```
analysis_imports (status) -> lab_samples/lab_results (normalização)
  -> interpretations.status (CALCULATED -> IN_REVIEW -> APPROVED -> PUBLISHED/SUPERSEDED)
  -> reports (existência = publicado; analyses.status NÃO é atualizado na publicação)

analyses.status é uma máquina solta, paralela ao estado real -- não confiável sozinha.
READY_TO_INTERPRET, apesar do nome, é setado quando a interpretação JÁ RODOU e falhou.
```

## E, F1, F2, F3, G — navegação e links

Todos confirmados com `arquivo:linha` exato (ver relatório completo do agente, resumido acima). Causas pontuais e fáceis de corrigir sem redesenho:
- F1: `properties-fields-browser.tsx:172` aponta pra âncora estática de criar ordem.
- F2: `properties-fields-browser.tsx:173` aponta pra `/relatorios/evolucao/[fieldId]`, não pra lista de análises.
- F3: `alerts.ts` gera `href: "/coletas"` sem `orderId`; `coletas/page.tsx` não lê query param nenhum pra pré-selecionar ordem.
- G: `agronomic-map-explorer.tsx` lista `orders` (uma linha por ordem) sob o rótulo "Talhões", em vez de `fields` deduplicados.

## H, I — linguagem sobre origem do dado

- H: `mapas/page.tsx:16`, `relatorios/coleta/[orderId]/page.tsx:30,50` afirmam "dados reais"/"coordenada real" de forma incondicional, mesmo quando pontos reais em produção têm `gps_source='ESTIMADO_SEM_CAPTURA_REAL'`.
- I: cabeçalho da Biblioteca Técnica (`biblioteca-tecnica/page.tsx:41,16`) é string fixa "regras homologadas" — mitigado pela frase de aviso ao lado, mas não é uma contagem real.

## Pendências desta etapa

Nenhuma — todos os 10 itens foram investigados e têm veredito com evidência de código. Segue pra Etapa 2/3 com este documento como base.
