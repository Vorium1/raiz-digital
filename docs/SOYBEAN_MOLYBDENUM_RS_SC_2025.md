# Soja RS/SC 2025 — molibdênio após indicação profissional

## Escopo

Este módulo **não decide se molibdênio deve ser aplicado**. A regra ampla `MO-SOJA-RS-SC-2025` permanece `REQUIRES_AGRONOMIST_REVIEW` no catálogo agronômico.

O runtime `computeSoybeanMolybdenumRsSc2025` só disponibiliza a faixa literal da publicação regional quando:

1. a indicação de Mo foi explicitamente confirmada pelo agrônomo responsável; e
2. a via de aplicação foi explicitamente escolhida/confirmada pelo agrônomo.

Não existe seleção automática de dose pontual dentro da faixa e não existe conversão automática para massa de produto comercial.

## Fonte regional corrente

**44ª Reunião de Pesquisa de Soja da Região Sul (2025). _Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027_. Item 2.5.4, pp.46-47.**

A publicação descreve:

- maior possibilidade de resposta em situações como pH em água inferior a 5,5 e deficiência inicial de N;
- aplicação via semente: **12–25 g Mo/ha**;
- aplicação foliar: **25–50 g Mo/ha**;
- doses maiores indicadas para solos arenosos, sem fornecer limiar granulométrico nem regra para escolher automaticamente um ponto da faixa;
- preferência pela aplicação foliar em **V2–V3**, aproximadamente 30–45 dias após emergência, para reduzir o risco de dano às bactérias fixadoras de N inoculadas via semente;
- se a aplicação for via semente, ela deve anteceder a inoculação;
- em integração lavoura-pecuária, monitorar Mo na pastagem, evitar aplicação anual consecutiva e interromper a aplicação quando a matéria seca da parte aérea atingir **5 mg Mo/kg**.

## Por que a indicação continua profissional

A publicação regional usa linguagem de possibilidade de resposta, não apresenta um critério diagnóstico necessário e suficiente para transformar `pH < 5,5` ou deficiência inicial de N em um comando automático de aplicação.

Além disso, há diferença operacional em relação à publicação nacional da Embrapa Soja de 2020, que descreve aplicação mínima por ciclo de **12–25 g Mo/ha**, com mesma eficiência por tratamento de sementes ou foliar em **V3–V5**. A RAIZ não escolhe silenciosamente entre esses perfis.

## Decisões do runtime

- sem indicação profissional: `BLOCKED_PROFESSIONAL_REVIEW`;
- sem via escolhida pelo agrônomo: `BLOCKED_PROFESSIONAL_REVIEW`;
- foliar fora de V2–V3: `BLOCKED_SOURCE_DOMAIN`;
- semente, após gates: faixa 12–25 g Mo/ha + alertas de inoculação;
- foliar V2/V3, após gates: faixa 25–50 g Mo/ha;
- solo arenoso: apenas aviso para a porção superior da faixa; nunca escolhe automaticamente o máximo;
- ILP sem histórico da aplicação anterior: `BLOCKED_PROFESSIONAL_REVIEW`;
- ILP com aplicação na safra anterior: `DO_NOT_APPLY` para impedir aplicação anual consecutiva dentro deste perfil;
- ILP sem monitoramento de Mo da pastagem: `BLOCKED_PROFESSIONAL_REVIEW`;
- ILP com Mo na matéria seca da pastagem >=5 mg/kg: `DO_NOT_APPLY`;
- ILP abaixo de 5 mg/kg, sem aplicação na safra anterior e com gates profissionais satisfeitos: faixa disponível conforme a via.

## Limites deliberados

- `pH < 5,5` + deficiência inicial de N é apenas contexto de resposta da fonte, não gate automático de indicação.
- o motor não diagnostica deficiência de Mo a partir desses sinais.
- o motor não escolhe fonte comercial, concentração, dose de produto ou mistura em tanque.
- o motor não converte automaticamente a faixa em uma dose única.
- a regra nacional Embrapa 2020 e os perfis CQFS permanecem separados.
- execuções históricas não são reinterpretadas retroativamente.
