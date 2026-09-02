# Arquitetura da Inteligência Agronômica por Cultura — Proposta

> Status: **proposta em avaliação, nada aqui foi implementado em código**. Este documento responde ao pedido do diretor do projeto de (1) verificar honestamente o que já existe de IA/interpretação na plataforma e (2) propor a arquitetura para que toda análise passe a ser interpretada de forma específica por cultura, antes de qualquer linha de código ser escrita.
>
> Este documento **complementa** `docs/MOTOR_AGRONOMICO.md` e `docs/ARCHITECTURE.md` — não os substitui. Onde este documento propõe algo novo, isso é dito explicitamente como "proposta"; onde apenas descreve o que já foi decidido antes, isso é dito como "já definido".

---

## 1. O que já existe hoje (verificado no código e no banco, não presumido)

### 1.1 Existe alguma IA/LLM conectada hoje?

**Não. Não existe nenhuma IA conectada à plataforma hoje.**

Verificação feita:
- `package.json` não tem nenhuma dependência de IA (nenhum SDK da OpenAI, Anthropic, Google, Mistral, LangChain ou similar).
- Busca em todo o código-fonte (`src/`) por chamadas a provedores de IA: nenhuma encontrada.
- `docs/ARCHITECTURE.md` já reserva um lugar para isso no diagrama ("Adaptadores externos → IA · E-mail · Mercado Pago · S3"), mas esse adaptador **nunca foi construído**.

Respondendo ponto a ponto ao que você perguntou:

| Pergunta | Resposta |
|---|---|
| Existe IA conectada? | Não. |
| Qual provedor/modelo? | Nenhum. |
| Quais dados ela recebe? | Nenhum — não há chamada nenhuma. |
| Quais decisões ela pode tomar? | Nenhuma. |
| Hoje ela interpreta agronomia ou só organiza/exibe dados? | Não existe IA, então não há interpretação nenhuma — nem por IA, nem por regra. O sistema hoje **só organiza e exibe** o que foi importado do laboratório (valor, unidade, método, parâmetro). |
| Riscos de alucinação hoje? | Nenhum risco de IA hoje, porque não há IA. O risco real hoje é outro: se alguém *pedisse* uma opinião "solta" a um LLM genérico fora do sistema, sem contexto de cultura/método/tabela, o risco de erro seria alto — é exatamente isso que a arquitetura da seção 3 existe para impedir. |

### 1.2 O que existe de "preparação" para isso (não é IA, é estrutura de banco)

O banco de dados **já tem, desde a primeira migration**, tabelas pensadas para uma arquitetura híbrida parecida com a que você está pedindo — mas elas estão **vazias, sem nenhum código que escreva nelas**:

- `rule_sets` — já existe com `code`, `semantic_version`, `content_hash`, `region_code`, `supported_crops` (array), `supported_methods` (jsonb), `rules` (jsonb), `sources` (jsonb), `status` (DRAFT/…), `authored_by`, `reviewed_by[]`, `approved_by`. Ou seja: **o desenho de "regras versionadas, por região e por cultura, com autor/revisor/aprovador" já está na tabela — só falta alguém popular e o código que a usa.**
- `interpretations` — já existe ligada a `rule_set_id`, com `structured_output` (jsonb), `ai_narrative` (texto, pode ser nulo), `assumptions`, `warnings`, e um `status` que já modela exatamente o fluxo pedido: `CALCULATED → AI_GENERATED → IN_REVIEW → APPROVED → PUBLISHED → SUPERSEDED`.
- `analyses.confidence_score` / `confidence_level` — **isso já está em uso hoje**, mas atenção: é um índice de **qualidade da importação do laudo** (completude das colunas, linhas com erro, avisos), calculado em `src/domain/lab-import.ts`. Não é (ainda) o "Índice de Confiabilidade Técnica" de 5 dimensões descrito em `docs/MOTOR_AGRONOMICO.md` (que inclui "compatibilidade de regra" e "contexto agronômico" — isso depende de existir uma regra e uma cultura para comparar, o que ainda não existe).
- `docs/MOTOR_AGRONOMICO.md` já documenta a decisão de segurança que você está pedindo agora: motor híbrido, IA só transforma saída estruturada em linguagem, nenhuma recomendação publicada sem aprovação profissional. **Isso já era a intenção do projeto antes deste pedido — este documento detalha como implementar essa intenção por cultura.**

