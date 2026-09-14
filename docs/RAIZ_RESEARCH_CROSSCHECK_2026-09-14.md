# RAIZ Digital — triangulação Work × Gemini — 2026-09-14

## Objetivo

Registrar a decisão técnica usada para integrar a pesquisa dos blocos A–H ao motor agronômico sem promover conclusões frágeis. O princípio permanece: **fonte primária rastreável + função determinística delimitada + fail-closed + revisão profissional quando houver escolha agronômica**.

A resposta do Gemini foi útil como segunda opinião, mas não foi tratada como fonte. Onde houve divergência, prevaleceu a evidência com melhor rastreabilidade a documentos primários, edição, página/tabela, método e domínio de aplicação.

## Resultado do cruzamento

| Tema | Gemini | Work / fontes rastreadas | Decisão integrada |
|---|---|---|---|
| Arroz irrigado | Marcou P/K de forma ampla como READY combinando CQFS 2016 e SOSBAI mais antiga | SOSBAI 2025 traz tabelas novas e distingue arroz contínuo de rotação; há conflito interno na calagem | Versionar perfil SOSBAI 2025. Liberar somente subcálculos fechados N total, P e risco Fe; K/S/calagem permanecem em revisão |
| Gesso RS/SC | Correto ao rejeitar fórmula universal do Cerrado | Work encontrou critérios/modelos subtropicais, mas sem regra regional universal de dose | Dose automática RS/SC = INSUFFICIENT_EVIDENCE; diagnóstico/modelos ficam em revisão |
| B/Zn/Cu/Mn | Acertou que “baixo” não autoriza dose automática | Work fechou métodos e classes CQFS 2016 e demonstrou risco de misturar extratores/regiões | Classificação analítica pode executar; dose continua bloqueada |
| Mo em soja | Propôs READY com pH <6 e 10–20 g/ha via semente | CQFS 2016 e Embrapa Soja 2020 divergem em condição, dose foliar e estádio | Rejeitar automação. Perfis separados, ambos REQUIRES_AGRONOMIST_REVIEW |
| Carinata | INSUFFICIENT_EVIDENCE | Work confirma falta de calibração completa RS/SC | Manter bloqueada para dose regional automática |
| N tardio trigo/proteína | REVIEW | Work confirma módulo de qualidade separado do N de produtividade | Manter em revisão profissional |
| VRA / geoestatística | Trouxe bons princípios, mas também thresholds genéricos (densidade, distância, nugget) sem cadeia de prova suficiente | Work sustenta máscara, NoData, métricas, block-CV e ausência de limiar universal; faixas de n são política conservadora de software | Implementar métricas/máscara e política exploratória; nenhuma prescrição oficial sem aprovação profissional |
| MAP × DAP | Concluiu DAP mais acidificante por massa de produto | Work mostrou que a ordem muda com denominador/horizonte; UNL G1503: MAP 5,4 vs DAP 3,6 por kg N | Resolver por ledger transparente: por N, MAP maior na tabela; por kg de 10-52-0 vs 18-46-0, DAP maior. Nunca ajustar calagem automaticamente |

## Regras adicionadas / promovidas com escopo estreito

### READY_FOR_IMPLEMENTATION

- `N-ARROZ-CONTINUO-SOSBAI-2025` — Tabela 4.5; preserva teto como teto; não automatiza parcelamento.
- `P-ARROZ-CONTINUO-SOSBAI-2025` — Tabela 4.6; classe Muito Alto permanece `UPPER_BOUND`.
- `FE-ARROZ-RISCO-SOSBAI-2025` — fórmula/índice apenas com Fe-oxalato no método exigido e CTC pH 7; não dispara manejo.
- `MICRO-CLASS-CQFS-2016` — B/Zn/Cu/Mn somente com método/unidade/protocolo compatíveis; retorna classe, nunca dose.
- `SPATIAL-SUPPORT-MASK` — sem extrapolação; máscara de suporte e NoData obrigatórios.
- `SPATIAL-VALIDATION-METRICS` — RMSE, MAE e ME; sem threshold universal inventado.
- `MAP-DAP-ACID-LEDGER-UNL-2009` — equivalente de acidez sempre acompanhado por fonte, grau, denominador e horizonte; sem correção automática de calcário.

