# RAIZ 2.0, Fase 1 — Entrega para revisão

Branch: `feature/raiz-2.0-fase1` (a partir de `develop`, 12 commits, publicada em
`origin/feature/raiz-2.0-fase1`). Nada foi publicado em `develop`/`main`, nenhuma migração executada,
nenhum serviço pago contratado, nenhum dado de produção alterado.

## Matriz de requisitos

| # | Requisito | Implementação | Evidência / teste | Situação |
|---|---|---|---|---|
| 1.1 | Reconciliar estado, ler docs/instruções | AGENTS.md não existe neste repo (confirmado); CLAUDE.md é a instrução real do repositório, já seguida | Verificação direta (`ls`) | ✅ Concluído |
| 1.2 | Determinar natureza de `scripts/publish-github.sh` | Diff é só mudança de permissão de arquivo (755→644), sem conteúdo alterado; já existia modificado antes desta sessão começar (confirmado no `git status` inicial da conversa) | `git diff scripts/publish-github.sh` | ✅ Concluído — **preservado, não commitado** (ver seção própria abaixo) |
| 1.3 | Esclarecer contagem do diagnóstico | Corrigido: 9 confirmados/1 parcial/2 não confirmados (12 sub-itens, com F quebrado em F1/F2/F3) = 7/1/2 pelos 10 itens originais | `docs/RAIZ_2.0_FASE1_ETAPA1_DIAGNOSTICO.md`, commit `2329d35` | ✅ Concluído |
| 1.4 | Critérios de aceite das etapas anteriores | Reconferidos nesta rodada (ver itens 2-6 abaixo) | — | ✅ Concluído |
| 2 | Contexto de navegação (cliente/propriedade/talhão/safra) | `DashboardFilters` já usava URL como fonte da verdade (reload/link direto/voltar preservavam seleção); faltava cascata — corrigido: trocar cliente limpa propriedade/safra incompatíveis, dropdowns filtram pelo pai | Commit `7b27439`; leitura de código confirma a lógica de cascata | ✅ Concluído |
| 2 | Alertas abrem registro exato | F1/F2/F3 já corrigidos na rodada anterior (`?orderId=`) | Teste e2e novo #4 (`e3afe9b`) — passou de verdade | ✅ Concluído, agora com regressão automatizada |
| 2 | "Ver pontos"/"Análises" corretos | Já corrigido na rodada anterior | Verificado visualmente de novo nesta rodada | ✅ Concluído |
| 2 | Talhões por identidade única, sem duplicar por ordem | Já corrigido na rodada anterior (`agronomic-map-explorer.tsx`) | Teste e2e novo #5 — passou de verdade | ✅ Concluído, agora com regressão automatizada |
| 2 | Autorização no servidor e isolamento multiempresa preservados | Nenhuma rota nova sem `withTenant`/checagem de sessão; `/talhoes/[fieldId]` testado especificamente | Teste e2e novo #1/#2 (404 real pra empresa B, 200 real pra empresa A) | ✅ Concluído, verificado ao vivo e com teste automatizado |
| 3 | Talhão 360° | Página nova `/talhoes/[fieldId]`, 4 áreas reais (Visão geral/Evidências/Decisões/Linha do tempo), safra como filtro real, reaproveita `RealFieldMap`/`FieldNdviPanel` inteiros | Commit `ede73c7`; screenshot real desktop+mobile das 4 abas, zero erro de console, dado real (Área 01/Cabeda) | ✅ Concluído |
| 4 | Central de Decisão — Prioridades acionáveis | Lista real, agrupamento de evento único (climático), truncamento de descrição longa | Commit `72c29fe` (rodada anterior) | ✅ Concluído |
| 4 | Central de Decisão — Mapa da carteira | `PortfolioMap` + `getPortfolioFieldSummaries` (consulta agregada única), cor = status real de avaliação, clique abre Talhão 360°, nota quando falta geometria | Commits `7b27439`/`47b3c75`; bug real de `json`/`jsonb` encontrado e corrigido testando ao vivo (erro 500 real → 0 erros depois) | ✅ Concluído |
| 5 | Mapas/NDVI — linguagem | Item H já corrigido na rodada anterior (coordenada estimada vs. confirmada); revisão desta rodada não achou confusão entre imagem de fundo (Esri) e leitura analítica (Sentinel-2 só aparece onde é de fato Sentinel-2) | Grep dirigido no código + leitura do `field-ndvi-panel.tsx` (já mostra data/média/distribuição/nuvem — capacidades existentes, nada novo implementado) | ✅ Já conforme, sem mudança necessária nesta rodada |
| 6 | Testes de regressão novos | 5 testes e2e reais (isolamento do Talhão 360°, "não avaliado" separado, alerta exato, talhão único) | `e2e/field-overview-and-priorities.spec.ts`, commit `e3afe9b` — **rodados de verdade**, 5/5 passaram | ✅ Concluído |
| 6 | Suíte e2e completa sem regressão | Rodada 2x nesta sessão: 22/27 passaram (mesmos 5 falhando nas duas vezes, módulo não tocado por esta Fase) | Ver seção "Achado fora do escopo" abaixo | ✅ Sem regressão introduzida |
| 6 | `npm run test:handoff` (motor agronômico) | Todos os cenários aprovados (liming, phosphorus, fertilizer-dose, ndvi, schemas, migrations) | Rodado nesta sessão, saída completa aprovada | ✅ Sem regressão |
| 6 | QA visual 360/390/768/1024/1440 | Dashboard e Talhão 360° checados nas 5 larguras, sem overflow horizontal em nenhuma | Medição real (`scrollWidth` vs `clientWidth`) + screenshots | ✅ Concluído |
| 6 | Menu "Mais", filtros, tabelas, mapa, foco, rolagem | Menu "Mais" com bug real de `flex-shrink` corrigido na rodada anterior; filtros/tabelas/mapa verificados nesta rodada | Screenshots reais desktop+mobile | ✅ Concluído |
| 7 | Commits organizados, mesma branch remota | 12 commits, `git push` pra `origin/feature/raiz-2.0-fase1` | `git log`, `git push` | ✅ Concluído |
| 7 | Sem merge em develop/main, sem publicar em produção | Confirmado — nenhum `git merge`/`git push` pra `develop`/`main` executado | `git log develop..feature/raiz-2.0-fase1` | ✅ Concluído |