**Resumo honesto: existe uma "prateleira" pronta no banco (tabelas certas, com os campos certos) mas o motor em si — o código que calcula, classifica e gera interpretação — ainda não foi escrito. É 0% implementado, não parcialmente implementado.**

### 1.3 O que existe hoje sobre cultura/contexto agronômico

| Dado pedido por você | Existe hoje? | Onde |
|---|---|---|
| Cultura | Parcial — `crop_seasons.current_crop` / `next_crop` são texto livre, sem cadastro/perfil por trás | `crop_seasons` |
| Variedade/cultivar | Não existe | — |
| Safra | Sim | `crop_seasons.season_label` |
| Expectativa de produtividade | Sim | `crop_seasons.yield_goal` + `yield_goal_unit` |
| Sistema de cultivo (plantio direto, convencional, etc.) | Não existe (só há `irrigated boolean`, que é outra coisa) | — |
| Profundidade da amostra | Sim, por ordem de coleta e por ponto | `collection_orders.depth_from_cm/to_cm`, `sample_points.depth_from_cm/to_cm` |
| Tipo/textura de solo | Não existe | — |
| Região técnica | Não existe como campo próprio (existe só município/UF da propriedade) | `properties.municipality`, `properties.state` |
| Histórico do talhão | Parcial — dá para reconstruir juntando safras/análises antigas do mesmo talhão, mas não existe uma visão de histórico pronta | `crop_seasons`, `analyses` |
| Resultados químicos | Sim | `lab_results` (mas sem separar quimico/físico/microbiológico — ver abaixo) |
| Resultados físicos | Estrutura genérica serve, mas não há distinção de categoria | `lab_results` |
| Resultados microbiológicos | Estrutura genérica serve, mas não há distinção de categoria | `lab_results` |
| Método laboratorial | Sim, obrigatório | `lab_results.analytical_method` |
| Unidade | Sim, obrigatória | `lab_results.unit` |
| Critérios técnicos / tabelas de referência | Não existe ainda — é exatamente o que `rule_sets` foi desenhada para guardar, mas está vazia | `rule_sets` (vazia) |

Conclusão da auditoria: a base (talhão, safra, laudo, unidade, método) é sólida e real. O que falta é 100% do que torna a interpretação **específica por cultura**: perfil de cultura, textura/tipo de solo, região técnica formal, categoria química/física/microbiológica do parâmetro, e o motor de regras em si.

---

## 2. Arquitetura proposta — motor híbrido em 3 camadas

Exatamente como você descreveu, e alinhado ao que `docs/MOTOR_AGRONOMICO.md` já pedia:

```
CAMADA 1 — Motor determinístico agronômico
  Regras, faixas de suficiência, tabelas de referência, conversões de unidade,
  validações, cálculos objetivos. 100% código auditável, sem IA.
  Roda PRIMEIRO. Produz um "structured_output" (fatos + classificações).

CAMADA 2 — IA / LLM
  Só entra DEPOIS que a Camada 1 já calculou tudo.
  Função: explicar, contextualizar, comparar com histórico, resumir em
  linguagem clara para o agrônomo/produtor. NUNCA calcula, NUNCA classifica,
  NUNCA decide um número. Só narra o que a Camada 1 já decidiu.

CAMADA 3 — Revisão profissional
  Toda interpretação nasce com status "aguardando validação técnica".
  Um agrônomo responsável revisa, pode editar, aprova ou rejeita.
  Só depois de aprovada ela pode virar relatório publicado.
```

### 2.1 Regras rígidas de segurança (todas viram checagem de código, não só "boa intenção")

