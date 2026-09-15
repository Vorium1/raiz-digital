import {
  MILHO_DOSE_TABLE,
  TRIGO_DOSE_TABLE,
  computeGrainFertilizerDose,
  type GrainDoseTable,
  type Nutrient,
  type SoilNutrientLevel,
} from "./fertilizer-dose-engine.ts";
import {
  SOJA_RS_SC_2025_DOSE_TABLE,
  SOYBEAN_PK_RS_SC_2025_RULE_ID,
} from "./soybean-pk-rs-sc-2025.ts";
import { computeParameterPredominance } from "./parameter-predominance.ts";
import { evaluatePkDoseReadiness } from "./recommendation-context.ts";
import { evaluateAgronomicRuleAutomation } from "./agronomic-rule-catalog.ts";

export type UniformPkTarget = "P2O5" | "K2O";

type InterpretationItem = {
  sampleCode?: unknown;
  parameterCode?: unknown;
  interpretable?: unknown;
  classification?: unknown;
  classificationRole?: unknown;
};

export type UniformPkNutrientReadiness = {
  nutrient: UniformPkTarget;
  ready: boolean;
  soilLevel: SoilNutrientLevel | null;
  matchingCount: number;
  totalCount: number;
  basis: "SINGLE_SAMPLE" | "STRICT_PREDOMINANCE" | null;
  blockers: string[];
};

export type UniformPkReadiness = {
  ready: boolean;
  cropCode: string | null;
  ruleId: string | null;
  ruleReady: boolean;
  blockers: string[];
  nutrients: Record<UniformPkTarget, UniformPkNutrientReadiness>;
};

const SOIL_LEVELS = new Set<SoilNutrientLevel>(["Muito Baixo", "Baixo", "Médio", "Alto", "Muito Alto"]);
const PK_RULE_ID_BY_CROP: Record<string, string> = {
  SOJA: SOYBEAN_PK_RS_SC_2025_RULE_ID,
  MILHO: "PK-MILHO-CQFS-2016",
  TRIGO: "PK-TRIGO-CQFS-2016",
};
const DOSE_TABLE_BY_CROP: Record<string, GrainDoseTable> = {
  SOJA: SOJA_RS_SC_2025_DOSE_TABLE,
  MILHO: MILHO_DOSE_TABLE,
  TRIGO: TRIGO_DOSE_TABLE,
};

function normalizeCropCode(value: string | null | undefined) {
  if (!value?.trim()) return null;
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function soilLevel(value: unknown): SoilNutrientLevel | null {
  return typeof value === "string" && SOIL_LEVELS.has(value as SoilNutrientLevel)
    ? value as SoilNutrientLevel
    : null;
}

function interpretableItems(value: unknown): InterpretationItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is InterpretationItem => Boolean(item) && typeof item === "object");
}

