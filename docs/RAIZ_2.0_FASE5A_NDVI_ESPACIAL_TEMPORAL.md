# RAIZ 2.0 — Fase 5A: NDVI espacial + temporal

Data: 2026-09-12

## Objetivo

Transformar a camada de satélite do Talhão 360 em inteligência espacial e temporal baseada em dado real do Sentinel-2 L2A, sem converter NDVI em produtividade, sem atribuir causa agronômica automaticamente e sem fabricar raster.

## Entrega

### 1. Série temporal real

- Fonte: Copernicus Data Space Ecosystem / Sentinel-2 L2A.
- A atualização consulta uma janela de 120 dias pela Statistical API.
- Até 18 aquisições válidas mais recentes são persistidas por atualização.
- A gravação continua idempotente por `tenant + field + captured_at + source`.
- O GET da tela não consome quota externa: lê apenas snapshots já persistidos.

### 2. Máscara de qualidade correta

O evalscript passou a usar SCL + dataMask. Nuvem, cirrus, sombra, neve/gelo, pixel defeituoso e classes inválidas são excluídos. A coluna histórica `cloud_cover_pct` continua existindo por compatibilidade, mas no pipeline atual representa a fração de pixels mascarados/sem dado válido dentro do talhão.

Correção importante: na Statistical API, `noDataCount` é subconjunto de `sampleCount`. Portanto:

- pixels válidos = `sampleCount - noDataCount`;
- percentual mascarado = `noDataCount / sampleCount * 100`.

Nunca usar `sampleCount + noDataCount` como denominador.

### 3. Inteligência temporal determinística

A leitura mais recente é comparada com:

- a aquisição imediatamente anterior;
- a mediana de até cinco aquisições anteriores, quando existem pelo menos três pontos de baseline.

O limiar operacional de mudança relevante é `|Δ NDVI| >= 0,12`. Ele é apenas um sinal de priorização para investigação; não é limiar de deficiência, não conhece fenologia e não autoriza prescrição.

### 4. Raster NDVI espacial real

Foi adicionada integração server-side com a Copernicus Process API:

- PNG recortado pela geometria real do talhão;
- alpha transparente fora da geometria e para pixels mascarados;
- cores usam as mesmas faixas determinísticas do motor NDVI;
- OAuth client secret permanece somente no servidor;
- a data solicitada precisa existir no histórico NDVI daquele talhão/tenant;
- nenhum raster de cliente é versionado no GitHub.

O endpoint autenticado é:

`GET /api/fields/[id]/ndvi/map?date=YYYY-MM-DD`

### 5. Talhão 360

O painel Satélite agora apresenta:

- mapa NDVI sobre imagem-base real;
- seleção entre aquisições históricas registradas;
- NDVI médio e qualidade da aquisição selecionada;
- distribuição das faixas de vigor;
- variabilidade interna;
- sinal temporal versus leitura anterior e baseline;
- gráfico e histórico de aquisições.

Datas `YYYY-MM-DD` são formatadas sem passar por conversão UTC, evitando deslocamento de um dia em fusos como UTC-3.

## Governança

A camada NDVI NÃO:

- estima produtividade;
- diagnostica causa de mancha;
- prescreve insumo;
- mistura automaticamente química do solo com vigor;
- usa posições aproximadas como georreferenciamento real;
- grava imagem fictícia quando o provedor externo falha.

O próximo cruzamento com solo deve ser tratado como coincidência espacial/temporal e hipótese para investigação, nunca causalidade.

## Validação

- testes puros ampliados para validar classificação, variabilidade, qualidade, temporalidade, semântica de pixels válidos e envelope espacial;
- typecheck e build devem permanecer verdes antes de merge em `develop`;
- chamada real da Process API depende de `COPERNICUS_CLIENT_ID` e `COPERNICUS_CLIENT_SECRET` válidos no ambiente DEV/Preview e deve ser validada antes de qualquer promoção para produção.

## Fora do escopo desta etapa

- armazenamento permanente de raster/COG;
- tiles próprios;
- amostragem de NDVI exatamente sobre cada ponto de solo;
- inferência causal solo × satélite;
- publicação em `main` ou produção.
