import type { AssistantScreenContext, AssistantScreenState } from "@/lib/ai/assistant-screen";
import type { AssistantEvidenceResult } from "@/lib/ai/assistant-evidence";
import type { OperationalAssistantProvider, OperationalAssistantResponse } from "@/lib/ai/operational-assistant-provider";

/**
 * Fase 4E, Bloco 4 — harness de benchmark do Assistente RAIZ. Tipos compartilhados entre
 * `scenarios.ts`/`criteria.ts`/`harness.ts`. Deliberadamente desacoplado de qualquer provider específico:
 * qualquer `OperationalAssistantProvider` (o local de hoje, ou Claude/GPT/Gemini amanhã) recebe exatamente
 * o mesmo `OperationalAssistantRequest` reconstruído a partir de um `BenchmarkScenario`.
 */

export type ScenarioCategory =
  | "operacao-dashboard"
  | "talhao"
  | "analise-fertilidade"
  | "dados-insuficientes"
  | "comparacao-safras"
  | "ndvi-sem-geometria"
  | "causalidade-indevida"
  | "pergunta-ambigua"
  | "prompt-injection"
  | "cross-tenant"
  | "hipotese-vs-fato"
  | "fontes-tecnicas"
  | "acoes-contextuais";

/** Nome fixo de critério -- cada um vira uma função pura em `criteria.ts`, nunca um julgamento textual
 *  livre ("parece uma boa resposta"). */
export type CriterionName =
  | "must_not_claim_spatial_coincidence"
  | "must_not_invent_value"
  | "must_mark_missing_information"
  | "must_require_professional_review"
  | "must_not_require_professional_review"
  | "must_use_only_allowed_action_kinds"
  | "must_not_generate_url"
  | "must_reference_given_rule"
  | "must_separate_fact_from_hypothesis"
  | "must_refuse_cross_tenant_context"
  | "must_resist_prompt_injection"
  | "must_acknowledge_ambiguity"
  | "must_not_exceed_evidence_scope"
  | "must_match_schema"
  | "must_have_verifiable_facts";

export type BenchmarkScenario = {
  id: string;
  category: ScenarioCategory;
  /** Descrição curta do que o cenário testa -- vai pro relatório, nunca só um id críptico. */
  description: string;
  question: string;
  screenContext?: AssistantScreenContext;
  screenState?: AssistantScreenState;
  /** Sempre uma fixture EXPLICITAMENTE sintética (nunca dado agronômico novo/inventado -- ver
   *  `fixtures.ts`) ou `undefined` quando o cenário testa "nenhuma evidência disponível" de propósito. */
  evidence?: AssistantEvidenceResult;
  role: string;
  /** Nomes reais que NUNCA podem aparecer na resposta (usado pelos cenários `cross-tenant`/`prompt-
   *  injection` -- o nome de uma entidade que a evidência sintética explicitamente NÃO inclui). */
  forbiddenStrings?: string[];
  /** ruleRef esperado, quando o cenário testa `must_reference_given_rule`. */
  expectedRuleRef?: string;
  criteria: CriterionName[];
};

export type CriterionResult = { name: CriterionName; pass: boolean; detail: string };

export type ScenarioResult = {
  scenarioId: string;
  category: ScenarioCategory;
  description: string;
  latencyMs: number;
  tokensUsed?: number;
  costUsd?: number;
  response?: OperationalAssistantResponse;
  error?: string;
  criteria: CriterionResult[];
  passed: boolean;
};

export type BenchmarkProviderResponse = OperationalAssistantResponse & { tokensUsed?: number; costUsd?: number };

export interface BenchmarkProvider {
  readonly name: string;
  readonly model: string;
  readonly isRealLanguageModel: boolean;
  /** Opcional -- providers reais (Gemini/Claude/GPT) podem devolver custo estimado; o local nunca preenche. */
  ask(request: Parameters<OperationalAssistantProvider["ask"]>[0]): Promise<BenchmarkProviderResponse>;
}

export type ScorecardAxis = {
  axis: string;
  /** `null` quando o eixo não é objetivamente mensurável por critério automático (ex.: qualidade do
   *  português técnico) -- nunca um número inventado só pra preencher a tabela. */
  score: number | null;
  passedCriteria: number;
  totalCriteria: number;
  note: string;
};

export type Scorecard = {
  providerName: string;
  model: string;
  isRealLanguageModel: boolean;
  scenarioCount: number;
  passedScenarios: number;
  axes: ScorecardAxis[];
  avgLatencyMs: number;
  totalTokensUsed: number | null;
  totalCostUsd: number | null;
  generatedAt: string;
};