function nutrientReadiness(
  interpretation: InterpretationItem[],
  nutrient: UniformPkTarget,
): UniformPkNutrientReadiness {
  const parameterCode = nutrient === "P2O5" ? "P" : "K";
  const label = nutrient === "P2O5" ? "P" : "K";
  const blockers: string[] = [];
  const perSample = new Map<string, Set<string>>();

  for (const item of interpretation) {
    if (item.interpretable !== true || item.classificationRole === "AUXILIARY") continue;
    if (typeof item.parameterCode !== "string" || item.parameterCode.trim().toUpperCase() !== parameterCode) continue;
    if (typeof item.sampleCode !== "string" || !item.sampleCode.trim() || typeof item.classification !== "string") continue;
    const set = perSample.get(item.sampleCode) ?? new Set<string>();
    set.add(item.classification);
    perSample.set(item.sampleCode, set);
  }

  const observations: Array<{ sampleCode: string; parameterCode: string; interpretable: true; classification: string }> = [];
  for (const [sampleCode, classes] of perSample) {
    if (classes.size !== 1) {
      blockers.push(`${label}_SAMPLE_CLASSIFICATION_AMBIGUOUS`);
      continue;
    }
    observations.push({ sampleCode, parameterCode, interpretable: true, classification: [...classes][0] });
  }

  if (observations.length === 0) {
    blockers.push(`${label}_NO_CLASSIFIED_OBSERVATION`);
    return { nutrient, ready: false, soilLevel: null, matchingCount: 0, totalCount: 0, basis: null, blockers };
  }

  if (observations.length === 1) {
    const level = soilLevel(observations[0].classification);
    if (!level) blockers.push(`${label}_CLASSIFICATION_UNSUPPORTED_FOR_DOSE`);
    return {
      nutrient,
      ready: blockers.length === 0,
      soilLevel: level,
      matchingCount: level ? 1 : 0,
      totalCount: 1,
      basis: level ? "SINGLE_SAMPLE" : null,
      blockers,
    };
  }

  const predominance = computeParameterPredominance(observations)
    .find((item) => item.parameterCode.toUpperCase() === parameterCode);
  if (!predominance) {
    blockers.push(`${label}_NO_STRICT_PREDOMINANCE`);
    return { nutrient, ready: false, soilLevel: null, matchingCount: 0, totalCount: observations.length, basis: null, blockers };
  }

  const level = soilLevel(predominance.classification);
  if (!level) blockers.push(`${label}_CLASSIFICATION_UNSUPPORTED_FOR_DOSE`);
  return {
    nutrient,
    ready: blockers.length === 0,
    soilLevel: level,
    matchingCount: predominance.matchingCount,
    totalCount: predominance.totalCount,
    basis: level ? "STRICT_PREDOMINANCE" : null,
    blockers,
  };
}

/**
 * Gate de dose UNIFORME de P/K. A liberação da regra vem exclusivamente do catálogo agronômico central;
 * alterar a regra para revisão/insuficiência nesse catálogo derruba automaticamente a execução aqui.
 */
export function evaluateUniformPkReadiness(input: {
  cropCode: string | null | undefined;
  interpretation: unknown;
}): UniformPkReadiness {
  const cropCode = normalizeCropCode(input.cropCode);
  const ruleId = cropCode ? (PK_RULE_ID_BY_CROP[cropCode] ?? null) : null;
  const ruleDecision = ruleId ? evaluateAgronomicRuleAutomation(ruleId) : null;
  const ruleReady = ruleDecision?.allowed === true && Boolean(DOSE_TABLE_BY_CROP[cropCode ?? ""]);
  const interpretation = interpretableItems(input.interpretation);
  const p = nutrientReadiness(interpretation, "P2O5");
  const k = nutrientReadiness(interpretation, "K2O");
  const blockers: string[] = [];

  if (!cropCode) blockers.push("PK_CROP_CODE_MISSING");
  else if (!ruleId) blockers.push("PK_CROP_RULE_NOT_IMPLEMENTED");
  else if (!ruleReady) blockers.push(`PK_RULE_NOT_READY:${ruleId}`);
  blockers.push(...p.blockers, ...k.blockers);

  return {
    ready: ruleReady && p.ready && k.ready,
    cropCode,
    ruleId,
    ruleReady,
    blockers,
    nutrients: { P2O5: p, K2O: k },
  };
}

function isKgPerHa(unit: string) {
  const normalized = unit
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/⁻/g, "-")
    .replace(/¹/g, "1")
    .replace(/[·.]/g, "")
    .replace(/\s+/g, "");
  return new Set(["kg/ha", "kgha-1", "kgha1"]).has(normalized);
}

export type DeterministicPkDoseDecision = {
  ready: boolean;
  blockers: string[];
  expected: null | {
    ruleId: string;
    nutrient: UniformPkTarget;
    soilLevel: SoilNutrientLevel;
    doseKgPerHa: number;
    minimumKgPerHa: number;
    maximumKgPerHa: number;
    isDiscretionaryRange: boolean;
    source: string;
  };
};

