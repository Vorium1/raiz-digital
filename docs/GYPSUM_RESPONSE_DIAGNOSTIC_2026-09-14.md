# RAIZ Digital — Gessagem: diagnóstico de resposta, não dose universal

Data do fechamento técnico: 2026-09-14

## Decisão de engenharia

A pesquisa ampliada confirma que **existe evidência relevante para gessagem em plantio direto no Sul e no Brasil**, portanto o problema não é ausência de conhecimento. O problema é transformar evidência heterogênea em uma dose universal.

A RAIZ passa a separar duas perguntas:

1. **Há contexto compatível com maior probabilidade de resposta ao gesso?** — pode ser avaliado deterministicamente em domínio fechado.
2. **Qual dose aplicar?** — permanece bloqueada para automação universal, pois modelos quantitativos concorrentes têm domínio e desempenho diferentes.

Nenhuma saída deste módulo substitui calagem, promete ganho de produtividade ou autoriza dose automática.

## Evidência principal para o diagnóstico — meta-análise 2020

**Pias, O. H. de C.; Tiecher, T.; Cherubin, M. R.; Silva, A. G. B.; Bayer, C. (2020). _Does gypsum increase crop grain yield on no-tilled acid soils? A meta-analysis_. Agronomy Journal 112:675–692. DOI 10.1002/agj2.20125.**

A meta-análise reuniu 129 safras/colheitas de seis culturas de grãos e 930 pares de observações em solos ácidos sob plantio direto.

Condições reportadas no resumo publicado:

- cereais (milho, trigo, aveia-branca, cevada e arroz): alta probabilidade de resposta quando a saturação por Al na camada 20–40 cm **excede 5%**;
- probabilidade observada de resposta positiva nos cereais: **77–97%**;
- aumento médio observado nos grupos responsivos: **14% com deficiência hídrica** e **7% sem deficiência hídrica**;
- soja: resposta positiva observada quando **deficiência hídrica** ocorreu junto com saturação por Al **acima de 10%** em 20–40 cm;
- nessa condição da soja, a probabilidade observada foi **88%** e o aumento médio **12%**.

Esses percentuais são estatísticas do conjunto de estudos e **não são previsão ou garantia para um talhão**. A implementação guarda essa distinção explicitamente.

Fonte primária: https://doi.org/10.1002/agj2.20125

## Revisão sistemática 2018 — Sul do Brasil

**Tiecher et al. (2018). _Crop Response to Gypsum Application to Subtropical Soils Under No-Till in Brazil: a Systematic Review_. Revista Brasileira de Ciência do Solo 42. DOI 10.1590/18069657rbcs20170025.**

A revisão examinou 73 safras em RS, SC e PR sob plantio direto. Para gramíneas, propôs como melhor diagnóstico de acidez de subsuperfície:

- saturação por Al >10% e/ou Ca trocável <3,0 cmolc/dm³ na camada 20–40 cm;
- confiabilidade combinada reportada de 89% para o critério naquele conjunto de dados.

Para leguminosas, a própria revisão declarou que o número de respostas positivas era pequeno demais para estabelecer critério equivalente; a resposta positiva de soja esteve fortemente associada à deficiência hídrica.

A revisão também mostrou forte dispersão das doses de máxima eficiência econômica (0–12,1 Mg/ha; desvio-padrão 3,2 Mg/ha) e baixa correlação entre as doses observadas e fórmulas existentes baseadas em argila, CTC ou Ca. Os autores concluíram que as recomendações de dose ainda eram severamente limitadas e precisavam de mais pesquisa.

Fonte primária: https://doi.org/10.1590/18069657rbcs20170025

## Método quantitativo candidato — Caires & Guimarães 2018

**Caires, E. F.; Guimarães, A. M. (2018). _A Novel Phosphogypsum Application Recommendation Method under Continuous No-Till Management in Brazil_. Agronomy Journal 110:1987–1995. DOI 10.2134/agronj2017.11.0642.**

O trabalho analisou experimentos do Sul do Brasil e literatura com **Latossolos/Oxisols em plantio direto contínuo de longa duração (≥10 anos)** e propôs, quando a saturação por Ca na CTC efetiva de 20–40 cm é <54%, elevar a 60% pela equação:

