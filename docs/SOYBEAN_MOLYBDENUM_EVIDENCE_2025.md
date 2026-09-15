# Soja — molibdênio: perfil regional 2025 × perfil nacional 2020

## Objetivo

Registrar as fontes atuais sem apagar divergências e sem transformar faixa técnica em dose automática. A RAIZ exige seleção explícita do perfil de fonte e revisão profissional.

## Fonte regional atual — RS/SC 2025

**Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027**. 44ª Reunião de Pesquisa de Soja da Região Sul. Passo Fundo: Embrapa Trigo / Universidade de Passo Fundo, 2025.

Fonte primária:
https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/1183120/1/Indicacoes2025.pdf

Localizador: item 2.5.4, pp.46-47.

A fonte informa que a aplicação de Mo **pode** aumentar o rendimento particularmente quando há, em conjunto, solo com pH em água <5,5 e deficiência de N no início do desenvolvimento associada à baixa FBN.

Faixas publicadas:
- semente: 12–25 g Mo/ha;
- foliar: 25–50 g Mo/ha;
- as doses maiores são associadas a solos arenosos, sem uma função quantitativa que permita à RAIZ escolher automaticamente o extremo da faixa;
- preferência pela aplicação foliar em V2–V3, aproximadamente 30–45 dias após a emergência, para reduzir risco às bactérias inoculadas.

Em integração lavoura-pecuária, a fonte exige atenção adicional ao acúmulo de Mo em pastagens: aplicações sucessivas somadas à elevação do pH podem aumentar a disponibilidade de Mo e afetar o metabolismo de Cu em ruminantes. Nesse contexto, a aplicação não deve ser anual e deve ser interrompida quando a matéria seca da parte aérea da pastagem atingir 5 mg Mo/kg.

## Perfil nacional — Embrapa Soja 2020

**Tecnologias de produção de soja.** Embrapa Soja. Sistemas de Produção 17. Londrina, 2020.

Fonte primária:
https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1123928/1/SP-17-2020-online-1.pdf

Localizadores relevantes:
- p.175, seção “Cobalto e molibdênio”;
- p.189, seção “Aplicação de micronutrientes”.

A fonte nacional registra maior possibilidade de resposta a Mo em solos ácidos, mas adota uma política diferente: devido à baixa rotina analítica para Co/Mo, recomenda a cada ciclo a aplicação mínima das quantidades potencialmente exportadas.

Faixas/estádio publicados no perfil nacional:
- 12–25 g Mo/ha;
- na seção geral, tratamento de sementes e pulverização foliar são descritos com a mesma faixa;
- aplicação foliar V3–V5;
- a seção de inoculação prefere a via foliar para evitar contato do produto com bactérias nas sementes.

## Divergências que o motor deve preservar

1. **Faixa foliar:** RS/SC 2025 = 25–50 g/ha; Embrapa 2020 = 12–25 g/ha.
2. **Estádio foliar:** RS/SC 2025 = V2–V3; Embrapa 2020 = V3–V5.
3. **Frequência/enquadramento:** RS/SC 2025 descreve contexto específico de maior probabilidade de resposta e restrição de uso anual em ILP; Embrapa 2020 usa reposição mínima por ciclo como regra nacional.
4. **Segurança em ILP:** o perfil regional atual contém um gate explícito de monitoramento da pastagem e limite de 5 mg Mo/kg de matéria seca.

Essas diferenças não devem ser “médias”, conciliadas numericamente nem escolhidas pela IA.

## Implementação RAIZ

- `MO-SOJA-RS-SC-2025` entra como `REQUIRES_AGRONOMIST_REVIEW`.
- `MO-SOJA-EMBRAPA-2020` permanece `REQUIRES_AGRONOMIST_REVIEW`.
- `MO-SOJA-CQFS-2016` permanece preservada por rastreabilidade histórica.
- `buildSoybeanMolybdenumReviewPacket` exige um perfil escolhido explicitamente.
- A função pode mostrar a faixa publicada pela fonte, sinais de contexto e bloqueios.
- `automaticDoseGMoPerHa` permanece `null`.
- `canAutoPrescribe=false` em todos os perfis desta versão.
- Em ILP sob o perfil RS/SC 2025, ausência de monitoramento de Mo na pastagem gera bloqueio de contexto; valor >=5 mg/kg gera bloqueio explícito de segurança.
- Perfil regional 2025 fora de RS/SC falha fechado.

## Decisão atual

A nova edição 2025 melhora muito a base regional e deve ser a referência atual para **revisão profissional em RS/SC**, mas não elimina o conflito com a fonte nacional e não sustenta, nesta etapa, a promoção para uma função de dose autônoma. A RAIZ deve primeiro registrar qual perfil o agrônomo está adotando e preservar a justificativa da escolha.
