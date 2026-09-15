# Ledger de fontes — gessagem da soja RS/SC 2025

## Fonte regional principal

**Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027**

- instituição: 44ª Reunião de Pesquisa de Soja da Região Sul / Embrapa Trigo / Universidade de Passo Fundo
- ano: 2025
- escopo: RS/SC
- localização: seção 2.4 Gessagem, pp. 30–31
- registro: https://www.alice.cnptia.embrapa.br/alice/handle/doc/1183120
- papel na RAIZ: fonte regional corrente para enquadrar o diagnóstico e as referências publicadas de manejo
- uso quantitativo: `REVIEW_ONLY`

### Conteúdo estruturado

- camada diagnóstica: 20–40 cm
- indicador principal: saturação por Al
- soja sem deficiência hídrica: resposta regional mais restrita quando Al >40%; 40% de probabilidade de resposta e incremento médio de 5%
- soja com deficiência hídrica: Al >10%; probabilidade regional indicada em até 97% e incremento médio de 12%
- Al <5%: resposta para mitigação de toxidez por Al considerada muito baixa ou nula
- Latossolos: 2–3 t/ha associadas, na síntese dos estudos, a até 95% da produtividade máxima
- referência algébrica: `gesso (kg/ha) = argila (%) × 50`
- risco: <15% de argila + Mg baixo; a própria fonte relata efeito adverso já em dose de 0,5 t/ha
- risco: doses elevadas (6–9 t/ha) também foram associadas a queda de produtividade em Latossolos argilosos
- pré-requisito: calagem antes da gessagem

## Evidência científica de apoio

**Pias, O. H. de C. et al. Does gypsum increase crop grain yield on no-tilled acid soils? A meta-analysis. Agronomy Journal, 2020, 112:675–692.**

- DOI: `10.1002/agj2.20125`
- desenho: meta-análise
- base: 129 safras, 930 pares de observações, seis culturas
- sistema: solos ácidos sob plantio direto
- soja + deficiência hídrica + Al >10% em 20–40 cm: 88% de probabilidade de resposta positiva no resumo do artigo e incremento médio de 12%
- papel na RAIZ: evidência mecanística/quantitativa de apoio ao enquadramento do contexto; não fornece dose oficial do talhão
- uso quantitativo: `REVIEW_ONLY`

## Divergência preservada

A indicação regional 2025 informa probabilidade de resposta de **até 97%** para o contexto de soja sob deficiência hídrica e Al >10%, enquanto o resumo publicado da meta-análise informa **88%** de probabilidade de resposta positiva sob o mesmo limiar geral.

A RAIZ não converte 97 e 88 em média e não escolhe silenciosamente um dos valores. O motor mantém os dois com proveniência separada e marca `POSITIVE_RESPONSE_PROBABILITY_DIFFERS_BY_SOURCE_METRIC`.

## Decisão de engenharia

- `GYPSUM-SOYBEAN-RS-SC-2025`: `REQUIRES_AGRONOMIST_REVIEW`
- `GYPSUM-RS-SC-AUTOMATIC`: continua `INSUFFICIENT_EVIDENCE`
- `argila × 50`: referência calculável, não prescrição automática
- 2–3 t/ha: faixa de síntese para Latossolos, não dose universal
- nenhuma probabilidade publicada é convertida em garantia de resposta de produtividade
