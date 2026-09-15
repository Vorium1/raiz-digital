# Pesquisa técnica Work → implementação RAIZ — 2026-09-14

## Artefatos de origem

Esta implementação usa como snapshot técnico os artefatos produzidos no ChatGPT Work e trazidos para a revisão do repositório em 2026-09-14:

- `RAIZ-motor-rule-catalog.json` — catálogo máquina-legível de regras e estados;
- `RAIZ-source-ledger.json` — SHA-256 e tamanho dos documentos primários usados na pesquisa;
- relatório `RAIZ-Pesquisa-Tecnica-Motor.docx` — justificativa, conflitos, limites e matriz de suficiência.

Os dois JSONs estão versionados neste diretório. O snapshot lógico usado nas execuções é `RAIZ-WORK-RESEARCH-2026-09-14`.

## O que virou código determinístico

1. Nitrogênio de milho, trigo, canola e pastagem de inverno em `src/domain/nitrogen-dose-engine.ts`.
2. Enxofre de trigo e canola em `src/domain/sulfur-dose-engine.ts`, sempre exigindo método analítico compatível com o limiar da fonte.
3. Conversão de nutrientes em produtos e custos continua centralizada em `src/domain/commercial-input-engine.ts`; a pesquisa confirmou a arquitetura já adotada, portanto não foi criada uma segunda implementação paralela.
4. Conversão de necessidade de calcário PRNT100 para produto comercial continua na mesma camada comercial, usando o PRNT explicitamente informado.
5. `src/domain/agronomic-rule-catalog.ts` concentra versão, snapshot, fonte e estado de automação. Somente `READY_FOR_IMPLEMENTATION` pode ser tratado como regra automática.
6. `agronomic_rule_executions` registra de forma append-only regra, versão, snapshot, inputs, outputs, fonte e usuário; uma atualização futura do catálogo não reescreve o passado.
7. O gate de taxa variável foi endurecido: VRA permanece opt-in e passa a verificar quantidade/distribuição de pontos, profundidade, método, qualidade do atributo, revisão profissional e validação cruzada conforme o método.

## Decisões de segurança que NÃO viraram dose automática

- arroz irrigado SOSBAI 2025: mantém `REQUIRES_AGRONOMIST_REVIEW` por conflito/seleção explícita de edição e escopo;
- gesso no RS/SC: mantém revisão profissional; fórmula de Cerrado não é transplantada;
- Mo de soja com fontes/condições concorrentes: revisão profissional;
- B, Zn, Cu e Mn: nenhuma dose derivada apenas de classe de suficiência;
- carinata no RS/SC: `INSUFFICIENT_EVIDENCE` para dose regional de N/S/B;
- N tardio em trigo para proteína: módulo de qualidade sob revisão, nunca default de produtividade;
- cenário “baixo/médio/alto investimento”: não multiplica dose; produtividade é meta numérica e estratégia comercial é uma camada separada;
- NDVI não é convertido diretamente em produtividade ou dose;
- taxa variável sem suporte amostral/validação não extrapola e não transforma NoData em zero.

## Convenções conservadoras adicionais

Faixas e sinais de “menor ou igual” publicados não são convertidos em um único número arbitrário. Nesses casos o motor retorna `RANGE` e/ou estado de revisão. Quando a fonte não define a ordem de combinação de modificadores, o cálculo é bloqueado para revisão em vez de somar fatores silenciosamente.

## Próximos passos fora deste snapshot

- ligar os novos motores às telas/orquestradores somente onde todos os campos obrigatórios estiverem presentes;
- homologar no ambiente real o ledger de execução e a migração;
- manter catálogo comercial tenant-scoped e snapshots de produto/preço em evolução separada;
- preservar arroz/gesso/micronutrientes/carinata como gates até validação profissional/fonte regional suficiente.
