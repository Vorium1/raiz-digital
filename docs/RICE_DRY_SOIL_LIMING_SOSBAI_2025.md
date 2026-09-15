# RAIZ Digital — Calagem do arroz irrigado em solo seco · SOSBAI 2025

Data da revisão RAIZ: 2026-09-15.

## Fonte

SOSBAI. **Recomendações técnicas da pesquisa para o Sul do Brasil 2025**.

- p. 42, Tabela 4.1: critérios de decisão e 1 SMP para pH em água 5,5 no sistema de semeadura em solo seco;
- p. 43, Tabela 4.2: doses de calcário PRNT 100% pelo índice SMP para pH 5,5 e 6,0;
- p. 43: em baixo poder tampão, equação específica para pH 5,5: `NC = -0,653 + 0,480 MO + 1,937 Al`;
- p. 43: em sucessão/rotação com culturas de sequeiro, a fonte orienta elevar o alvo a pH 6,0.

URL oficial preservada no catálogo: `https://www.sosbai.com.br/uploads/documentos/recomendacoes-tecnicas-da-pesquisa-para-o-sul-do-brasil_310.pdf`.

## Domínio automatizado

A regra `CALAGEM-ARROZ-SECO-SOSBAI-2025` só pode avançar automaticamente quando:

- perfil é `SOSBAI_2025_ARROZ_SEMEADURA_SOLO_SECO`;
- sistema é semeadura em solo seco;
- amostra representa 0–20 cm;
- não há rotação/sucessão identificada que exija alvo pH 6,0;
- pH em água é menor que 5,5;
- V é menor que 65%;
- saturação por Al é maior ou igual a 10%;
- o método de dose está explicitamente definido como tabela SMP aplicável ou baixo poder tampão confirmado.

Nesse domínio, a dose é expressa em t/ha de calcário equivalente a PRNT 100% e a aplicação é incorporada.

## Domínio explícito de não aplicação

A nota (1) da Tabela 4.1 diz para não aplicar quando `V >=65%` e saturação por Al `<10%`.

Além disso, `pH >=5,5` fica fora do critério principal `pH <5,5` e retorna `DO_NOT_APPLY` por esta regra.

## Quadrantes V/Al não especificados

A regra positiva (`V<65%` e `Al>=10%`) e a regra negativa (`V>=65%` e `Al<10%`) não cobrem todo o plano lógico de entradas.

A RAIZ não usa o complemento da nota negativa como autorização implícita. Portanto:

- `V>=65%` e `Al>=10%` → `BLOCKED_SOURCE_DOMAIN`;
- `V<65%` e `Al<10%` → `BLOCKED_SOURCE_DOMAIN`;
- blocker: `V_AL_COMBINATION_NOT_EXPLICITLY_AUTHORIZED_BY_SOURCE`.

No arroz, `Al=10%` é inclusivo no domínio positivo quando `V<65%`, porque a redação corrente usa `Al >=10%`.

## Seleção do método de dose

### Tabela SMP

Quando o contexto declara `STANDARD_SMP_APPLICABLE`, a função usa diretamente a Tabela 4.2 para pH 5,5. Entre valores de SMP tabelados, a implementação interpola linearmente e marca `interpolated=true`.

Se a tabela resultar em dose zero apesar de os critérios positivos de acidez estarem presentes, a RAIZ bloqueia para revisão em vez de converter a inconsistência em dose zero silenciosa.

### Baixo poder tampão

Quando `LOW_BUFFERING_CONFIRMED`, a função usa a equação SOSBAI para pH 5,5:

`NC = -0,653 + 0,480 × MO + 1,937 × Al`

onde MO é matéria orgânica em `%` e Al é Al trocável em `cmolc/dm³`.

A função exige os dois valores. Resultado não positivo dentro do domínio que indicaria calagem é tratado como inconsistência e encaminhado para revisão.

### Contexto desconhecido

`bufferingContext=UNKNOWN` não autoriza a RAIZ a escolher tabela ou equação; retorna `BLOCKED_PROFESSIONAL_REVIEW`.

## Rotação com culturas de sequeiro

A fonte eleva o alvo para pH 6,0 quando o arroz está em sucessão/rotação com culturas de sequeiro como soja, sorgo, milho e pastagens.

A regra aqui implementada é deliberadamente a regra de pH 5,5 para arroz em solo seco fora desse contexto de maior exigência. `ROTATION_WITH_UPLAND_CROPS` e contexto desconhecido permanecem bloqueados até regra separada/versionada.

## O que não é automatizado

- conversão da dose PRNT 100% para produto comercial;
- escolha de produto;
- decisão de enquadrar um solo como baixo poder tampão sem contexto explícito;
- alvo pH 6,0 em rotação/sucessão com culturas de sequeiro;
- extrapolação para pré-germinado/transplante, que possui regra separada;
- reprocessamento automático de recomendações históricas.

## Estado da pesquisa de arroz na #40

Na auditoria atual do repositório:

- K do arroz contínuo SOSBAI 2025 já estava implementado e testado pela Tabela 4.7;
- S do arroz SOSBAI 2025 já estava implementado e testado no escopo `S <10 mg/dm³` pelo método indicado, mantendo a faixa 20–30 kg S/ha sem escolher um ponto silenciosamente;
- a lacuna efetiva era a calagem no sistema de semeadura em solo seco.

A promoção desta regra para `READY_FOR_IMPLEMENTATION` significa apenas que existe um runtime delimitado que falha fechado fora do domínio comprovado. Não significa que todos os cenários de calagem de arroz são automáticos.
