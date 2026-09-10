# RAIZ 2.0, Fase 1 — Entrega para revisão (parcial, honesta)

Branch: `feature/raiz-2.0-fase1` (a partir de `develop`, 4 commits, nada publicado em produção nem em `develop`/`main`).

## O que foi concluído (real, testado)

### Etapa 1 — Diagnóstico confirmado no código
Ver `docs/RAIZ_2.0_FASE1_ETAPA1_DIAGNOSTICO.md`: 10 alegações da auditoria investigadas contra o código
real (não suposição). 9 confirmadas com evidência `arquivo:linha`, 1 parcial, 1 não confirmada.

### Etapa 1/3 — Correções concretas de link/navegação/linguagem
- "Ver pontos" no talhão abria criar nova ordem → agora leva pra ordem real (`?orderId=`).
- "Análises" no talhão abria evolução histórica → agora filtra a lista real de análises por talhão.
- Alerta de "pontos pendentes"/"coleta atrasada" não identificava a ordem → agora inclui `?orderId=`.
- Lista "Talhões" em `/mapas` repetia o talhão por ordem de coleta → agora agrupa por talhão real, ordens
  ficam subordinadas.
- Textos "coordenada real"/"dados reais" afirmavam GPS confirmado incondicionalmente → agora condicional
  ao `gps_source` real de cada ponto.
- Cabeçalho da Biblioteca Técnica dizia "regras homologadas" sem contagem → agora mostra a proporção real
  ACTIVE/total.

### Etapa 2 — Camada única de leitura de status/confiabilidade
- `analyses.status='READY_TO_INTERPRET'` ("Pronta para interpretar") é gravado quando o motor JÁ RODOU e
  NÃO achou parâmetro interpretável — `analysisDisplayStatus()` mostra o estado real e o motivo. Verificado
  ao vivo nas 3 análises reais do Cabeda.
- Duas telas tinham rótulos diferentes pro mesmo valor de banco — unificado em
  `src/domain/interpretation-status.ts`.
- Duas fórmulas de "Confiabilidade" (qualidade do laudo vs. completude da interpretação) com o mesmo nome
  — agora "Confiabilidade do laudo" vs. "Confiabilidade da interpretação", consistente nas telas e relatório.
- Filtro de cliente no dashboard só afetava o painel executivo — agora afeta também o hero e o fluxo de
  análises. Verificado ao vivo: 48 pontos totais = 32 + 16 por cliente.
- Análises aguardando homologação sumiam dos indicadores de destaque — novo indicador "Não avaliado (falta
  homologação)".
- Jargão técnico (`app.tenant_id`, "PostgreSQL") removido da interface comercial.

### Etapa 3 — Navegação em 5 entradas
Reorganizado `src/lib/navigation.ts` no percurso pedido (Central de Decisão / Talhões / Operação /
Inteligência / Entregas + Administração secundária), reaproveitando todas as rotas existentes, nenhuma
nova criada. Testando a navegação no celular, achei e corrigi um bug real e pré-existente (não introduzido
por mim, só exposto pela reorganização): grupos de 1 item no menu "Mais" ficavam quase todo cortados por
um bug de `flex-shrink` — confirmado medindo `scrollHeight`/`offsetHeight` real, corrigido.

**Testado em todos os itens acima**: `npm run typecheck` e `npm run build` aprovados a cada etapa; a
maioria das correções foi verificada ao vivo contra o banco de dev real (sessão real inserida, chamadas
HTTP reais, screenshots reais desktop 1440px e mobile 390px) — não são alegações não verificadas.

### Etapa 4 (parcial) — Central de Decisão: Prioridades acionáveis
Construí a primeira peça real da Central de Decisão: seção "Prioridades acionáveis" no `/dashboard`, lista
real (não mockada) do que exige atenção agora — objeto, motivo, situação, data (quando existe de verdade)
e destino correto, clicável direto pro registro certo. Dois bugs reais achados e corrigidos NO PROCESSO de
testar com dado real (não hipotéticos):
- Minha primeira tentativa de agrupar alertas repetidos (pedido do briefing, para o aviso climático que
  dispara 1x por talhão) era genérica demais e fundiu ordens de coleta DIFERENTES que coincidentemente
  tinham o mesmo texto ("2 de 3 pontos pendentes") — corrigido, restrito só às categorias onde um evento
  real dispara vários alertas por natureza.
- A descrição longa do aviso climático não estava truncando (deveria cortar em 2 linhas) — bug de
  especificidade CSS (mesmo padrão de outro bug já achado antes nesta sessão), corrigido.

Verificado com screenshot real desktop e mobile, e com números reais do banco de dev.

## O que NÃO foi feito nesta rodada (pendência real, não maquiada)

Dentro da Etapa 4, falta o "Mapa da carteira" (item C da estrutura pedida) — hoje não existe nenhum
componente de mapa que mostre TODOS os talhões da carteira de uma vez; os mapas existentes
(`RealFieldMap`, `AgronomicMapExplorer`) são todos por talhão/ordem individual. Precisaria de uma consulta
nova (todos os `fields.boundary` do tenant/cliente filtrado) e um componente que desenhe múltiplos
polígonos num mapa só — não é grande, mas é trabalho novo, não reaproveitamento direto.

As Etapas 5-7 do briefing (página Talhão 360° nova com 4 seções, ajustes de linguagem em mapas/NDVI, QA
visual formal em 5 larguras + suíte de testes automatizados cobrindo os 10 cenários pedidos) **não foram
construídas nesta sessão**. Não é falta de vontade — é uma estimativa honesta: o Talhão 360° sozinho é uma
página nova inteira. Preferi entregar as Etapas 1-4(parcial) completas, testadas de verdade e revisáveis,
a entregar as 7 etapas pela metade e sem teste real.

**Próximo passo sugerido**: revisar esta entrega (branch `feature/raiz-2.0-fase1`, 6 commits) e decidir se
sigo direto pro resto da Etapa 4 (mapa da carteira) e Etapa 5 (Talhão 360°) na sequência, ou se algum ponto
aqui merece ajuste primeiro.
