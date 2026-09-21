export type NitrogenTargetCrop = "MILHO" | "TRIGO" | "CANOLA" | "PASTAGEM_INVERNO";

export type NitrogenContextFields = {
  cornPrecedingClass?: "LEGUME_OR_FALLOW" | "GRASS" | "GRASS_SUCCESSION" | null;
  plannedPopulationPlantsPerHa?: number | null;
  residueClass?: "LEGUME" | "GRASS" | "UNKNOWN" | null;
  residueBiomassTonPerHa?: number | null;
  wheatPrecedingCrop?: "SOY" | "CORN" | null;
  lateQualityNitrogenRequested?: boolean | null;
  pastureType?: "ANNUAL_GRASS" | "PERENNIAL_GRASS" | "LEGUME" | null;
  targetDryMatterTonPerHa?: number | null;
  precedingLegume?: boolean | null;
  effectiveLegumeInoculation?: boolean | null;
  provenLegumeInoculationFailure?: boolean | null;
  numberOfUses?: number | null;
  /** Metadata de leitura; nunca é aceita como campo mutável pelo repositório. */
  updatedAt?: string | null;
};

export type NitrogenReadinessBlocker =
  | "TARGET_CROP_UNSUPPORTED"
  | "YIELD_GOAL_MISSING"
  | "YIELD_GOAL_INVALID"
  | "YIELD_UNIT_MISSING"
  | "YIELD_UNIT_UNSUPPORTED"
  | "ORGANIC_MATTER_MISSING"
  | "ORGANIC_MATTER_INVALID"
  | "ORGANIC_MATTER_UNIT_UNSUPPORTED"
  | "ORGANIC_MATTER_BAND_CONFLICT"
  | "CORN_PRECEDING_CLASS_REQUIRED"
  | "CORN_POPULATION_REQUIRED"
  | "CORN_RESIDUE_CLASS_REQUIRED"
  | "WHEAT_PRECEDING_CROP_REQUIRED"
  | "PASTURE_TYPE_REQUIRED"
  | "PASTURE_DRY_MATTER_TARGET_REQUIRED"
  | "PASTURE_PRECEDING_LEGUME_REQUIRED"
  | "PASTURE_LEGUME_INOCULATION_STATUS_REQUIRED"
  | "PASTURE_LEGUME_INOCULATION_STATUS_CONFLICT"
  | "PASTURE_NUMBER_OF_USES_REQUIRED";

export type NitrogenRecommendationReadiness = {
  ready: boolean;
  blockers: NitrogenReadinessBlocker[];
  normalized: {
    targetCrop: NitrogenTargetCrop | null;
    targetYieldTonPerHa: number | null;
    representativeOrganicMatterPct: number | null;
    organicMatterBand: string | null;
    targetDryMatterTonPerHa: number | null;
  };
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

export function normalizeNitrogenTargetCrop(value: string | null | undefined): NitrogenTargetCrop | null {
  if (!value?.trim()) return null;
  const crop = normalizeText(value);
  if (crop.includes("MILHO")) return "MILHO";
  if (crop.includes("TRIGO")) return "TRIGO";
  if (crop.includes("CANOLA")) return "CANOLA";
  if (crop.includes("PASTAGEM") || (crop.includes("AVEIA") && crop.includes("AZEVEM"))) return "PASTAGEM_INVERNO";
  return null;
}

function isTonPerHaUnit(unit: string): boolean {
  const normalized = unit
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/⁻/g, "-")
    .replace(/¹/g, "1");
  return new Set(["t/ha", "t.ha-1", "tha-1", "ton/ha", "tonelada/ha", "toneladas/ha"]).has(normalized);
}

export function isOrganicMatterPercentUnit(unit: string): boolean {
  const normalized = unit.trim().toLowerCase().replace(/\s+/g, "");
  return new Set(["%", "percent", "pct", "porcentagem"]).has(normalized);
}

export type NitrogenOrganicMatterObservation = {
  sampleCode: string;
  value: number;
  unit: string;
  method: string;
};

/**
 * Fingerprint determinístico do conjunto de MO que sustenta o cálculo de N.
 *
 * Não converte unidade, não arredonda valor e não ignora método. A finalidade
 * é provar que a execução persistida foi calculada sobre o mesmo conjunto
 * laboratorial que o laudo oficial está usando agora.
 */
export function buildNitrogenOrganicMatterFingerprint(
  observations: NitrogenOrganicMatterObservation[],
): string {
  const normalized = observations.map((row) => {
    if (!Number.isFinite(row.value)) throw new Error("Valor de matéria orgânica inválido para fingerprint.");
    return {
      sampleCode: row.sampleCode.trim(),
      value: row.value,
      unit: row.unit.trim(),
      method: row.method.trim(),
    };
  }).sort((a, b) =>
    a.sampleCode.localeCompare(b.sampleCode)
    || a.value - b.value
    || a.unit.localeCompare(b.unit)
    || a.method.localeCompare(b.method)
  );
  return JSON.stringify(normalized);
}

function grainOmBand(value: number) {
  if (value <= 2.5) return "OM_LE_2_5";
  if (value <= 5) return "OM_2_5_TO_5";
  return "OM_GT_5";
}

