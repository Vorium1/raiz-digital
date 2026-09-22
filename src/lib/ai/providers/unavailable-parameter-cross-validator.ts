import type { ParameterCrossValidationProvider } from "@/lib/ai/providers/parameter-cross-validation-types";

/** Mesma convenção do resto da base (ver `unavailable-prescription-provider.ts`): sem credencial de
 * IA configurada, falha com erro claro -- nunca inventa um resultado de cruzamento "de mentira". */
export const unavailableParameterCrossValidator: ParameterCrossValidationProvider = {
  name: "unavailable",
  model: "none",
  isRealLanguageModel: false,
  async crossValidate() {
    throw new Error("Nenhum provedor de IA configurado nesta instância (defina GEMINI_API_KEY) -- cruzamento automático indisponível.");
  },
};