| Regra pedida | Como vira mecanismo técnico |
|---|---|
| Nunca inventar valor ausente | Camada 1 bloqueia e marca `BLOCKER` se um campo obrigatório está ausente — a interpretação simplesmente não é gerada para aquele parâmetro (já é o comportamento do importador hoje, só falta estender para a interpretação) |
| Nunca assumir método laboratorial | `rule_sets.supported_methods` lista os métodos aceitos; se o método do laudo não bate, bloqueia e explica por quê |
| Nunca misturar tabelas incompatíveis | Toda regra pertence a um `rule_set` com `region_code` + `supported_crops` + `supported_methods` fixos; o motor só aplica um rule_set cujo escopo bate 100% com o contexto da análise |
| Nunca gerar recomendação sem cultura/contexto mínimo | Lista de "campos mínimos obrigatórios" (cultura, safra, profundidade, método, unidade) é checada antes de rodar qualquer regra; faltando um, o status fica `AGUARDANDO_CONTEXTO`, nunca gera número |
| Explicitar incerteza | Todo `interpretations.structured_output` carrega o Índice de Confiabilidade (as 5 dimensões do `MOTOR_AGRONOMICO.md`) — a incerteza é um dado de primeira classe, não um comentário |
| Citar a regra/base técnica usada | `interpretations.rule_set_id` + `trace` com código, versão e hash do rule_set — toda interpretação é reproduzível: dá pra provar exatamente qual tabela gerou aquele número |
| Separar fato / interpretação / recomendação | `structured_output` guarda 3 blocos distintos: `facts` (o que o laudo disse, sem julgamento), `interpretation` (classificação segundo a regra: baixo/adequado/alto etc.), `recommendations` (ações sugeridas, sempre com `requiresReview: true`) |
| Revisão de agrônomo responsável | Campo `interpretations.status` já modela isso: `CALCULATED → AI_GENERATED → IN_REVIEW → APPROVED → PUBLISHED` |
| Auditoria de cada interpretação | `interpretations` é append-only por `revision` (nunca sobrescreve) + `audit_events` já existe no sistema e registra quem fez o quê |
| Versionamento das regras | `rule_sets` já modela `semantic_version` + `content_hash` + janela de validade (`valid_from`/`valid_until`) — uma versão ativa nunca muda, uma correção vira versão nova |

### 2.2 Por que a IA não decide sozinha (reforço do que já é regra do projeto)

Isso já era regra inegociável do `CLAUDE.md` deste projeto antes mesmo do seu pedido: *"IA não decide agronomia. Regras e cálculos agronômicos oficiais são determinísticos, versionados e homologados."* A arquitetura de 3 camadas é a forma concreta de cumprir essa regra — a IA (Camada 2) literalmente não tem acesso de escrita a nenhuma classificação ou número; ela só recebe o `structured_output` já pronto da Camada 1 e devolve texto explicativo, que fica marcado como `ai_narrative` (campo separado, nunca misturado com `structured_output`).

### 2.3 Provedor de IA — qual usar (proposta, decisão técnica sua/minha, não do agrônomo)

Como isso é decisão de engenharia (não de agronomia), sigo a regra do projeto de "mais simples, barata, aberta e reversível":

- A Camada 2 é um adaptador isolado (`src/lib/ai/narrative-adapter.ts`, por exemplo) por trás de uma interface simples — trocar de provedor no futuro não deve exigir tocar no motor determinístico.
- Não precisa de infraestrutura própria de modelo: uma chamada de API a um provedor de LLM (ex.: Anthropic) resolve, sem Redis, sem fila própria, sem serviço adicional pago além da própria chamada de API.
- Nenhuma chave de API fica no frontend; a chamada acontece só no servidor, com o `structured_output` da Camada 1 como entrada.
- Enquanto não houver um rule_set homologado para uma cultura, a Camada 2 **nem é chamada** — não existe "narrativa" sem fato calculado por trás.

---

## 3. Perfil agronômico por cultura (cadastrável, não hardcoded)

Estrutura proposta, seguindo exatamente o que você descreveu — **Cultura → parâmetros relevantes → faixas de interpretação → criticidade → objetivo produtivo → observações técnicas → regras de recomendação**:

