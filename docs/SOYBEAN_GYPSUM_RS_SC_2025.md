# Gessagem da soja — RS/SC 2025

## Objetivo

Estruturar a evidência regional corrente sobre gessagem da soja sem transformar uma síntese técnica ou uma referência algébrica em dose automática universal.

A RAIZ trata esta frente como **diagnóstico contextual + revisão profissional**. A regra de dose automática universal para RS/SC continua bloqueada.

## Fonte regional corrente

**Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027** — 44ª Reunião de Pesquisa de Soja da Região Sul, Embrapa Trigo / Universidade de Passo Fundo, 2025, seção 2.4 Gessagem, pp. 30–31.

Registro estável:
- https://www.alice.cnptia.embrapa.br/alice/handle/doc/1183120

A fonte regional explicita que:

- a decisão deve usar análise da camada de 20–40 cm;
- a saturação por Al é o principal indicador;
- sem deficiência hídrica, a resposta da soja fica restrita a condições mais severas, com saturação por Al >40%, probabilidade de resposta indicada em 40% e incremento médio de 5%;
- com deficiência hídrica, a resposta passa a ocorrer em condição menos extrema, com saturação por Al >10%, probabilidade indicada em até 97% e incremento médio de 12%;
- quando a saturação por Al é <5%, a probabilidade de resposta para mitigação da toxidez por Al é considerada muito baixa ou nula;
- em Latossolos, quando a gessagem é necessária, a síntese regional indica 2–3 t/ha como faixa associada a até 95% da produtividade máxima observada nos estudos utilizados;
- a fonte apresenta `Dose de gesso (kg/ha) = teor de argila (%) × 50` como critério prático para evitar problemas de doses elevadas;
- em solos com <15% de argila e Mg baixo, até 0,5 t/ha pode produzir efeito adverso;
- mesmo em Latossolos argilosos, doses elevadas, na ordem de 6–9 t/ha, foram associadas a redução de produtividade da soja;
- a calagem deve preceder a gessagem; gesso e calcário são complementares e não equivalentes.

## Evidência científica de apoio

Pias et al. (2020), *Agronomy Journal*, DOI `10.1002/agj2.20125`, analisaram 129 safras e 930 pares de observações em seis culturas sob plantio direto.

Para soja sob deficiência hídrica e saturação por Al >10% em 20–40 cm, o resumo do artigo informa 88% de probabilidade de resposta positiva e incremento médio de 12%.

Essa métrica de 88% não é silenciosamente substituída pelo valor de até 97% apresentado na indicação regional 2025. A RAIZ preserva os dois valores com sua proveniência, porque podem refletir definições/limiares estatísticos distintos de “resposta”.

## Regra implementada

`GYPSUM-SOYBEAN-RS-SC-2025`

Status: `REQUIRES_AGRONOMIST_REVIEW`.

O motor exige, para classificar o contexto:

- região RS ou SC;
- sistema plantio direto;
- camada diagnóstica 20–40 cm;
- saturação por Al válida e com origem validada;
- contexto hídrico conhecido;
- estado de Mg superficial;
- teor de argila para exibir referências de dose;
- confirmação de que a calagem foi executada antes da gessagem.

## O que o motor pode fazer

- classificar o contexto como maior resposta, resposta baixa/nula, intermediário, insuficiente ou fora do perfil regional;
- mostrar separadamente as probabilidades/efeitos publicados pelas fontes;
- calcular `argila × 50` somente como **referência publicada**;
- mostrar 2–3 t/ha somente como **faixa publicada para Latossolos**, não como prescrição do talhão;
- bloquear o fluxo quando faltar contexto crítico;
- bloquear condição combinada de argila <15% + Mg baixo;
- alertar para terras baixas e outros domínios com maior incerteza.

## O que o motor não pode fazer

- escolher automaticamente uma dose de gesso;
- transformar 2–3 t/ha em dose universal;
- usar `argila × 50` como prescrição oficial sem revisão;
- extrapolar o perfil para fora de RS/SC;
- tratar gesso como substituto da calagem;
- prometer resposta de produtividade;
- apagar divergências entre fontes por média ou consenso artificial.

## Consequência para o catálogo antigo

`GYPSUM-RS-SC-AUTOMATIC` permanece `INSUFFICIENT_EVIDENCE` para dose automática universal.

A novidade é mais precisa: existe evidência regional forte o bastante para **diagnóstico contextual e referências de manejo**, mas isso não equivale a uma única função determinística de dose aplicável a qualquer solo, talhão, regime hídrico ou sistema.
