# Arroz irrigado — calagem em pré-germinado e transplante (SOSBAI 2025)

Fonte primária: **SOSBAI, Recomendações técnicas da pesquisa para o Sul do Brasil, edição 2025**, p.42, Tabela 4.1.

URL: https://www.sosbai.com.br/uploads/documentos/recomendacoes-tecnicas-da-pesquisa-para-o-sul-do-brasil_310.pdf

## Domínio da regra

A regra `CALAGEM-ARROZ-PREG-TRANS-SOSBAI-2025` só pode ser executada quando o sistema estiver explicitamente enquadrado como:

- arroz irrigado;
- sistema pré-germinado **ou** transplante de mudas;
- solo inundado desde o início do ciclo;
- saturação por bases (V%), CTC pH 7,0, Ca trocável e Mg trocável informados no mesmo contexto analítico compatível.

Ela não se aplica ao arroz em solo seco e não resolve o conflito lógico já registrado para a calagem desse sistema.

## Interpretação fiel da fonte

Para pré-germinado/transplante, a SOSBAI não recomenda a prática com o objetivo de corrigir a acidez. O uso é direcionado à correção de possíveis deficiências de Ca e/ou Mg.

Critério:

- V <= 40%: avaliar a fórmula;
- exceção: **não aplicar** quando Ca trocável >= 4,0 **e** Mg trocável >= 1,0 cmolc/dm3;
- V > 40%: não aplicar por esta regra.

Quando aplicável, para equivalente PRNT 100%:

`NC = ((40 - V%) / 100) * CTCpH7`

onde NC é expresso em t/ha e CTC pH 7,0 em cmolc/dm3.

A fonte indica calcário dolomítico para suprir Ca e Mg.

## Decisões de engenharia

- A fórmula retorna **necessidade equivalente para PRNT 100%**.
- A conversão para PRNT comercial não é feita silenciosamente nesta função; deve usar camada de produto/comercial separada e auditável.
- Exatamente V=40% resulta em 0 t/ha pela própria fórmula.
- A exceção de Ca/Mg exige as duas condições simultaneamente (`Ca >=4` **e** `Mg >=1`).
- Sistema de estabelecimento, regime hídrico e perfil incompatíveis falham fechados.
- A função não inventa incorporação, parcelamento, época, produto comercial nem recomendação para sistema de solo seco.

## Regra que permanece bloqueada

`CALAGEM-ARROZ-SECO-SOSBAI-2025` continua `REQUIRES_AGRONOMIST_REVIEW` porque o texto narrativo da p.42 e a nota da Tabela 4.1 não são logicamente equivalentes. A regra fechada de pré-germinado/transplante não deve ser usada como atalho para o sistema de solo seco.
