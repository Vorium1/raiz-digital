import type { CropPhenologicalStage } from "./crop-climate-risk.ts";

export type CropPhenologyRule = {
  id: string;
  cropCode: string;
  region: {
    countryCode: string;
    stateCodes?: string[];
    municipalityCodes?: string[];
    technicalRegionCodes?: string[];
  };
  cultivarCycleGroups?: string[];
  stage: CropPhenologicalStage;
  cumulativeGdd?: { min?: number; max?: number };
  daysAfterSowing?: { min?: number; max?: number };
  photoperiodHours?: { min?: number; max?: number };
  source: {
    institution: string;
    title: string;
    locator?: string | null;
  };
  status: "HOMOLOGATED" | "RESEARCH_REQUIRED";
};

export type CropPhenologyResolutionInput = {
  cropCode: string;
  countryCode: string;
  stateCode: string | null;
  municipalityCode?: string | null;
  technicalRegionCodes?: string[];
  cultivarCycleGroup?: string | null;
  cumulativeGdd?: number | null;
  daysAfterSowing?: number | null;
  photoperiodHours?: number | null;
  rules: CropPhenologyRule[];
};

export type CropPhenologyResolution = {
  status: "READY" | "AMBIGUOUS_STAGE" | "NO_APPLICABLE_RULE" | "INSUFFICIENT_INPUT";
  cropCode: string;
  stage: CropPhenologicalStage | null;
  matchedRuleIds: string[];
  candidateStages: CropPhenologicalStage[];
  missingInputs: Array<"CUMULATIVE_GDD" | "DAYS_AFTER_SOWING" | "PHOTOPERIOD_HOURS">;
  warnings: string[];
};

function normalized(value: string) {
  return value.trim().toUpperCase();
}

function regionMatches(
  rule: CropPhenologyRule,
  input: Pick<CropPhenologyResolutionInput, "countryCode" | "stateCode" | "municipalityCode" | "technicalRegionCodes">,
) {
  if (normalized(rule.region.countryCode) !== normalized(input.countryCode)) return false;
  if (rule.region.technicalRegionCodes?.length) {
    const requested = new Set((input.technicalRegionCodes ?? []).map(normalized));
    return rule.region.technicalRegionCodes.map(normalized).some((code) => requested.has(code));
  }
  if (rule.region.municipalityCodes?.length) {
    if (!input.municipalityCode) return false;
    return rule.region.municipalityCodes.map(normalized).includes(normalized(input.municipalityCode));
  }
  if (rule.region.stateCodes?.length) {
    if (!input.stateCode) return false;
    return rule.region.stateCodes.map(normalized).includes(normalized(input.stateCode));
  }
  return true;
}

function within(value: number, range: { min?: number; max?: number }) {
  if (range.min != null && value < range.min) return false;
  if (range.max != null && value > range.max) return false;
  return true;
}

/**
 * Resolve o estádio provável usando apenas regras homologadas da própria cultura.
 *
 * O motor não possui tabela universal de fenologia. Milho pode usar soma térmica;
 * soja pode combinar temperatura/fotoperíodo/grupo de maturidade; HF e frutíferas
 * podem usar dias, frio ou outros perfis próprios. Quando dados/rules não fecham,
 * retorna bloqueio em vez de deslocar a janela fenológica por analogia.
 */
export function resolveCropPhenology(
  input: CropPhenologyResolutionInput,
): CropPhenologyResolution {
  const cropCode = normalized(input.cropCode);
  if (!cropCode) throw new Error("Código da cultura é obrigatório.");
  if (input.cumulativeGdd != null && (!Number.isFinite(input.cumulativeGdd) || input.cumulativeGdd < 0)) {
    throw new Error("Graus-dia acumulados devem ser nulos ou maiores/iguais a zero.");
  }
  if (input.daysAfterSowing != null && (!Number.isFinite(input.daysAfterSowing) || input.daysAfterSowing < 0)) {
    throw new Error("Dias após semeadura devem ser nulos ou maiores/iguais a zero.");
  }
  if (input.photoperiodHours != null && (!Number.isFinite(input.photoperiodHours) || input.photoperiodHours < 0 || input.photoperiodHours > 24)) {
    throw new Error("Fotoperíodo deve ficar entre 0 e 24 horas.");
  }

  const cycle = input.cultivarCycleGroup?.trim().toUpperCase() || null;
  const candidates = input.rules.filter((rule) =>
    rule.status === "HOMOLOGATED"
    && normalized(rule.cropCode) === cropCode
    && regionMatches(rule, input)
    && (
      !rule.cultivarCycleGroups?.length
      || (cycle != null && rule.cultivarCycleGroups.map(normalized).includes(cycle))
    )
  );

  if (!candidates.length) {
    return {
      status: "NO_APPLICABLE_RULE",
      cropCode,
      stage: null,
      matchedRuleIds: [],
      candidateStages: [],
      missingInputs: [],
      warnings: ["CROP_REGION_PHENOLOGY_RULE_REQUIRED"],
    };
  }

  const missing = new Set<CropPhenologyResolution["missingInputs"][number]>();
  const matched: CropPhenologyRule[] = [];

  for (const rule of candidates) {
    let canEvaluate = true;
    let matches = true;

    if (rule.cumulativeGdd) {
      if (input.cumulativeGdd == null) {
        missing.add("CUMULATIVE_GDD");
        canEvaluate = false;
      } else if (!within(input.cumulativeGdd, rule.cumulativeGdd)) {
        matches = false;
      }
    }

    if (rule.daysAfterSowing) {
      if (input.daysAfterSowing == null) {
        missing.add("DAYS_AFTER_SOWING");
        canEvaluate = false;
      } else if (!within(input.daysAfterSowing, rule.daysAfterSowing)) {
        matches = false;
      }
    }

    if (rule.photoperiodHours) {
      if (input.photoperiodHours == null) {
        missing.add("PHOTOPERIOD_HOURS");
        canEvaluate = false;
      } else if (!within(input.photoperiodHours, rule.photoperiodHours)) {
        matches = false;
      }
    }

    if (canEvaluate && matches) matched.push(rule);
  }

  const stages = [...new Set(matched.map((rule) => rule.stage))];

  if (stages.length === 1) {
    return {
      status: "READY",
      cropCode,
      stage: stages[0],
      matchedRuleIds: matched.map((rule) => rule.id),
      candidateStages: stages,
      missingInputs: [...missing],
      warnings: [],
    };
  }

  if (stages.length > 1) {
    return {
      status: "AMBIGUOUS_STAGE",
      cropCode,
      stage: null,
      matchedRuleIds: matched.map((rule) => rule.id),
      candidateStages: stages,
      missingInputs: [...missing],
      warnings: ["MULTIPLE_PHENOLOGICAL_STAGES_MATCH"],
    };
  }

  return {
    status: missing.size ? "INSUFFICIENT_INPUT" : "NO_APPLICABLE_RULE",
    cropCode,
    stage: null,
    matchedRuleIds: [],
    candidateStages: [],
    missingInputs: [...missing],
    warnings: missing.size
      ? ["PHENOLOGY_INPUT_REQUIRED"]
      : ["NO_PHENOLOGY_RULE_MATCHED_CURRENT_ACCUMULATION"],
  };
}