/** Calcula o alvo P/K somente depois de todos os gates de contexto, fonte e representatividade. */
export function computeDeterministicPkDose(input: {
  cropCode: string | null | undefined;
  interpretation: unknown;
  yieldGoal: number | null | undefined;
  yieldGoalUnit: string | null | undefined;
  cultivationOrderAfterSoilAnalysis: number | null | undefined;
  nutrient: UniformPkTarget;
}): DeterministicPkDoseDecision {
  const blockers: string[] = [];
  const context = evaluatePkDoseReadiness({
    yieldGoal: input.yieldGoal,
    yieldGoalUnit: input.yieldGoalUnit,
    cultivationOrderAfterSoilAnalysis: input.cultivationOrderAfterSoilAnalysis,
  });
  if (!context.ready) blockers.push(...context.blockers.map((code) => `PK_CONTEXT:${code}`));

  const uniform = evaluateUniformPkReadiness({ cropCode: input.cropCode, interpretation: input.interpretation });
  const nutrientState = uniform.nutrients[input.nutrient];
  if (!uniform.ruleReady) blockers.push(...uniform.blockers.filter((code) => code.startsWith("PK_")));
  if (!nutrientState.ready) blockers.push(...nutrientState.blockers);

  const cropCode = uniform.cropCode;
  const table = cropCode ? DOSE_TABLE_BY_CROP[cropCode] : null;
  const level = nutrientState.soilLevel;
  const cultivationYear = context.normalized.cultivationYear;
  const yieldGoalTonPerHa = context.normalized.yieldGoalTonPerHa;
  if (!table) blockers.push("PK_DETERMINISTIC_TABLE_NOT_IMPLEMENTED");

  if (blockers.length || !uniform.ruleId || !table || !level || !cultivationYear || yieldGoalTonPerHa == null) {
    return { ready: false, blockers: [...new Set(blockers)], expected: null };
  }

  const result = computeGrainFertilizerDose(table, input.nutrient as Nutrient, level, cultivationYear, yieldGoalTonPerHa);
  const minimumKgPerHa = result.isDiscretionaryRange ? result.yieldAdjustmentKgPerHa : result.doseKgPerHa;
  const maximumKgPerHa = result.isDiscretionaryRange
    ? (result.discretionaryRangeMax ?? result.doseKgPerHa)
    : result.doseKgPerHa;

  return {
    ready: true,
    blockers: [],
    expected: {
      ruleId: uniform.ruleId,
      nutrient: input.nutrient,
      soilLevel: level,
      doseKgPerHa: result.doseKgPerHa,
      minimumKgPerHa,
      maximumKgPerHa,
      isDiscretionaryRange: result.isDiscretionaryRange,
      source: result.source,
    },
  };
}

export type DeterministicPkRecommendationValidation = {
  allowed: boolean;
  blockers: string[];
  expected: DeterministicPkDoseDecision["expected"];
};

export function validateDeterministicPkRecommendation(input: {
  cropCode: string | null | undefined;
  interpretation: unknown;
  yieldGoal: number | null | undefined;
  yieldGoalUnit: string | null | undefined;
  cultivationOrderAfterSoilAnalysis: number | null | undefined;
  nutrient: UniformPkTarget;
  quantity: number;
  unit: string;
}): DeterministicPkRecommendationValidation {
  const dose = computeDeterministicPkDose(input);
  const blockers = [...dose.blockers];
  if (!Number.isFinite(input.quantity) || input.quantity < 0) blockers.push("PK_QUANTITY_INVALID");
  if (!isKgPerHa(input.unit)) blockers.push("PK_UNIT_MUST_BE_KG_PER_HA");

  if (blockers.length || !dose.expected) {
    return { allowed: false, blockers: [...new Set(blockers)], expected: dose.expected };
  }

  const tolerance = 0.11;
  const quantityMatches = input.quantity >= dose.expected.minimumKgPerHa - tolerance
    && input.quantity <= dose.expected.maximumKgPerHa + tolerance;
  if (!quantityMatches) blockers.push("PK_QUANTITY_DOES_NOT_MATCH_DETERMINISTIC_ENGINE");

  return { allowed: blockers.length === 0, blockers, expected: dose.expected };
}
