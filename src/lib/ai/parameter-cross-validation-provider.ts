import type { ParameterCrossValidationProvider } from "@/lib/ai/providers/parameter-cross-validation-types";
import { geminiParameterCrossValidator } from "@/lib/ai/providers/gemini-parameter-cross-validator";
import { unavailableParameterCrossValidator } from "@/lib/ai/providers/unavailable-parameter-cross-validator";

export type { ParameterCrossValidationProvider, ParameterCrossValidationRequest, ParameterCrossValidationResult } from "@/lib/ai/providers/parameter-cross-validation-types";

/**
 * Ponto único de resolução do provedor de cruzamento de parâmetro técnico, no mesmo padrão de
 * `agronomic-prescription-provider.ts` -- pedido do diretor, 2026-09-09: quando a IA cruza um parâmetro
 * com a literatura reconhecida e não encontra divergência, isso deve virar um SINAL visível pro curador
 * (nunca uma homologação automática -- ver CLAUDE.md: "IA não decide agronomia"). O resultado sempre
 * informa `model` honestamente (ex.: "gemini-3.6-flash") -- nesta instância só há um provedor de IA
 * configurado, então a UI nunca deve sugerir que várias IAs diferentes cruzaram o dado quando só uma
 * rodou de fato.
 */
export function resolveParameterCrossValidationProvider(): ParameterCrossValidationProvider {
  if (process.env.GEMINI_API_KEY) return geminiParameterCrossValidator;
  return unavailableParameterCrossValidator;
}
