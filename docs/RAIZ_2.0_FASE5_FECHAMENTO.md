# RAIZ 2.0 — Fase 5 — Fechamento técnico

Data: 2026-09-12

## Estado

**Implementação de código concluída em `develop`; validação de runtime externo ainda pendente.**

A Fase 5 transformou o bloco de satélite de uma leitura agregada isolada em uma camada espacial e temporal integrada ao Talhão 360° e à visão de carteira. O princípio de governança foi preservado do início ao fim: NDVI é evidência de sensoriamento remoto, não estimativa de produtividade, causa agronômica ou prescrição.

## Entregas consolidadas

### 5A — Série temporal Sentinel-2

- consulta histórica de até 120 dias via Copernicus Data Space;
- persistência idempotente das aquisições reais mais recentes;
- máscara SCL para nuvem, sombra e pixels inválidos;
- qualidade operacional da observação;
- comparação temporal determinística com aquisição anterior e mediana do próprio talhão;
- baseline usa apenas aquisições com qualidade alta/moderada;
- leitura atual de qualidade baixa ou indeterminada permanece visível, mas não dispara mudança temporal acionável.

### 5B — Raster NDVI espacial real

- visualização PNG gerada pelo Copernicus Process API;
- raster recortado pela geometria real do talhão;
- pixels mascarados ficam transparentes;
- georreferenciamento por envelope espacial do próprio talhão;
- navegação entre aquisições históricas já persistidas;
- endpoint autenticado não aceita uma data arbitrária fora do histórico daquele talhão.

### 5C — Solo × Satélite

- sobreposição dos pontos laboratoriais reais sobre o raster Sentinel-2;
- seleção do parâmetro de solo disponível no laudo;
- ponto usa `observed_position` quando existe e cai para `position` somente quando não há coordenada observada;
- valor, unidade, método, classificação, origem GPS e demais evidências permanecem auditáveis no mapa;
- quando a tela não fornece uma ordem de coleta, o backend resolve a ordem mais recente do próprio talhão que realmente possua resultados laboratoriais;
- cruzamento é explicitamente visual: coincidência espacial não prova causalidade e não gera prescrição automática.

### 5D — Cockpit e carteira

- sinal Sentinel-2 aparece na primeira dobra do Talhão 360°;
- estados executivos distinguem sem leitura, histórico em formação, histórico estável, alta/queda temporal, qualidade baixa e qualidade indeterminada;
- mapa da carteira pode alternar entre avaliação agronômica e camada temporal Sentinel-2;
- camada da carteira lê apenas snapshots já persistidos e não chama o Copernicus ao abrir o dashboard;
- clique em um talhão na camada satélite leva diretamente às evidências de Satélite do Talhão 360°.

## Governança preservada

A Fase 5 não:

- converte NDVI em sacas/ha ou qualquer produtividade estimada;
- diz que um padrão de NDVI foi causado por pH, P, K, doença, compactação ou outro fator sem evidência adicional;
- cria interpolação laboratorial onde só existem pontos amostrais;
- transforma o cruzamento Solo × Satélite em correlação estatística automática;
- produz dose ou prescrição a partir do raster;
- chama aquisição de baixa qualidade de tendência confiável.

## Validação automatizada

Os blocos foram integrados somente após `typecheck`, suíte `test:handoff` e build de produção passarem no GitHub Actions das respectivas branches/PRs.

## Pendência antes de produção

A implementação ainda precisa de **validação de runtime com credenciais reais do Copernicus no ambiente Preview/DEV**. Essa validação deve comprovar, com pelo menos um talhão real autorizado:

1. autenticação OAuth do Copernicus;
2. retorno real da Statistical API;
3. retorno PNG real da Process API;
4. alinhamento visual do raster com o contorno do talhão;
5. navegação entre datas históricas;
6. máscara de nuvem/sombra coerente;
7. sobreposição de ponto de solo na coordenada observada;
8. ausência de erro de CORS/cache/autenticação no Preview;
9. consumo/quota compatíveis com a operação prevista.

Até essa validação, a Fase 5 deve ser tratada como **código concluído e CI-validado, mas não homologado para produção**.

## Próxima fase

A Fase 6 deve priorizar experiência comercial e operacional: transformar a sofisticação já existente do motor e das evidências em uma central de decisão mais rápida, clara e vendável, sem enfraquecer rastreabilidade, revisão profissional ou separação entre evidência e conclusão.
