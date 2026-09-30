# Catálogo de metodologias de calagem — RAIZ Digital

## Princípio

A profundidade e o método que chegam do laboratório são fatos de entrada. A RAIZ não divide uma amostra composta, não muda a profundidade e não escolhe uma fórmula por semelhança.

Fluxo obrigatório:

1. identificar região, cultura, sistema de manejo e profundidade real;
2. identificar as metodologias compatíveis com essa evidência;
3. calcular somente dentro do domínio documentado de cada método;
4. registrar método, edição, pH-alvo, profundidade e unidade no resultado;
5. preservar alternativas técnicas quando mais de uma pergunta puder ser calculada, sem transformá-las automaticamente em recomendação de aplicação.

## Métodos já registrados

| ID | Evidência | Uso | Estado |
| --- | --- | --- | --- |
| CQFS-RS-SC-2016-INTEGRATED-0-20 | amostra integrada 0–20 + SMP | necessidade equivalente da camada 0–20 pela Tabela 5.2 | implementado |
| SOYBEAN-RS-SC-2025-INTEGRATED-0-20 | soja RS/SC, convencional ou implantação do SPD, 0–20 | recomendação de aplicação segundo o perfil atual | implementado no motor da soja |
| SOYBEAN-RS-SC-2025-SPLIT-0-10-10-20 | soja RS/SC, SPD consolidado, camadas separadas | regra moderna de calagem do SPD consolidado | implementado no motor da soja |
| CQFS-RS-SC-2016-PERENNIAL-0-30-FROM-0-20 | análise 0–20 em implantação de perenes | correção-alvo 0–30 com 1,5 × a dose 0–20 | implementado como ajuste de profundidade |
| 0–30 composto direto | amostra integrada 0–30 | somente quando existir calibração específica cadastrada | reconhecido / fail-closed |

## 0–20 integrado

O Manual CQFS-RS/SC 2016 define a Tabela 5.2 de necessidade de calcário por índice SMP para correção da camada 0–20 cm, com valores para pH-alvo 5,5, 6,0 e 6,5.

A RAIZ calcula cada ponto separadamente. Uma média operacional só pode ser promovida quando a estrutura de amostragem comprova área equivalente por ponto. Sem essa evidência, ficam preservadas as doses por ponto e a faixa.

Para soja, a Tabela 5.1 do mesmo manual usa pH de referência 6,0. Portanto, quando o contexto seleciona esse método para a cultura, o pH-alvo precisa ficar explícito no snapshot.

## SPD consolidado

O manual 2016 e as indicações de soja 2025 tratam o SPD consolidado com maior resolução vertical. A recomendação moderna trabalha com 0–10 e monitoramento/avaliação de 10–20.

Quando o laboratório entrega apenas uma amostra composta 0–20, a RAIZ pode calcular a necessidade equivalente da própria camada 0–20, mas não deve fingir que conhece 0–10 e 10–20 separadamente.

Se o seletor de metodologia escolher explicitamente o método clássico integrado 0–20, o cálculo dessa camada pode ser promovido à decisão quantitativa daquele método, mantendo no snapshot:
- profundidade 0–20 real;
- índice SMP por ponto;
- pH-alvo;
- edição/fonte;
- faixa entre pontos;
- média operacional somente quando a grade tiver peso de área equivalente;
- modo de aplicação como não inferido quando a própria evidência não o determinar.

Essa promoção não rebatiza o resultado como regra moderna de SPD consolidado. O método clássico e a regra moderna continuam identificados separadamente.

O relatório deve mostrar as duas coisas quando necessário:

- cálculo que a amostra 0–20 realmente sustenta;
- qual metodologia gerou a dose e quais aspectos de aplicação não foram inferidos.

## 0–30

Uma amostra composta diretamente de 0–30 não é equivalente a uma amostra 0–20 multiplicada por 1,5.

O fator 1,5 do manual 2016 é um ajuste explícito para determinados casos de implantação de culturas perenes: parte-se de uma recomendação calculada a partir da análise 0–20 e ajusta-se a quantidade para corrigir a camada 0–30.

Uma análise laboratorial composta 0–30 só deve virar dose automática quando houver uma metodologia calibrada para essa própria profundidade, cultura, região e finalidade.

## Caso de regressão — Cabeda Área 01

Leitura da homologação em 2026-09-30:

- 8 amostras;
- todas registradas como 0–20 cm;
- pH em água: 5,1 a 5,4;
- índice SMP: 5,5 a 5,8.

Aplicando apenas a Tabela 5.2 como cenários de referência da camada 0–20 e admitindo peso igual entre pontos:

- alvo pH 5,5: faixa 2,3–3,7 t/ha PRNT 100%; média operacional matemática 2,71 t/ha;
- alvo pH 6,0: faixa 4,2–6,1 t/ha PRNT 100%; média operacional matemática 4,74 t/ha.

Esses números demonstram por que a RAIZ deve sempre guardar o método e o pH-alvo junto da dose. O mesmo laudo não possui uma única quantidade universal de calcário fora de um protocolo definido.

No fluxo atual da RAIZ, para soja com o método clássico integrado 0–20 selecionado, o pH de referência do método é 6,0. Para a Área 01 isso produz 4,74 t/ha PRNT 100% como dose geral operacional da grade, com faixa de 4,2–6,1 t/ha entre pontos. Esse número não é escolhido para reproduzir uma recomendação externa e não define sozinho aplicação superficial ou incorporada.

A média só é operacionalmente válida quando a grade representa áreas equivalentes. Caso contrário, o resultado permanece por ponto/faixa.

## Fontes

- CQFS-RS/SC. Manual de Calagem e Adubação para os Estados do Rio Grande do Sul e de Santa Catarina, 11ª ed., 2016. Capítulos 3 e 5, Tabelas 5.1 e 5.2.
- 44ª Reunião de Pesquisa de Soja da Região Sul / Embrapa Trigo / Universidade de Passo Fundo. Indicações técnicas para a cultura da soja no RS e SC, safras 2025/2026 e 2026/2027, item 2.3.
