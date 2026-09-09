import type { AgronomicPrescriptionEvidencePackage } from "@/lib/ai/prescription-evidence-package";
import type { AgronomicPrescription } from "@/lib/ai/agronomic-prescription-schema";
import { claudePrescriptionProvider } from "@/lib/ai/providers/claude-prescription-provider";
import { geminiPrescriptionProvider } from "@/lib/ai/providers/gemini-prescription-provider";
import { unavailablePrescriptionProvider } from "@/lib/ai/providers/unavailable-prescription-provider";

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
 * > provedor indisponível, que sempre falha com um erro claro -- nunca
 * inventa uma prescrição falsa para "parecer pronto". Trocar de provedor no
 * futuro (ex.: crédito Anthropic chegou) não exige mudar nenhum outro
 * arquivo, só a variável de ambiente.
 */
export function resolveAgronomicPrescriptionProvider(): AgronomicPrescriptionProvider {
  if (process.env.ANTHROPIC_API_KEY) return claudePrescriptionProvider;
  if (process.env.GEMINI_API_KEY) return geminiPrescriptionProvider;
  return unavailablePrescriptionProvider;
}