```
crop_profiles (novo, proposta)
├─ id, code (ex.: "SOJA"), name, status (DRAFT/ACTIVE/SUPERSEDED)
├─ semantic_version, content_hash            ← igual ao rule_sets, versionado
├─ applicable_regions[]                      ← onde esse perfil vale
├─ applicable_systems[]                      ← plantio direto, convencional, irrigado...
├─ authored_by, reviewed_by[], approved_by   ← mesma trilha de homologação

crop_profile_parameters (novo, proposta) — um por parâmetro dentro do perfil
├─ crop_profile_id
├─ parameter_code (ex.: "P", "K", "pH", "MO")
├─ parameter_category  → QUIMICO | FISICO | MICROBIOLOGICO
├─ depth_range (de/até cm) — a MESMA concentração pode ter faixa diferente por camada
├─ analytical_method_allowed[]               ← métodos aceitos para esse parâmetro
├─ unit_expected
├─ sufficiency_ranges (jsonb)                ← ex.: muito baixo / baixo / adequado / alto / muito alto,
│                                               cada faixa com min/max
├─ criticality (BAIXA/MEDIA/ALTA)            ← quão grave é estar fora da faixa
├─ yield_goal_bracket (opcional)             ← a faixa pode mudar conforme a meta produtiva
├─ technical_notes                           ← observação técnica do agrônomo autor
└─ recommendation_rules (jsonb)              ← condições → sugestão + prioridade + "requiresReview"
```

**Ponto central que você pediu, garantido por este desenho:** a mesma concentração de nutriente (ex.: P = 14 mg/dm³) pode cair em faixas de interpretação diferentes dependendo de `crop_profile` (soja ≠ milho), `depth_range` (0–20cm ≠ 20–40cm), `analytical_method_allowed` (Mehlich ≠ resina) e `applicable_systems`/`applicable_regions` — porque a consulta ao motor sempre filtra por essas 4 chaves ao mesmo tempo, nunca aplica uma faixa "genérica".

Esses perfis são **cadastrados e versionados como dado**, nunca escritos direto na tela — a interface de "Inteligência agronômica" (seção 6) é onde um agrônomo homologador cria/edita um perfil; o código da aplicação só lê. Isso é o que garante que dá pra adicionar trigo, cevada, arroz etc. no futuro **sem reescrever o produto**, só cadastrando um novo `crop_profile`.

---

## 4. Modelo de dados necessário (o que precisa ser criado ou estendido)

Só o desenho — **nenhuma migration será criada agora**, isso é proposta para você aprovar.

**Estender tabelas existentes:**
- `crop_seasons`: adicionar `crop_profile_id`, `cultivar`, `management_system` (sistema de cultivo), `soil_type`, `soil_texture`, `technical_region_code`.
- `lab_results`: adicionar `parameter_category` (QUIMICO/FISICO/MICROBIOLOGICO) — hoje todo resultado é genérico.
- `properties` ou `fields`: `technical_region_code` (a região técnica pode ser por propriedade ou por talhão, a decidir com o agrônomo).

**Criar tabelas novas:**
- `crop_profiles` e `crop_profile_parameters` (seção 3).
- `technical_regions` — cadastro simples das regiões técnicas usadas para escopar `rule_sets`/`crop_profiles` (hoje `rule_sets.region_code` já existe como texto, mas sem uma tabela de apoio para evitar erro de digitação).

**Já existem e serão reaproveitadas sem mudança:**
- `rule_sets`, `interpretations`, `reports`, `audit_events` — a "prateleira" descrita na seção 1.2.

---

## 5. Camadas de análise por talhão e cultura (proposta de composição, não de UI ainda)

Cada análise por talhão/cultura passa a poder apresentar, **somente quando houver dado real por trás**:

- condição química — direto do `lab_results` + `crop_profile_parameters` (categoria QUIMICO);
- condição física — idem, categoria FISICO (hoje nenhum laudo trafega isso ainda; a estrutura fica pronta, exibida só quando existir dado);
- condição microbiológica — idem, categoria MICROBIOLOGICO, mesma regra;
- fertilidade por nutriente — resultado da Camada 1 cruzando `lab_results` com `crop_profile_parameters.sufficiency_ranges`;
- limitações principais e fatores de risco — direto de `interpretations.structured_output.limitingFactors` (o tipo já existe em `src/domain/analysis.ts`, só falta ser preenchido);
- tendência histórica / comparação entre safras / comparação entre pontos — consulta que junta várias `analyses` do mesmo talhão ao longo do tempo (dado já existe, falta a tela — é a tela "Histórico" do conceito visual, seção 6);
- zonas críticas / mapa espacial — depende de `sample_points.position` (PostGIS, já existe) cruzado com a classificação da Camada 1 por ponto;
- prioridades de intervenção — só aparece quando existir `crop_profile_parameters.recommendation_rules` homologado para aquela cultura;
- potencial impacto produtivo — **fica marcado como bloqueado até existir metodologia técnica validada por um agrônomo**, exatamente como você pediu; não é estimado por aproximação.

