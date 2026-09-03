import type { AgronomicPrescriptionEvidencePackage } from "@/lib/ai/prescription-evidence-package";
import type { AgronomicPrescription } from "@/lib/ai/agronomic-prescription-schema";
import { claudePrescriptionProvider } from "@/lib/ai/providers/claude-prescription-provider";
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
 * Ponto único de resolução do provedor. Sem `ANTHROPIC_API_KEY` configurada
 * no servidor, devolve um provedor que sempre falha com um erro claro --
 * nunca inventa uma prescrição falsa para "parecer pronto". Assim que a
 * chave existir (variável de ambiente, nunca no navegador/repositório),
 * passa a usar o provedor real automaticamente, sem precisar mudar nenhum
 * outro arquivo.
 */
export function resolveAgronomicPrescriptionProvider(): AgronomicPrescriptionProvider {
  if (process.env.ANTHROPIC_API_KEY) return claudePrescriptionProvider;
  return unavailablePrescriptionProvider;
}
