export const WHEAT_GRAIN_QUALITY_PARAMETER_CODES = [
  "PROTEIN_TOTAL",
  "GLUTEN_WET",
  "GLUTEN_DRY",
  "GLUTEN_INDEX",
  "ALVEOGRAPH_W",
  "P_L",
  "SDS_SEDIMENTATION",
  "GLIADIN",
  "GLUTENIN",
] as const;

export type WheatGrainQualityParameterCode = typeof WHEAT_GRAIN_QUALITY_PARAMETER_CODES[number];

export type WheatGrainQualityObservation = {
  sampleCode: string;
  parameterCode: WheatGrainQualityParameterCode;
  label: string;
  value: number;
  unit: string;
  method: string;
  protocol: string | null;
};

const LABELS: Record<WheatGrainQualityParameterCode, string> = {
  PROTEIN_TOTAL: "Proteína total",
  GLUTEN_WET: "Glúten úmido",
  GLUTEN_DRY: "Glúten seco",
  GLUTEN_INDEX: "Índice de glúten",
  ALVEOGRAPH_W: "Força de glúten (W)",
  P_L: "Relação P/L",
  SDS_SEDIMENTATION: "Sedimentação SDS",
  GLIADIN: "Gliadina",
  GLUTENIN: "Glutenina",
};

function isQualityCode(value: string): value is WheatGrainQualityParameterCode {
  return (WHEAT_GRAIN_QUALITY_PARAMETER_CODES as readonly string[]).includes(value);
}

export function wheatGrainQualityLabel(code: WheatGrainQualityParameterCode) {
  return LABELS[code];
}

/**
 * Evidência de qualidade tecnológica do grão.
 *
 * Esta camada NÃO classifica o trigo, NÃO infere uma métrica a partir de outra
 * e NÃO altera N. Ela apenas preserva medições reais de amostras GRAO para que
 * o parecer possa ganhar resolução quando o produtor tiver esse laudo.
 */
export function evaluateWheatGrainQualityEvidence(input: {
  cropProfileCode: string | null | undefined;
  currentCrop?: string | null;
  nextCrop?: string | null;
  currentCultivar?: string | null;
  nextCultivar?: string | null;
  rows: Array<{
    sampleCode: string;
    sampleType?: string | null;
    parameterCode: string;
    value: number;
    unit: string;
    method: string;
    protocol?: string | null;
  }>;
}) {
  if ((input.cropProfileCode?.trim().toUpperCase() ?? "") !== "TRIGO") {
    return {
      status: "NOT_APPLICABLE" as const,
      targetCultivar: null,
      observations: [] as WheatGrainQualityObservation[],
      metricsPresent: [] as WheatGrainQualityParameterCode[],
      policy: {
        automaticIndustrialGradeAllowed: false as const,
        automaticNitrogenAdjustmentAllowed: false as const,
        crossMetricInferenceAllowed: false as const,
        buyerSpecificationAssumed: false as const,
      },
    };
  }

  const nextIsWheat = (input.nextCrop?.trim().toUpperCase() ?? "").includes("TRIGO");
  const currentIsWheat = (input.currentCrop?.trim().toUpperCase() ?? "").includes("TRIGO");
  const targetCultivar = nextIsWheat
    ? input.nextCultivar?.trim() || null
    : currentIsWheat
      ? input.currentCultivar?.trim() || null
      : null;

  const observations = input.rows
    .filter((row) =>
      (row.sampleType?.trim().toUpperCase() ?? "") === "GRAO"
      && isQualityCode(row.parameterCode.trim().toUpperCase()),
    )
    .flatMap((row) => {
      const parameterCode = row.parameterCode.trim().toUpperCase();
      if (!isQualityCode(parameterCode)) return [];
      if (!Number.isFinite(row.value)) return [];
      if (!row.unit?.trim() || !row.method?.trim()) return [];
      return [{
        sampleCode: row.sampleCode,
        parameterCode,
        label: wheatGrainQualityLabel(parameterCode),
        value: row.value,
        unit: row.unit.trim(),
        method: row.method.trim(),
        protocol: row.protocol?.trim() || null,
      } satisfies WheatGrainQualityObservation];
    });

  const metricsPresent = [...new Set(observations.map((row) => row.parameterCode))];

  return {
    status: observations.length > 0 ? "AVAILABLE" as const : "NOT_AVAILABLE" as const,
    targetCultivar,
    observations,
    metricsPresent,
    policy: {
      automaticIndustrialGradeAllowed: false as const,
      automaticNitrogenAdjustmentAllowed: false as const,
      crossMetricInferenceAllowed: false as const,
      buyerSpecificationAssumed: false as const,
    },
  };
}