### REQUIRES_AGRONOMIST_REVIEW

- `N-ARROZ-SOSBAI-2025` (regra ampla)
- `K-ARROZ-CONTINUO-SOSBAI-2025`
- `S-ARROZ-SOSBAI-2025`
- `CALAGEM-ARROZ-SECO-SOSBAI-2025`
- `MO-SOJA-CQFS-2016`
- `MO-SOJA-EMBRAPA-2020`
- `GYPSUM-SUBSOIL-DIAGNOSTIC-2018`
- `N-TRIGO-QUALIDADE-EMBRAPA-2026`
- `VRA-SUPPORT-GATE`

### INSUFFICIENT_EVIDENCE

- `GYPSUM-RS-SC-AUTOMATIC`
- `CARINATA-RS-SC-NUTRITION`
- `MICRONUTRIENT-GENERIC-RS-SC` para dose genérica

## Decisões de implementação importantes

### Arroz

O motor não cria uma tabela híbrida CQFS/SOSBAI. Para o perfil SOSBAI 2025 de arroz contínuo, a classe de resposta precisa ter sido aprovada explicitamente. “Investimento alto” ou meta digitada não escolhem sozinhos uma coluna. A lacuna de precisão de MO entre 2,5 e 2,6 não é arredondada automaticamente.

A rotina N retorna o total de tabela. Notas de parcelamento com linguagem condicional (`pode`, `aproximadamente`, `cerca de`) não foram convertidas em uma função numérica arbitrária.

### Micronutrientes

- B: água quente; a lacuna 0,1–0,2 mg/dm³ resulta em `INDETERMINATE`.
- Zn/Cu: Mehlich-1.
- Mn: KCl 1 mol/L, extrato acidificado conforme protocolo.

A classificação CQFS não recebe dose de outra região/método. Dose = `null` até existir regra específica homologada.

### Espacial

A política de quantidade de pontos é assumidamente uma **política de segurança RAIZ**, não uma lei científica universal:

- `<3`: sem superfície 2-D;
- `3–49`: apenas exploratório; não gera VRA oficial mesmo após review;
- `50–99`: interpolação candidata somente com revisão profissional;
- `>=100`: krigagem candidata somente com distribuição adequada, validação cruzada e revisão profissional.

Além disso, nenhuma faixa de n substitui diagnóstico do suporte espacial. CRS, geometria, profundidade, método, qualidade, distribuição, máscara, NoData e revisão continuam obrigatórios. Não há threshold universal de RMSE/MAE/ME.

### MAP × DAP

No perfil UNL G1503 adotado apenas como ledger:

- MAP 10-52-0: 5,4 kg CaCO3 eq/kg N; por kg de produto = `0,54`.
- DAP 18-46-0: 3,6 kg CaCO3 eq/kg N; por kg de produto = `0,648`.

Logo, “qual acidifica mais?” sem denominador é uma pergunta incompleta. O ledger explica o índice; a regra de calagem continua baseada no solo (SMP/V% ou perfil homologado), não na escolha MAP/DAP.

## O que NÃO foi feito

- nenhuma migração de banco;
- nenhuma alteração de dado de produção;
- nenhuma alteração direta em `main` ou `develop`;
- nenhuma dose de carinata, gesso ou micronutriente foi inventada;
- nenhum perfil de Mo foi escolhido automaticamente;
- nenhuma VRA passou a ser autorizada sem revisão profissional;
- nenhum índice MAP/DAP passou a gerar calcário.

## Fontes principais

- CQFS-RS/SC 2016 — Manual de Calagem e Adubação para RS/SC.
- SOSBAI 2025 — Recomendações técnicas da pesquisa para o Sul do Brasil, capítulo 4.
- Embrapa Soja 2020 — Tecnologias de produção de soja.
- Embrapa Trigo 2026 — Informações técnicas para trigo e triticale.
- Tiecher et al. 2018; Caires & Guimarães 2018 — gessagem em sistemas subtropicais.
- Embrapa / PAB / Roberts et al. — agricultura de precisão e validação espacial.
- University of Nebraska G1503 (rev. 2009) — tabela de equivalentes de acidez usada somente no ledger.

## Governança

Este lote deve entrar por PR em `develop`, passar CI completo e gerar um novo RC. `main` continua bloqueada até homologação externa e GO explícito.