---

## 6. Arquitetura de telas (navegação revisada)

Ampliando o conceito visual já aprovado na direção (grafite/turquesa/cobre, Sora+Inter, os 8 protótipos publicados), a navegação passa a comportar os itens que você listou:

```
Painel
 └─ Dashboard executivo

Operação
 ├─ Clientes
 ├─ Propriedades
 ├─ Talhões
 ├─ Safras e Culturas          ← aqui se vincula cultura/cultivar/sistema a cada talhão+período,
 │                                 e é esse vínculo que alimenta a interpretação automaticamente
 ├─ Ordens de coleta
 └─ Pontos de amostragem

Laboratório
 └─ Laboratório e importações

Inteligência
 ├─ Análises
 ├─ Inteligência agronômica     ← NOVO: onde o agrônomo homologador cadastra/revisa
 │                                 crop_profiles e rule_sets (não é tela de produtor final)
 ├─ Mapas
 ├─ Fertilidade                 ← NOVO: recorte específico de condição química/física/micro
 ├─ Histórico e evolução
 ├─ Comparativos                ← NOVO: safra x safra, ponto x ponto
 ├─ Recomendações                (continua bloqueada até motor homologado)
 └─ Planejamento                 (bloqueada — depende de recomendações existirem)

Monitoramento
 ├─ Alertas                     ← NOVO: pendência de coleta, dado fora de faixa, revisão parada
 └─ Indicadores operacionais    ← NOVO: carteira, confiabilidade média, pendências (visão executiva B2B)

Relatórios
 └─ Relatórios (executivos e técnicos)

Administração
 ├─ Usuários e permissões
 └─ Configurações
```

Isso não invalida os 8 protótipos já publicados — Dashboard, Análises, Talhões, Clientes, Laboratório, Histórico, Configurações e a Sidebar continuam sendo a base visual. As telas novas (Inteligência agronômica, Fertilidade, Comparativos, Alertas, Indicadores operacionais, Planejamento) seguem o mesmo sistema visual quando forem desenhadas.

---

## 7. Arquitetura dos mapas (real, PostGIS — não abstrato)

Você está certo em exigir isso: os mapas do protótipo visual usam formas ilustrativas de propósito (é um protótipo de aparência, não a versão final). A versão real:

- **mapa-base real** (ex.: camada de satélite/rua via provedor de tiles já compatível com o Leaflet que o projeto já usa — `leaflet` já está no `package.json`);
- **polígono real do talhão** — direto de `fields.boundary` (`MultiPolygon,4326`, já existe e já é a fonte oficial);
- **pontos GPS reais** — direto de `sample_points.position` (já existe);
- **camadas por nutriente** — cada camada é a mesma geometria dos pontos, coloridas pela classificação daquele parâmetro (depende da Camada 1 do motor);
- **filtro por profundidade e por cultura/safra** — os mesmos campos já existentes em `sample_points`/`crop_seasons`;
- **status de coleta** — já existe (`sample_points.collected_at`);
- **histórico** — comparação entre `collection_order` de safras diferentes do mesmo talhão;
- **interpolação espacial** — **fica marcada como Fase 3 (seção 8)**, porque exige densidade mínima de pontos e validação espacial — o próprio `docs/MOTOR_AGRONOMICO.md` já é explícito: *"Mapas interpolados só podem ser gerados quando densidade e validação espacial forem suficientes; caso contrário, a interface apresenta pontos ou zonas e informa a limitação."*
- **legenda dinâmica e seleção de parâmetro** — UI sobre os dados acima, sem gerar número novo;
- **comparação entre períodos** — mesma talhão, duas datas, dois conjuntos de `sample_points` lado a lado.

---

