import type { AgronomicPrescriptionProvider } from "@/lib/ai/agronomic-prescription-provider";

export class PrescriptionProviderUnavailableError extends Error {
  constructor() {
    super("A IA de prescrição ainda não está conectada neste servidor (falta configurar ANTHROPIC_API_KEY).");
    this.name = "PrescriptionProviderUnavailableError";
  }
}

/** Nunca inventa uma prescrição -- falha de forma clara e detectável quando não há provedor real configurado. */
export const unavailablePrescriptionProvider: AgronomicPrescriptionProvider = {
  name: "unavailable",
  model: "none",
  isRealLanguageModel: false,
  async prescribe() {
    throw new PrescriptionProviderUnavailableError();
  },
};