function pastureOmBand(value: number) {
  if (value < 1.6) return "OM_LT_1_6";
  if (value <= 2.5) return "OM_1_6_TO_2_5";
  if (value <= 3.5) return "OM_2_5_TO_3_5";
  if (value <= 4.5) return "OM_3_5_TO_4_5";
  return "OM_GT_4_5";
}

function organicMatterBand(crop: NitrogenTargetCrop, value: number) {
  return crop === "PASTAGEM_INVERNO" ? pastureOmBand(value) : grainOmBand(value);
}

function validPositive(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value > 0;
}

/**
 * A prontidão é deliberadamente conservadora. O motor de N é uniforme nesta
 * etapa, então valores de matéria orgânica que cruzem classes técnicas não são
 * reduzidos silenciosamente a uma média única. Isso evita uma dose de N
 * aparentemente exata em talhão cuja própria variável de entrada muda de faixa.
 */
export function evaluateNitrogenRecommendationReadiness(input: {
  targetCropRaw: string | null | undefined;
  yieldGoal: number | null | undefined;
  yieldGoalUnit: string | null | undefined;
  organicMatterValuesPct: number[];
  organicMatterUnits: string[];
  context: NitrogenContextFields;
}): NitrogenRecommendationReadiness {
  const blockers: NitrogenReadinessBlocker[] = [];
  const targetCrop = normalizeNitrogenTargetCrop(input.targetCropRaw);
  if (!targetCrop) blockers.push("TARGET_CROP_UNSUPPORTED");

  let targetYieldTonPerHa: number | null = null;
  if (targetCrop && targetCrop !== "PASTAGEM_INVERNO") {
    if (input.yieldGoal == null) blockers.push("YIELD_GOAL_MISSING");
    else if (!Number.isFinite(input.yieldGoal) || input.yieldGoal <= 0) blockers.push("YIELD_GOAL_INVALID");

    if (!input.yieldGoalUnit?.trim()) blockers.push("YIELD_UNIT_MISSING");
    else if (!isTonPerHaUnit(input.yieldGoalUnit)) blockers.push("YIELD_UNIT_UNSUPPORTED");
    else if (validPositive(input.yieldGoal)) targetYieldTonPerHa = input.yieldGoal as number;
  }

  if (input.organicMatterUnits.some((unit) => !isOrganicMatterPercentUnit(unit))) {
    blockers.push("ORGANIC_MATTER_UNIT_UNSUPPORTED");
  }

  const validOm = input.organicMatterValuesPct.filter((value) => Number.isFinite(value) && value >= 0);
  if (input.organicMatterValuesPct.length === 0) blockers.push("ORGANIC_MATTER_MISSING");
  else if (validOm.length !== input.organicMatterValuesPct.length) blockers.push("ORGANIC_MATTER_INVALID");

  let representativeOrganicMatterPct: number | null = null;
  let organicMatterBandValue: string | null = null;
  if (targetCrop && validOm.length > 0) {
    const bands = new Set(validOm.map((value) => organicMatterBand(targetCrop, value)));
    if (bands.size > 1) blockers.push("ORGANIC_MATTER_BAND_CONFLICT");
    else {
      organicMatterBandValue = [...bands][0] ?? null;
      representativeOrganicMatterPct = validOm.reduce((sum, value) => sum + value, 0) / validOm.length;
    }
  }

  if (targetCrop === "MILHO") {
    if (!input.context.cornPrecedingClass) blockers.push("CORN_PRECEDING_CLASS_REQUIRED");
    if (!validPositive(input.context.plannedPopulationPlantsPerHa)) blockers.push("CORN_POPULATION_REQUIRED");
    if (!input.context.residueClass) blockers.push("CORN_RESIDUE_CLASS_REQUIRED");
  }

  if (targetCrop === "TRIGO" && !input.context.wheatPrecedingCrop) {
    blockers.push("WHEAT_PRECEDING_CROP_REQUIRED");
  }

  let targetDryMatterTonPerHa: number | null = null;
  if (targetCrop === "PASTAGEM_INVERNO") {
    if (!input.context.pastureType) blockers.push("PASTURE_TYPE_REQUIRED");
    if (!validPositive(input.context.targetDryMatterTonPerHa)) blockers.push("PASTURE_DRY_MATTER_TARGET_REQUIRED");
    else targetDryMatterTonPerHa = input.context.targetDryMatterTonPerHa as number;
    if (input.context.precedingLegume == null) blockers.push("PASTURE_PRECEDING_LEGUME_REQUIRED");

    if (input.context.pastureType === "LEGUME") {
      if (input.context.effectiveLegumeInoculation === true && input.context.provenLegumeInoculationFailure === true) {
        blockers.push("PASTURE_LEGUME_INOCULATION_STATUS_CONFLICT");
      } else if (input.context.effectiveLegumeInoculation !== true && input.context.provenLegumeInoculationFailure !== true) {
        blockers.push("PASTURE_LEGUME_INOCULATION_STATUS_REQUIRED");
      }
      if (input.context.provenLegumeInoculationFailure === true && input.context.numberOfUses == null) {
        blockers.push("PASTURE_NUMBER_OF_USES_REQUIRED");
      }
    }
  }

  return {
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)],
    normalized: {
      targetCrop,
      targetYieldTonPerHa,
      representativeOrganicMatterPct,
      organicMatterBand: organicMatterBandValue,
      targetDryMatterTonPerHa,
    },
  };
}
