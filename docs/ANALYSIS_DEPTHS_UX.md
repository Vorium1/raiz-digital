# Profundidades de diagnóstico — RAIZ Digital

## Princípio

As quatro camadas são internas ao motor. Para o usuário, elas aparecem como escolhas de profundidade, não como uma sequência obrigatória. É possível começar diretamente no nível desejado.

A profundidade escolhida representa **intenção**. A profundidade efetivamente alcançada depende das evidências presentes e permanece rastreável. Dados faltantes nunca são completados por IA.

## 1. Interpretação rápida

**Objetivo:** entender o laudo.

**Mínimo:**
- um laudo atual de análise de solo validado;
- a análise química é suficiente para iniciar; dados físicos/físico-químicos enriquecem a leitura quando disponíveis.

**Ajuda a melhorar:** profundidade de amostragem, método/extrator, unidades e laudos anteriores.

**Entrega:** interpretação integrada dos parâmetros válidos, principais limitantes e pontos favoráveis, prioridades de atenção e indicação explícita do que não é possível concluir. Não gera dose quando cultura, meta ou outro contexto obrigatório estiver ausente.

## 2. Recomendação de manejo

**Objetivo:** saber o que corrigir e como manejar para a cultura.

**Mínimo:**
- tudo do nível 1;
- cultura;
- meta de produtividade e unidade;
- profundidade de amostragem;
- regime hídrico;
- sistema de manejo do solo;
- histórico recente de calagem/adubação/gessagem, ou declaração explícita de indisponibilidade.

**Entrega:** prioridades de correção e manejo. Doses só podem sair de regras determinísticas quando método, contexto e regra estiverem suficientemente definidos.

## 3. Análise completa do campo

**Objetivo:** interpretar a análise dentro do campo real.

**Mínimo:**
- tudo do nível 2;
- tipo/classe do solo ou, no mínimo, textura/argila e profundidade efetiva conhecida;
- histórico recente de produtividade ou declaração explícita de indisponibilidade;
- contexto hídrico relevante (seca, excesso de chuva, encharcamento) ou declaração explícita de indisponibilidade.

**Ajuda a melhorar:** compactação/infiltração, análise foliar, indicadores biológicos com método conhecido, imagens, mapas de produtividade e outras evidências do talhão.

**Entrega:** diagnóstico contextual com justificativa, prioridade e indicação da transferibilidade das evidências usadas. A distância geográfica não substitui similaridade agronômica.

## 4. Diagnóstico avançado / 360°

**Objetivo:** usar todo o histórico confiável disponível e acompanhar o talhão ao longo das safras.

**Mínimo:**
- tudo do nível 3;
- histórico multissafras, ou declaração explícita de que a área ainda não o possui;
- contexto meteorológico da safra, ou declaração explícita de indisponibilidade.

**Espacial/VRA:** limite do talhão e pontos georreferenciados só se tornam obrigatórios quando o usuário pedir análise espacial. A ausência deles bloqueia apenas a conclusão espacial; não bloqueia o restante do 360°.

**Entrega:** diagnóstico longitudinal, comparação condição inicial → manejo → clima → produtividade → resposta do solo e cenários individualizados dentro dos limites dos dados disponíveis.

## Personalizar análise

O usuário informa o objetivo e o que possui. A RAIZ calcula a profundidade efetiva e apresenta apenas os dados faltantes que realmente mudariam a análise.

## Estados de evidência

Informações históricas usam três estados:
- `PROVIDED`: informação presente;
- `DECLARED_UNAVAILABLE`: ausência conhecida e rastreada;
- `MISSING`: o usuário ainda não respondeu.

`DECLARED_UNAVAILABLE` permite continuar quando a informação de fato não existe, mas gera limitação explícita. `MISSING` não é convertido em ausência nem inferido automaticamente.

## Persistência

A análise guarda separadamente:
- `requested_analysis_depth`: profundidade escolhida pelo usuário;
- `analysis_context`: snapshot JSON versionado do contexto, evidências, profundidade efetiva, pendências e limitações.

Isso permite aprofundar uma análise no futuro sem reescrever o que era conhecido no momento da decisão.

## Segurança agronômica

A conclusão de um nível não substitui os gates específicos de cada regra. Uma análise pode estar documentalmente completa para o nível 3 e ainda assim ter uma recomendação de nutriente bloqueada por método analítico incompatível, ausência de calibração, conflito de evidência ou necessidade de revisão profissional.