`PG (Mg/ha) = (0,6 × CTC efetiva − Ca trocável em cmolc/dm³) × 6,4`

Esse método é cientificamente relevante e deve permanecer registrado como **candidato quantitativo**, mas a RAIZ não o promove automaticamente enquanto a divergência de desempenho entre modelos/datasets não estiver homologada para o domínio de uso.

Fonte primária: https://doi.org/10.2134/agronj2017.11.0642

## Evidência de risco — Pampa, 2021

**Alves et al. (2021). _Soil chemical properties and crop response to gypsum and limestone on a coarse-textured Ultisol under no-till in the Brazilian Pampa biome_. Geoderma Regional 25:e00372. DOI 10.1016/j.geodrs.2021.e00372.**

Ensaio em Argissolo/Ultisol de textura grosseira, baixa CTC e baixa acidez de subsuperfície no Pampa/RS:

- doses de gesso de 0,0 a 4,0 Mg/ha;
- até 0,5 Mg/ha reduziu a produtividade do primeiro milho;
- aumento da relação Ca/Mg e redução de Mg trocável;
- o trabalho conclui que gesso em solos de baixa CTC e baixa acidez de subsuperfície pode não aumentar a produtividade e pode induzir deficiência de Mg.

O artigo indica CTC baixa <7,5 cmolc/dm³ no contexto experimental. A RAIZ usa isso **somente como alerta de risco quando o contexto equivalente estiver explicitamente validado**, nunca como proibição universal.

Fonte primária: https://doi.org/10.1016/j.geodrs.2021.e00372

## Contraponto de longa duração — Oxisol moderadamente ácido, 2019

**Fontoura et al. (2019). _Effect of gypsum rates and lime with different reactivity on soil acidity and crop grain yields in a subtropical Oxisol under no-tillage_. Soil & Tillage Research 193:27–41. DOI 10.1016/j.still.2019.05.005.**

Em Latossolo/Oxisol argiloso moderadamente ácido sob plantio direto de longa duração, doses de 0, 3, 6 e 9 Mg/ha de gesso não trouxeram benefício consistente de produtividade, enquanto a calagem superficial reduziu acidez em profundidade. O resultado reforça que `gesso = dose fixa` não é uma regra universal.

Fonte primária: https://doi.org/10.1016/j.still.2019.05.005

## Regra implementada nesta etapa

`GYPSUM-NT-RESPONSE-META-2020`

Domínio fechado:

- sistema: plantio direto;
- camada diagnóstica: exatamente 20–40 cm;
- saturação por Al precisa ser válida/rastreável;
- cereais suportados: milho, trigo, aveia-branca, cevada e arroz;
- soja exige contexto de deficiência hídrica para reproduzir o critério da meta-análise.

Saída:

- `HIGHER_RESPONSE_LIKELIHOOD`, `CRITERION_NOT_MET`, `INSUFFICIENT_CONTEXT` ou `OUTSIDE_EVIDENCE_DOMAIN`;
- estatísticas do estudo ficam rotuladas como observações de grupo, não previsão do talhão;
- alertas para Mg/K baixos, S baixo e risco específico de Argissolo/Ultisol grosseiro de baixa CTC quando o contexto estiver validado;
- `gypsumDoseKgHa = null` sempre nesta regra;
- revisão profissional recomendada.

## O que NÃO foi implementado

- multiplicador universal por teor de argila;
- transposição automática da fórmula do Cerrado;
- transformação do método Caires & Guimarães 2018 em dose oficial da RAIZ;
- uso do gesso como substituto de calcário;
- promessa de resposta produtiva;
- diagnóstico fora de 20–40 cm por interpolação silenciosa;
- inferência de deficiência hídrica da soja sem dado meteorológico/histórico.

## Próximo gate científico

Para liberar dose quantitativa de gesso no futuro, a RAIZ deverá homologar separadamente um domínio de aplicação (tipo de solo, sistema, profundidade, CTC/Ca, cultura/rotação, histórico e produto) e confrontar o método candidato com evidência independente e/ou histórico do próprio talhão. Até lá, o módulo serve para **diagnóstico de probabilidade de resposta e alerta de risco**, não prescrição de dose.