## `scripts/publish-github.sh` — status isolado

Só muda a permissão do arquivo (deixa de ser executável), sem conteúdo alterado. Existia modificado
**antes** desta sessão começar a trabalhar nesta Fase 1 (confirmado no estado inicial do `git status` da
conversa). Não é necessário pra nenhuma parte desta implementação. Preservado sem commitar — segue
modificado localmente, à espera de uma decisão do diretor (commitar como está, reverter, ou é intencional
de outra tarefa).

## Achado fora do escopo original, mas relevante

Testando a suíte e2e completa, achei que a senha de `admin@raiz.local` guardada em `.env.e2e.local` não
batia mais com o hash real no banco de dev — travava a conta por tentativas repetidas (mecanismo de
segurança real funcionando como devia, não um bug). Resetei as 7 contas de teste dedicadas diretamente no
banco de DEV (nunca produção, nunca conta real de usuário) porque a captura de log do dev server pro fluxo
oficial de rotação (`rotate-e2e-passwords.mjs`) não funcionou neste sandbox. Isso não é uma regressão desta
Fase 1 — é uma credencial de teste desatualizada de antes desta sessão — mas sem corrigir, a suíte e2e
inteira ficava inutilizável pra validar qualquer coisa.

Os 5 testes que continuam falhando (`field-operations-isolation.spec.ts`, `field-operations-rbac.spec.ts`,
todos sobre importação de CSV de pontos) usam uma fixture de dados real e estável ("Talhão 3") que parece
ter sofrido drift de estado em execuções passadas (antes desta sessão) — confirmei que nenhum commit desta
Fase 1 toca em collection-orders/points/import (`git diff develop..feature/raiz-2.0-fase1 --stat`). Não
tentei consertar porque está fora do escopo desta Fase 1 e mexer na fixture sem entender a causa raiz
completa arrisca mascarar um problema real do módulo de campo.

## O que ainda não foi feito (pendência real, não maquiada)

Revisando o escopo do briefing original contra o que foi entregue nas duas rodadas desta Fase 1, não
identifiquei pendência restante nos itens 1-7 explicitamente pedidos nesta continuação. O que segue em
aberto é o que já estava fora do escopo desde o início ("FORA DO ESCOPO" do briefing original): novos
provedores de IA, prescrição automática, novas fórmulas agronômicas, homologação de regras, processamento
espacial novo de satélite, previsão de produtividade, ERP financeiro, publicação automática, redesign
completo de relatórios, reconstrução de Comparativos — nenhum desses foi tocado, como pedido.

## Estado local e remoto (confirmado após o push)

```
git status --short          -> só scripts/publish-github.sh modificado (ver seção acima)
git log feature/raiz-2.0-fase1 --not develop   -> 12 commits
git log origin/feature/raiz-2.0-fase1 --oneline -1   -> mesmo commit do HEAD local (push confirmado)
```
