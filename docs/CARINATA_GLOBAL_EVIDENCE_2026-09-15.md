# RAIZ Digital — Evidência global de Carinata (2026-09-15)

## Objetivo

Ampliar a base técnica de `Brassica carinata` além de RS/SC sem converter automaticamente resultados de outros ambientes em dose regional. A evidência externa pode apoiar diagnóstico, desenho de ensaio, interpretação e revisão profissional; recomendação quantitativa automática continua bloqueada sem regra determinística homologada para o domínio alvo.

## Estado consolidado

- Há evidência de campo consistente de resposta de carinata a N em diferentes ambientes dos EUA.
- Há evidência direta de interação N × S: deficiência de S pode limitar a resposta ao N.
- Há dados de acúmulo/partição de N, P, K, S, Zn e B, mas absorção/remoção não equivale a dose de fertilizante.
- Há recomendações de extensão para o Sudeste dos EUA, inclusive sobre P/K por analogia com canola e risco de B; isso permanece contextual, não uma tabela RS/SC.
- Não foi identificada, neste pacote, calibração regional independente suficiente para promover N/P/K/S/B de carinata a dose automática em RS/SC.

## Fontes integradas

### Alberti et al. (2019) — South Dakota

- **Título:** Nitrogen Requirements of Ethiopian Mustard for Biofuel Feedstock in South Dakota
- **Periódico:** Agronomy Journal 111:1304–1311
- **DOI:** `10.2134/agronj2018.06.0419`
- **Domínio:** dois locais; 2015–2016; doses 0, 28, 56, 84 e 140 kg N/ha.
- **Observação:** rendimento de semente e óleo atingiram pico no tratamento de 84 kg N/ha; EONR reportada de 60–81 kg N/ha.
- **Uso RAIZ:** evidência experimental contextual. Não é dose para RS/SC.

### Seepaul et al. / estudo de N e acúmulo — Florida

- **Título:** Carinata Dry Matter Accumulation and Nutrient Uptake Responses to Nitrogen Fertilization
- **DOI:** `10.2134/agronj2018.10.0678`
- **Domínio:** Quincy, Florida; sandy loam; 0, 45, 90 e 135 kg N/ha; dois anos.
- **Observação:** máximo modelado de rendimento em 102,3 kg N/ha e EONR de 93 kg N/ha; absorção de N acelerada entre bolting e florescimento.
- **Uso RAIZ:** mecanismo/resposta contextual; não promover dose.

### Bhattarai et al. (2021) — N × S, South Dakota

- **Título:** Nitrogen and sulfur fertilizers effects on growth and yield of Brassica carinata in South Dakota
- **Periódico:** Agronomy Journal 113:1945–1960
- **DOI:** `10.1002/agj2.20501`
- **Domínio:** Brookings, 2017–2018; N 56–140 kg/ha; S 0, 22 e 45 kg/ha.
- **Observação:** ausência de S reduziu resposta ao N; EONR 47–93 kg N/ha e EOSR 20–26 kg S/ha no domínio experimental.
- **Uso RAIZ:** forte evidência de interação N × S, mas taxa permanece específica do experimento.

### Bashyal et al. (2021) — Coastal Plain FL/GA

- **Título:** Brassica carinata biomass, yield, and seed chemical composition response to nitrogen rates and timing on southern Coastal Plain soils in the United States
- **Periódico:** GCB Bioenergy 13:1275–1289
- **DOI:** `10.1111/gcbb.12846`
- **Domínio:** cinco site-years; Florida/Georgia; não irrigado; loamy sand, sandy loam e sandy clay loam; amostragem a 15 cm; pH 1:1 solo:água de 5,8 a 6,4.
- **Observação:** resposta de rendimento até 134 kg N/ha no intervalo testado; estudo de timing indicou maior retorno econômico com duas aplicações e EONR mediana de 130 kg N/ha, com intervalo crível central 116–152 kg N/ha.
- **Uso RAIZ:** este é o único perfil desta rodada usado pelo avaliador formal de transferibilidade. Mesmo quando o alvo é fortemente comparável, a dose automática permanece bloqueada.

### Bashyal et al. (2023) — acúmulo de nutrientes

- **Título:** Brassica carinata nutrient accumulation and partitioning across maturity types and latitude
- **Periódico:** Crop Science 63:833–851
- **DOI:** `10.1002/csc2.20900`
- **Domínio:** quatro site-years em Florida e North Carolina, com diferentes solos, latitudes e genótipos.
- **Observação:** quantifica acúmulo/partição de N, P, K, S, Zn e B.
- **Uso RAIZ:** balanço e demanda fisiológica; nunca converter diretamente acúmulo em dose de fertilizante.

### UF/IFAS — guia de produção

- **Título:** Carinata, the Sustainable Crop for a Bio-based Economy: Production Recommendations for the Southeastern United States
- **Código:** SS-AGR-384/AG389
- **URL:** `https://ask.ifas.ufl.edu/publication/AG389`
- **Observação:** recomenda análise de solo, referencia canola para P/K, descreve manejo de N/S e condições associadas a deficiência de B.
- **Data:** a página consultada não expõe data de publicação inequívoca; o campo de ano permanece `null` para evitar inferência.
- **Uso RAIZ:** guia regional externo, útil para contexto e desenho de pesquisa. Não é tabela automática para RS/SC.

## Regra de transferibilidade implementada

O perfil `CARINATA-N-COASTAL-PLAIN-2021` exige compatibilidade explícita com o domínio observado:

- cultura = carinata;
- regime hídrico = sequeiro;
- textura = loamy sand, sandy loam ou sandy clay loam;
- pH = 5,8–6,4;
- método de pH = 1:1 solo:água;
- profundidade da amostra = 15 cm.

`UNKNOWN` é normalizado para contexto ausente, não para categoria comparável. Assim, dado desconhecido resulta em `INSUFFICIENT_CONTEXT`, e não em falsa incompatibilidade nem aprovação por aproximação.

## Gates de segurança

1. `STRONGLY_COMPARABLE` significa apenas que o alvo está dentro do domínio crítico declarado pela fonte.
2. Comparabilidade **não** cria regra de dose.
3. `quantitativeUseStatus` permanece `REVIEW_ONLY`.
4. `quantitativeApplicabilityApproved = false`.
5. `homologatedRuleId = null`.
6. A analogia com canola para P/K não é promovida automaticamente.
7. B continua com margem de segurança estreita e não deve virar aplicação genérica.
8. S deve ser considerado quando evidência de N usada depender de disponibilidade de S.

## Próxima lacuna científica relevante

Para transformar carinata em recomendação regional determinística para RS/SC ainda são necessários ensaios/calibrações locais ou um conjunto de evidências transferíveis suficientemente robusto e explicitamente homologado por cultura, solo, método, manejo, produtividade e nutriente. Até isso existir, a RAIZ deve usar a evidência global para contexto e priorização de pesquisa, não para preencher automaticamente N/P/K/S/B.
