# Night Shift — RAIZ Digital — 2026-09-30

## Base verificável

- Branch de entrada: `work/agent-night-2026-09-30`
- Base: `feature/report-dose-completeness`
- HEAD de base: `c19de5eff55150441b14f1b15e172ed21afb94d0`
- PR de relatório: #124, draft, sem merge
- #123: frente de Resultados + Relatório tecnicamente pronta no HEAD acima
- CI: `36661785779` — SUCCESS
- Browser QA: `36661785783` — SUCCESS
- Vercel Preview: SUCCESS
- Nenhum merge ou deploy de produção autorizado

## Missão da madrugada

1. Ler `AGENTS.md`, #113 e #126 antes de alterar código.
2. Confirmar que #123/#124 continua verde. Se houver regressão P0, corrigir primeiro.
3. Iniciar o Item 10 (#126) em branch própria empilhada sobre esta base, sem contaminar #124.
4. Implementar a linha do tempo/reconstrução da decisão usando somente registros existentes:
   - eventos cronológicos por safra/coleta/análise/manejo/decisão/prescrição/entrega/acompanhamento quando existirem;
   - filtros por tipo e período;
   - vínculo explícito entre decisão e evidência de origem;
   - ausência permanece ausência; não inferir histórico;
   - isolamento multiempresa/RLS;
   - desktop + mobile;
   - testes de ordenação, filtros, tenant isolation e vínculo decisão/evidência.
5. Rodar testes em profundidade progressiva e corrigir a primeira falha determinística antes de empilhar mais feature.
6. Criar/atualizar draft PR empilhado quando isso melhorar a auditoria. Nunca mergear.
7. Ao concluir #126 tecnicamente, registrar checkpoint. Só então iniciar partes determinísticas de #127, se não houver decisão humana pendente.

## Proibições desta execução

- não fazer merge;
- não publicar/deployar produção;
- não escrever dados agronômicos em produção;
- não mudar domínio/secrets;
- não inventar dose, histórico, coordenada, NDVI, clima, custo, produto ou evidência;
- não reinterpretar snapshot publicado com dado vivo;
- não reduzir segurança/RLS para fazer teste passar.

## Encerramento obrigatório

Antes de parar, comentar o issue ativo com:
- concluído;
- branch/base/HEAD;
- CI;
- Browser QA;
- PR;
- bloqueios externos;
- próximo passo exato.

Se a única coisa restante exigir autorização humana, parar em estado seguro e explicar a decisão necessária sem executar a ação protegida.
