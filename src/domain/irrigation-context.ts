export type IrrigationContextWaterRegime = "" | "SEQUEIRO" | "IRRIGADO";

export type IrrigationContextInput = {
  waterRegime: IrrigationContextWaterRegime;
  irrigationSystem?: string | null;
  irrigationDepthMm?: number | null;
  irrigationFrequencyDays?: number | null;
  irrigationApplicationTime?: string | null;
  irrigationNotes?: string | null;
};

export type IrrigationDetailLevel =
  | "NOT_DECLARED"
  | "SEQUEIRO_DECLARED"
  | "IRRIGATION_PRESENCE_ONLY"
  | "IRRIGATION_BASIC"
  | "IRRIGATION_QUANTIFIED";

function optionalPositive(value: number | null | undefined, label: string) {
  if (value == null) return null;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} deve ser maior que zero quando informado.`);
  }
  return value;
}

function text(value: string | null | undefined) {
  return value?.trim() ?? "";
}

/**
 * Contexto progressivo de irrigação.
 *
 * Regras:
 * - declarar somente "IRRIGADO" já é informação válida;
 * - detalhes aumentam precisão, mas nunca são obrigatórios para o parecer base;
 * - lâmina/frequência permitem caracterizar intensidade operacional, mas não
 *   substituem balanço hídrico, ETc, chuva, capacidade de armazenamento ou
 *   eficiência real do sistema;
 * - horário isolado nunca é usado para inferir volume aplicado;
 * - nenhum detalhe hídrico autoriza alterar dose nutricional sem regra específica.
 */
export function evaluateIrrigationContext(input: IrrigationContextInput) {
  const depthMm = optionalPositive(input.irrigationDepthMm, "Lâmina de irrigação");
  const frequencyDays = optionalPositive(input.irrigationFrequencyDays, "Intervalo entre irrigações");
  const system = text(input.irrigationSystem);
  const applicationTime = text(input.irrigationApplicationTime);
  const notes = text(input.irrigationNotes);

  const warnings: string[] = [];

  if (input.waterRegime !== "IRRIGADO" && (system || depthMm != null || frequencyDays != null || applicationTime || notes)) {
    warnings.push("IRRIGATION_DETAILS_PRESENT_WITHOUT_IRRIGATED_REGIME");
  }

  let detailLevel: IrrigationDetailLevel;
  if (input.waterRegime === "") {
    detailLevel = "NOT_DECLARED";
  } else if (input.waterRegime === "SEQUEIRO") {
    detailLevel = "SEQUEIRO_DECLARED";
  } else if (depthMm != null && frequencyDays != null) {
    detailLevel = "IRRIGATION_QUANTIFIED";
  } else if (system || depthMm != null || frequencyDays != null || applicationTime || notes) {
    detailLevel = "IRRIGATION_BASIC";
  } else {
    detailLevel = "IRRIGATION_PRESENCE_ONLY";
  }

  const approximateAverageAppliedMmPerDay = input.waterRegime === "IRRIGADO"
    && depthMm != null
    && frequencyDays != null
      ? Math.round((depthMm / frequencyDays) * 1000) / 1000
      : null;

  if (approximateAverageAppliedMmPerDay != null) {
    warnings.push("IRRIGATION_MM_DAY_IS_OPERATIONAL_AVERAGE_NOT_CROP_WATER_BALANCE");
  }

  return {
    waterRegime: input.waterRegime,
    detailLevel,
    irrigationDeclared: input.waterRegime === "IRRIGADO",
    quantifiedApplicationPatternAvailable: input.waterRegime === "IRRIGADO" && depthMm != null && frequencyDays != null,
    irrigationSystem: system || null,
    irrigationDepthMm: depthMm,
    irrigationFrequencyDays: frequencyDays,
    irrigationApplicationTime: applicationTime || null,
    irrigationNotes: notes || null,
    approximateAverageAppliedMmPerDay,
    analysisPolicy: {
      irrigationRequiredForBaseSoilOpinion: false as const,
      missingIrrigationDetailsBlocksAnalysis: false as const,
      missingIrrigationDetailsBlocksOfficialReport: false as const,
      presenceOnlyIsValidEvidence: true as const,
      automaticNutrientDoseChangeAllowed: false as const,
      automaticWaterBalanceInferenceAllowed: false as const,
    },
    warnings,
  };
}
