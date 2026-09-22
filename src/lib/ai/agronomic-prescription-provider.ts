import type { AgronomicPrescriptionEvidencePackage } from "@/lib/ai/prescription-evidence-package";
import type { AgronomicPrescription } from "@/lib/ai/agronomic-prescription-schema";
import { claudePrescriptionProvider } from "@/lib/ai/providers/claude-prescription-provider";
import { geminiPrescriptionProvider } from "@/lib/ai/providers/gemini-prescription-provider";
import { deterministicLimitedPrescriptionProvider } from "@/lib/ai/providers/deterministic-limited-prescription-provider";

/**
 * Interface da IA de prescrição. Diferente de `AgronomicExplanationProvider`
 * (que só pode devolver texto explicativo), este formato tem onde colocar
 * dose e insumo -- de propósito, porque aqui a IA pesquisa e propõe o
 * diagnóstico e o manejo, como pedido pelo diretor. A salvaguarda não é o
 * tipo: é que toda prescrição nasce PENDING_REVIEW e só vira recomendação
 * oficial (`input_recommendations`) depois de um profissional aprovar.
 */

export type AgronomicPrescriptionRequest = {
  evidence: AgronomicPrescriptionEvidencePackage;
};

export type AgronomicPrescriptionProviderResult = {
  prescription: AgronomicPrescription;
  provider: string;
  model: string;
  promptVersion: string;
  generatedAt: string;
  isRealLanguageModel: boolean;
  tokensUsed?: number;
  costUsd?: number;
};

export interface AgronomicPrescriptionProvider {
  readonly name: string;
  readonly model: string;
  readonly isRealLanguageModel: boolean;
  prescribe(request: AgronomicPrescriptionRequest): Promise<AgronomicPrescriptionProviderResult>;
}

/**
 * Ponto único de resolução do provedor. Preferência: Anthropic (maior
 * qualidade, quando houver crédito) > Gemini (nível gratuito, usado como
 * alternativa enquanto não há crédito pago em nenhum provedor -- decisão do
 * diretor, 2026-09-04, para viabilizar um piloto de demonstração sem custo)
 * > fechamento determinístico limitado local. O fallback nunca inventa dose, produto ou manejo:
 * apenas transporta o diagnóstico já calculado e suas limitações para o mesmo fluxo de revisão.
 * Assim, indisponibilidade de LLM não impede concluir um relatório tecnicamente limitado.
 */
export function resolveAgronomicPrescriptionProvider(): AgronomicPrescriptionProvider {
  if (process.env.ANTHROPIC_API_KEY) return claudePrescriptionProvider;
  if (process.env.GEMINI_API_KEY) return geminiPrescriptionProvider;
  return deterministicLimitedPrescriptionProvider;
}