## 8. MVP / Fase 2 / Fase 3

### MVP (primeiro corte que já entrega valor real e sem risco agronômico)
1. Modelo de dados: `crop_profiles`, `crop_profile_parameters`, extensão de `crop_seasons`/`lab_results` (seção 4).
2. Tela "Safras e Culturas" real, vinculando cultura/cultivar/sistema por talhão+período.
3. Motor determinístico (Camada 1) rodando **para uma única cultura piloto**, com um `crop_profile` homologado por um agrônomo responsável (provavelmente soja, a definir com você/o pesquisador Cabeda citado em `MOTOR_AGRONOMICO.md`).
4. Tela "Inteligência agronômica" para o agrônomo cadastrar/revisar esse primeiro perfil.
5. `interpretations` passa a ser realmente gravada, com status `CALCULATED → IN_REVIEW → APPROVED`, sem IA ainda nesta etapa.
6. Painel de Análises (protótipo já aprovado) passa a mostrar dado real de interpretação, sempre com "aguardando validação técnica" quando aplicável.

### Fase 2
1. Camada 2 (IA) ligada — só narrativa sobre `structured_output` já aprovado/calculado, nunca sobre laudo cru.
2. Expandir `crop_profiles` para milho, trigo e demais culturas prioritárias, um de cada vez, sempre homologado antes de ativar.
3. Categorização física/microbiológica de `lab_results` (depende de laboratórios parceiros passarem a enviar esse dado).
4. Telas Fertilidade, Comparativos, Histórico completo, Alertas.
5. Mapas com camadas reais por nutriente/profundidade/cultura sobre o mapa-base real.

### Fase 3
1. Interpolação espacial (zonas, não só pontos) — só quando houver densidade/validação suficiente, por talhão.
2. Planejamento e priorização de intervenção — só quando houver `recommendation_rules` homologadas o bastante para isso ser responsável.
3. Indicadores operacionais / visão de carteira consolidada (o recorte mais "executivo B2B" do produto).
4. Comparação avançada entre regiões/safras em escala de carteira (vários talhões/clientes).

---

## 9. O que depende obrigatoriamente de validação de um agrônomo (não é código, é decisão técnica)

Nada nesta lista pode ser resolvido por engenharia sozinha — é onde a plataforma **precisa parar e esperar** por revisão profissional:

- todo `crop_profile` e suas `sufficiency_ranges` (as faixas de suficiência em si);
- todo `rule_set` e seu `recommendation_rules`;
- a definição de quais métodos analíticos são aceitos por parâmetro/cultura;
- a definição das regiões técnicas e de quais perfis valem em cada uma;
- os pesos/critérios do Índice de Confiabilidade quando ele passar a incluir "compatibilidade de regra" e "contexto agronômico" (hoje só mede qualidade de importação);
- qualquer metodologia de "potencial impacto produtivo";
- a decisão de quando a densidade de pontos é suficiente para liberar interpolação espacial;
- a aprovação final de cada `interpretation` antes de virar `reports` publicado.

Nenhum desses pontos será preenchido com valor inventado. Onde não houver base homologada, a interface mostra claramente "aguardando validação técnica" em vez de qualquer número.

---

## 10. Identidade visual

Confirmado: os arquivos oficiais da marca já estão no projeto e foram usados como referência exata no conceito visual publicado — `public/brand/logo-dark.svg` (símbolo vetorizado oficial) e `docs/brand/Guia_de_Marca_Raiz_Digital.pdf` (cores, tipografia, regras de uso). Nenhuma logo foi recriada ou aproximada; o símbolo usado nos protótipos é a reprodução fiel do SVG oficial. Se novas telas desta proposta (Inteligência agronômica, Fertilidade, Alertas etc.) forem desenhadas depois, seguirão os mesmos arquivos — não será necessário pedir os assets de novo.

---

## Resumo para decisão

Isso é só o desenho. Nada foi implementado. Se você aprovar a direção geral, o próximo passo seria começar pelo MVP da seção 8 — e mesmo assim, o primeiro bloco real de código seria o modelo de dados (seção 4) e a tela "Safras e Culturas", porque sem isso não há como um agrônomo cadastrar o primeiro `crop_profile` homologado.
