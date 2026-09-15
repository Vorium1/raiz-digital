# Enxofre na soja — RS/SC 2025

## Fonte regional corrente

**Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027** — 44ª Reunião de Pesquisa de Soja da Região Sul, Embrapa Trigo / Universidade de Passo Fundo, 2025, item 2.5.3, p.45.

Registro estável:
- https://www.alice.cnptia.embrapa.br/alice/handle/doc/1183120

A publicação informa que, para soja:

- o teor de S deve ser **maior que 10 mg/dm³** na camada de 0–10 ou 0–20 cm;
- na camada de 20–40 cm, a publicação informa **8,5 mg/dm³**;
- quando essas condições não são atendidas, recomenda-se **20 kg S/ha**;
- essa dose é contextualizada como suficiente para repor a exportação de aproximadamente 4 t/ha de soja, combinada com deposição atmosférica no RS de 3,3–4,5 kg S/ha/ano;
- deve-se preferir fonte sulfatada, prontamente disponível;
- S elementar é alternativa, mas a contribuição no curto prazo é incerta porque depende de oxidação microbiana;
- o S tende a ocorrer em maior teor em profundidade; quando a camada superficial usada é 0–10 cm, uma aparente deficiência deve ser confirmada com 10–20 e 20–40 cm.

## Limites implementados

A redação da fonte não usa a mesma desigualdade nos dois níveis:

- superfície: `S > 10 mg/dm³` é o critério explicitamente publicado;
- 20–40 cm: o texto informa `8,5 mg/dm³` sem escrever `> 8,5`.

Por isso a RAIZ trata:

- `10,0 mg/dm³` superficial como **não suficiente**;
- `8,5 mg/dm³` em 20–40 cm como **atingindo o valor profundo publicado**;
- `<8,5 mg/dm³` em 20–40 cm como insuficiente.

Esse comportamento evita inventar uma desigualdade `>8,5` que a fonte não publicou.

## Perfil de amostragem 0–20 + 20–40 cm

A execução determinística exige os dois resultados. A deficiência é confirmada quando:

- `S 0–20 <= 10 mg/dm³`; ou
- `S 20–40 < 8,5 mg/dm³`.

Com contexto válido, a recomendação nutricional é 20 kg S/ha. Caso ambos os critérios de suficiência sejam atendidos, a saída é 0 kg S/ha.

## Perfil de amostragem 0–10 + 10–20 + 20–40 cm

A fonte manda confirmar a deficiência superficial em profundidade. A RAIZ, portanto:

- exige que 10–20 e 20–40 estejam presentes;
- **não inventa limiar numérico para 10–20 cm**, pois a fonte não fornece um nessa seção;
- confirma deficiência determinística quando 20–40 cm está abaixo de 8,5 mg/dm³;
- se 0–10 cm está baixo, mas 20–40 cm atende ao valor publicado, não aplica S automaticamente e registra `SHALLOW_LOW_S_NOT_CONFIRMED_AT_DEPTH`.

A exigência da camada profunda para uma decisão determinística é uma política conservadora da RAIZ; não deve ser confundida com um novo limiar científico inventado.

## Método analítico

A publicação de 2025 afirma que a seção de calagem e adubação se baseia nas sugestões do Manual CQFS-RS/SC 2016, porém o item 2.5.3 não repete o extrator analítico de S. Por isso a API não aceita apenas um número em mg/dm³: exige `analysisMethodValidatedAgainstRegionalProtocol=true`.

Esse booleano é um gate de proveniência/metadado do laudo, não autorização para a IA presumir método. Se o método do laboratório não estiver validado como compatível com o sistema analítico de referência, a regra falha fechada.

## Fonte do fertilizante

A saída `20 kg S/ha` é massa do **nutriente S**, não massa de produto comercial.

- Sulfato: forma preferencial de rápida disponibilidade segundo a publicação.
- S elementar: pode integrar estratégia de médio/longo prazo, mas seu efeito de curto prazo é incerto; o timing exige revisão profissional.
- Conversão para produto comercial depende da garantia real do produto e permanece em camada separada e auditável.

## Limites da automação

A regra `S-SOJA-RS-SC-2025` pode liberar somente a dose nutricional de 20 ou 0 kg S/ha quando região, unidade, método/proveniência e profundidades exigidas estiverem completos.

Ela não pode:

- escalar automaticamente S pela expectativa de produtividade;
- transformar 20 kg S/ha em massa de gesso, sulfato de amônio ou outro produto sem composição cadastrada;
- inferir método analítico ausente;
- inventar limiar para 10–20 cm;
- usar a regra fora de RS/SC;
- tratar a deposição atmosférica como crédito exato de um talhão específico.

## Compatibilidade com a regra histórica 2016

O helper legado `computeSojaSulfurRecommendation()` permanece registrado como implementação histórica da lógica CQFS 2016 baseada em um único teor superficial. Ele não deve ser usado como substituto silencioso do novo gate regional 2025, que explicita profundidade e confirmação em camadas mais profundas.
