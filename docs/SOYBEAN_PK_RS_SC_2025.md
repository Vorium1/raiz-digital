# P e K da soja — perfil RS/SC 2025

## Escopo

Este documento registra a atualização da RAIZ para a fonte regional corrente `Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027`, 44ª Reunião de Pesquisa de Soja da Região Sul, 2025, item 2.5.2 (pp. 37–44).

A atualização não substitui retroativamente o perfil histórico `PK-SOJA-CQFS-2016`. A edição regional 2025 preserva os valores-base das tabelas atribuídas à CQFS-RS/SC (2016), mas passa a ser a proveniência corrente para novas decisões da soja em RS/SC.

## Tabela corrente de dose

A Tabela 2.8 da publicação de 2025 mantém os mesmos valores numéricos já codificados no perfil CQFS 2016:

| Classe | P2O5 1º cultivo | P2O5 2º cultivo | K2O 1º cultivo | K2O 2º cultivo |
|---|---:|---:|---:|---:|
| Muito Baixo | 155 | 95 | 155 | 115 |
| Baixo | 95 | 75 | 115 | 95 |
| Médio | 85 | 45 | 105 | 75 |
| Alto | 45 | 45 | 75 | 75 |
| Muito Alto | 0 | até 45 | 0 | até 75 |

Unidade: kg/ha de P2O5 ou K2O. Rendimento de referência: 3 t/ha. Para rendimento acima da referência, a publicação mantém acréscimo de 15 kg P2O5/ha e 25 kg K2O/ha por tonelada adicional.

Consequência de engenharia: os números não foram duplicados nem alterados. `SOJA_RS_SC_2025_DOSE_TABLE` preserva os valores do objeto histórico e troca a proveniência para a edição regional corrente.

## Classificação e método analítico

A publicação mantém a interpretação de P por classe de argila e de K por CTC a pH 7,0. As tabelas de classificação continuam referenciando CQFS-RS/SC (2016).

Quando o laboratório usa Mehlich-3, a edição 2025 explicita conversões para a base Mehlich-1:

- P: `PM1 = PM3 / [2,0 - (0,02 × argila)]`, com argila em porcentagem pelo método do densímetro;
- K: `KM1 = KM3 × 0,83`.

A RAIZ nunca presume que o método seja Mehlich-1 ou Mehlich-3. Para P por Mehlich-3, ausência de argila válida pelo método exigido bloqueia a conversão.

## Correção gradual versus total

A fonte descreve estratégias gradual e total. A RAIZ não escolhe automaticamente entre elas.

A correção total só é considerada no módulo atual para classes Muito Baixo ou Baixo, e exige contexto agronômico e econômico explícitos. Em solo com menos de 20% de argila ou CTC pH 7,0 menor que 7,5 cmolc/dm³, o fluxo de correção total é bloqueado pela política conservadora da RAIZ, preservando a cautela da publicação com solos arenosos/baixa CTC.

A estratégia gradual permanece compatível com a lógica de parcelamento por cultivos. O motor principal de dose continua usando a ordem de cultivo após a análise como entrada obrigatória.

## Posicionamento no sulco

A publicação 2025 diferencia necessidade agronômica total de limite seguro de posicionamento. A RAIZ mantém essa separação.

Quando não existe afastamento seguro entre fertilizante e semente, a camada de posicionamento bloqueia valores no sulco acima de 120 kg/ha de P2O5 ou 80 kg/ha de K2O. Quando há confirmação de posicionamento pelo menos 5 cm abaixo e 5 cm lateral à semente, o gate de posicionamento não aplica esses tetos. Isso não altera a necessidade agronômica total calculada.

## Ajuste por formulação comercial

A publicação admite variações de aproximadamente ±10 kg/ha nas quantidades da Tabela 2.8 para adequação às formulações disponíveis. A RAIZ deliberadamente **não** transformou isso em uma tolerância genérica do validador determinístico.

O ajuste somente pode passar pelo helper específico quando existe uma restrição de formulação comercial documentada. A IA não pode escolher livremente qualquer valor dentro de ±10 kg/ha. Sem essa justificativa, a barreira central continua exigindo a dose determinística exata (dentro da tolerância técnica de arredondamento já existente).

## Compatibilidade histórica

- `PK-SOJA-CQFS-2016` continua no catálogo para rastreabilidade de execuções anteriores.
- `PK-SOJA-RS-SC-2025` é a regra corrente usada por novas decisões de P/K da soja RS/SC.
- nenhuma execução histórica é reprocessada silenciosamente;
- milho e trigo permanecem nos respectivos perfis já homologados;
- o gate de predominância espacial/uniforme permanece inalterado: não há média ou pluralidade para fabricar uma classe representativa.

## Limites desta atualização

Esta mudança não escolhe produto comercial, não calcula custo, não promove formulações específicas, não transforma recomendação uniforme em taxa variável e não autoriza a IA a alterar doses. A conversão em produto e qualquer decisão espacial continuam sujeitas aos gates próprios da RAIZ.
