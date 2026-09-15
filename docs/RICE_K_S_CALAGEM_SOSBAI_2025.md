# RAIZ Digital — Arroz irrigado: K, S e calagem — SOSBAI 2025

Data da consolidação: 2026-09-15.

## Fonte primária

Sociedade Sul-Brasileira de Arroz Irrigado (SOSBAI). **Arroz irrigado: recomendações técnicas da pesquisa para o Sul do Brasil — 2025**.

URL: `https://www.sosbai.com.br/uploads/documentos/recomendacoes-tecnicas-da-pesquisa-para-o-sul-do-brasil_310.pdf`

Ledger já preservado pela RAIZ:

- `sha256 = 7e2b2de2d74993ccd6f92d56f93f1d062f1bd6e04bfd162b6aff90febd7689a5`
- `bytes = 17_060_663`

A implementação abaixo usa a edição corrente de 2025 e não mistura automaticamente critérios de versões antigas ou de culturas de sequeiro.

---

## 1. Potássio — Tabela 4.7, p.48

A SOSBAI 2025 informa as doses de K para arroz irrigado nos sistemas de semeadura em solo seco e pré-germinado com base na classe do teor de K no solo, determinado por **Mehlich-1**, e na expectativa de resposta à adubação.

| Classe de K | Média | Alta | Muito Alta |
|---|---:|---:|---:|
| Muito Baixo | 100 | 120 | 140 |
| Baixo | 80 | 100 | 120 |
| Médio | 60 | 80 | 100 |
| Alto | 40 | 60 | 80 |
| Muito Alto | ≤40 | ≤60 | ≤80 |

Unidade: kg/ha de K2O.

### Nota de CTC

Quando `CTC pH 7,0 > 15,0 cmolc/dm3`, a fonte determina acrescentar **20 kg/ha de K2O** aos valores da tabela. O operador é estritamente `>`; CTC igual a 15,0 não recebe o acréscimo.

Na RAIZ:

- o valor-base continua `EXACT` nas classes Muito Baixo, Baixo, Médio e Alto;
- a classe Muito Alto continua `UPPER_BOUND`;
- o acréscimo de CTC é aplicado ao valor ou ao limite superior, preservando sua natureza;
- não se escolhe a coluna Média/Alta/Muito Alta por meta de rendimento, orçamento ou IA; ela deve estar explicitamente validada.

### Notas que NÃO viraram função automática

Para teor de K igual ou superior a duas vezes o teor crítico, a SOSBAI informa que os valores de Muito Alto podem ser reduzidos ou equivaler à exportação pelos grãos, citada como aproximadamente 3–4 kg K2O/t de grãos. A RAIZ não transforma essa redação em fórmula automática.

A fonte também admite fracionamento de doses elevadas, especialmente `>=80 kg K2O/ha`, em solos de baixa CTC, arenosos e/ou com baixa matéria orgânica. A RAIZ mantém `splitApplicationAutomated=false`; esse manejo depende de contexto adicional.

### Status de engenharia

`K-ARROZ-CONTINUO-SOSBAI-2025` passa a `READY_FOR_IMPLEMENTATION` apenas no escopo fechado acima.

---

## 2. Enxofre — p.49

A edição corrente de 2025 descreve maior risco de deficiência de S em solos afastados de regiões industriais, com baixa matéria orgânica e argila e cultivados intensivamente com arroz irrigado. A própria recomendação caracteriza a condição analítica por:

- S no solo **<10 mg/dm3**;
- extrator **fosfato de cálcio 500 mg/L**.

Nessa condição, a fonte informa resposta positiva da cultura e limita a resposta à faixa de **20–30 kg S/ha**.

A RAIZ preserva literalmente a natureza dessa recomendação:

- `<10` => `RANGE {20, 30}` kg S/ha;
- `>=10` => `EXACT 0` kg S/ha dentro deste gate;
- método diferente/ignorado => `REQUIRES_AGRONOMIST_REVIEW`;
- unidade diferente => bloqueado;
- perfil diferente de arroz irrigado SOSBAI 2025 => bloqueado.

A plataforma **não escolhe 20, 25 ou 30 kg/ha automaticamente**. Produto comercial também não é selecionado por esta função.

### Observação sobre versões/cache

Há resultado indexado antigo no mesmo endereço da SOSBAI que reproduz redação anterior com 20 kg S/ha. A edição corrente de 2025, identificada pelo ledger/hash da RAIZ, apresenta 20–30 kg S/ha. Por isso a implementação usa a faixa da edição corrente e mantém a versão/fonte rastreável.

### Status de engenharia

`S-ARROZ-SOSBAI-2025` passa a `READY_FOR_IMPLEMENTATION` somente como faixa e somente com método/unidade/perfil compatíveis.

---

## 3. Calagem — p.42: não promover a regra de solo seco

A edição 2025 contém uma divergência lógica interna para arroz semeado em solo seco.

### Texto narrativo

A redação diz que a calagem se justifica quando, conjuntamente:

- pH em água <5,5;
- V <65%;
- saturação por Al >=10%.

### Tabela 4.1 + nota (1)

A tabela apresenta como critério de decisão para solo seco:

- `pH <5,5`;

com a nota:

- não aplicar quando `V >=65%` **e** saturação por Al `<10%`.

Essas duas formulações não são logicamente equivalentes em todas as combinações de V e Al. A RAIZ não escolherá uma interpretação sem esclarecimento técnico oficial.

### Status de engenharia

`CALAGEM-ARROZ-SECO-SOSBAI-2025` permanece `REQUIRES_AGRONOMIST_REVIEW`.

---

## 4. Pré-germinado/transplante: regra distinta e potencialmente determinística

Para sistemas mantidos inundados desde o início do ciclo, a SOSBAI afirma que a calagem não é recomendada para correção de acidez. Ela é indicada para correção de possível deficiência de Ca/Mg quando:

- V <=40%;
- exceto se Ca trocável >=4,0 e Mg trocável >=1,0 cmolc/dm3.

Quando aplicável, para PRNT 100%:

`NC = (40 - V%)/100 * CTCpH7`

com calcário dolomítico.

Essa regra é logicamente diferente da calagem de solo seco e deve, se implementada, receber `ruleId` próprio. Ela não deve ser usada para resolver por aproximação o conflito da regra de solo seco.

---

## Política de segurança preservada

- classificação/proveniência deve pertencer ao perfil SOSBAI correto;
- nenhuma conversão silenciosa de método analítico;
- nenhuma seleção automática de coluna por nível de investimento;
- nenhum texto condicional é convertido em número único sem sustentação explícita;
- regras de produto comercial continuam separadas da necessidade agronômica;
- qualquer conflito de fonte permanece visível e bloqueia promoção automática.
