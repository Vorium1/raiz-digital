# RAIZ Digital — Transferibilidade agronômica de evidências

## Princípio

A RAIZ não limita conhecimento à distância geográfica. **Distância geográfica não é distância agronômica.** Uma evidência produzida fora de RS/SC pode ser relevante quando cultura, solo, profundidade, método, sistema, água e demais condições críticas são comparáveis. Da mesma forma, um estudo próximo pode não ser transferível se o contexto agronômico for diferente.

A comparação serve para selecionar e contextualizar evidências. Ela **não transforma automaticamente um experimento externo em regra de dose**.

## Hierarquia de busca

A pesquisa deve priorizar, sem se restringir a:

1. calibração direta da região/ambiente do alvo, quando existir;
2. Sul do Brasil e ambientes agronomicamente comparáveis;
3. Brasil, incluindo Embrapa, universidades e ensaios de outras regiões;
4. literatura internacional em solos/sistemas comparáveis;
5. ciência mecanística global para explicar processos e hipóteses.

A hierarquia não substitui a avaliação de contexto. Fonte local não recebe aprovação automática e fonte internacional não é rejeitada apenas pela origem.

## Dimensões de contexto

A seleção de dimensões é específica da pergunta agronômica. Entre as dimensões possíveis estão:

- cultura, cultivar ou grupo genético;
- classe/tipo de solo;
- textura e teor de argila;
- mineralogia e capacidade tampão, quando disponíveis;
- profundidade de amostragem e profundidade efetiva de raízes;
- pH, CTC, matéria orgânica, saturação por bases, Al, Ca, Mg, K e S;
- método/extrator e protocolo analítico;
- sequeiro ou irrigado;
- plantio direto, convencional, integração ou sistemas regenerativos;
- área nova versus consolidada e tempo de cultivo;
- histórico de calagem, gessagem, fertilização, cobertura e rotação;
- drenagem, compactação, infiltração e estrutura;
- precipitação, déficit hídrico, excesso de chuva/encharcamento e temperatura;
- faixa de produtividade e objetivo produtivo;
- indicadores biológicos/microbiológicos, sempre vinculados ao método de medição.

Nem todas as perguntas exigem todas as dimensões. A fonte deve declarar quais são **críticas** para a conclusão que se pretende transferir.

## Sem score mágico

O motor não calcula um percentual arbitrário de “similaridade agronômica”. Em vez disso, usa restrições declaradas pela própria evidência:

- `CATEGORICAL`: categorias nas quais o estudo é aplicável;
- `NUMERIC_RANGE`: intervalo observado/calibrado pela fonte;
- `BOOLEAN`: condição presente/ausente.

O motor não cria tolerância em torno de um estudo. Se o artigo trabalhou com 45–80% de argila, a RAIZ não decide sozinha que 40% “é parecido o suficiente”. A ampliação de domínio precisa de nova evidência ou curadoria explícita.

## Classes de aplicabilidade

- `DIRECT`: há calibração direta explícita e todas as dimensões críticas conhecidas são compatíveis.
- `STRONGLY_COMPARABLE`: todas as dimensões críticas declaradas são compatíveis, sem divergência opcional conhecida.
- `PARTIALLY_COMPARABLE`: dimensões críticas são compatíveis, mas existe lacuna ou divergência em contexto opcional relevante.
- `MECHANISTIC_ONLY`: útil para explicar processo/mecanismo, não para transportar dose.
- `NOT_COMPARABLE`: pelo menos uma dimensão crítica está fora do domínio declarado pela fonte.
- `INSUFFICIENT_CONTEXT`: falta contexto crítico na fonte ou no campo para realizar a comparação.

## Tipos e força da evidência

Tipos estruturados:

- `MECHANISTIC`
- `CALIBRATED_RESPONSE`
- `MULTILOCATION_TRIAL`
- `CONTROLLED_FIELD_TRIAL`
- `OBSERVATIONAL_FIELD`
- `REGIONAL_MANUAL`
- `SYSTEMATIC_REVIEW`
- `META_ANALYSIS`
- `UNCLASSIFIED` para legado/pendência de curadoria.

Força declarada:

- `DIRECT_STRONG`
- `TRANSFERRED_STRONG`
- `MODERATE`
- `EXPERIMENTAL`
- `OBSERVATIONAL`
- `CONFLICTING`
- `INSUFFICIENT`
- `UNASSESSED` para legado/pendência.

Esses rótulos não são definidos pela IA como autoridade. A pesquisa pode propor classificação; a curadoria/homologação decide o uso oficial.

## Gate quantitativo

Comparabilidade nunca é sinônimo de autorização de dose.

Uma evidência só pode suportar recomendação quantitativa automática quando, simultaneamente:

1. a aplicabilidade é `DIRECT` ou `STRONGLY_COMPARABLE`;
2. não existe conflito de evidência pendente;
3. existe uma regra determinística homologada (`homologated_rule_id`);
4. `quantitative_use_status = HOMOLOGATED_DETERMINISTIC`;
5. `quantitative_applicability_approved = true`.

A etapa de pesquisa não pode produzir esse estado. Ela grava/propõe fontes como material para revisão. A promoção quantitativa pertence a uma etapa separada de curadoria.

## Evidência conflitante

Quando campo, manual ou estudos divergem, a RAIZ preserva o conflito. O comportamento esperado é:

- registrar cada fonte e seu contexto;
- verificar se a divergência é explicável por solo, método, clima, manejo, cultivar, profundidade ou denominador;
- usar a evidência como contexto quando apropriado;
- bloquear promoção automática de dose até homologação.

“Resultado diferente” não é automaticamente “resultado falso”. Pode ser resposta real de outro sistema.

## Relação com as quatro profundidades

- **Interpretação rápida:** usa principalmente regras diretamente homologadas para o laudo.
- **Recomendação de manejo:** adiciona cultura, meta e contexto básico.
- **Análise completa do campo:** pode selecionar evidências nacionais/globais por transferibilidade para contextualizar estratégias.
- **Diagnóstico 360°:** acrescenta histórico multissafras, clima, mapas e resposta do próprio talhão; evidência externa é confrontada com o histórico local.

Quanto mais profundo o diagnóstico, mais contexto existe para escolher evidência realmente comparável. Isso não reduz os gates de segurança de cada cálculo.

## Evolução futura

A RAIZ deve versionar decisões e, com dados autorizados, aprender longitudinalmente com:

`condição inicial → recomendação → manejo realizado → clima → produtividade → alteração do solo`

Esse histórico poderá gerar evidência observacional própria e hipóteses de resposta, sempre separadas de ensaio controlado e de calibração quantitativa homologada.
