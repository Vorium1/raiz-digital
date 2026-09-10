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

## O que NÃO foi feito nesta rodada (pendência real, não maquiada)

As Etapas 4-7 do briefing (Central de Decisão redesenhada de fato, página Talhão 360° nova, ajustes de
linguagem em mapas/NDVI, QA visual em 5 larguras + suíte de testes automatizados cobrindo os 10 cenários
pedidos) **não foram construídas nesta sessão**. Não é falta de vontade — é uma estimativa honesta: cada
uma dessas é, sozinha, um trabalho substancial (a Central de Decisão pede um "mapa da carteira" que hoje
não existe como componente reutilizável — os mapas existentes são todos por talhão/ordem, não por carteira
inteira; o Talhão 360° é uma página nova com 4 seções). Preferi entregar as Etapas 1-3 completas, testadas
de verdade e revisáveis, a entregar as 7 etapas pela metade e sem teste real.

**Próximo passo sugerido**: revisar esta entrega (branch `feature/raiz-2.0-fase1`) e decidir se sigo direto
pra Etapa 4 (Central de Decisão) na sequência, ou se algum ponto aqui merece ajuste primeiro.
