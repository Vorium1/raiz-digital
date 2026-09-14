import { canonicalCommercialTarget } from "./commercial-recommendation-targets.ts";
import {
  validateDeterministicPkRecommendation,
  type DeterministicPkRecommendationValidation,
  type UniformPkTarget,
} from "./uniform-pk-readiness.ts";

export type PrescriptionRecommendationCandidate = {
  inputType?: unknown;
  quantity?: unknown;
  unit?: unknown;
};

export type ValidatedPrescriptionPkRecommendation = {
  index: number;
  inputType: string;
  nutrient: UniformPkTarget;
  validation: DeterministicPkRecommendationValidation;
};

export type PrescriptionPkValidationFailure = {
  index: number;
  inputType: string;
  nutrient: UniformPkTarget | null;
  blockers: string[];
  validation: DeterministicPkRecommendationValidation | null;
};

export type PrescriptionPkValidationResult = {
  allowed: boolean;
  validated: ValidatedPrescriptionPkRecommendation[];
  failures: PrescriptionPkValidationFailure[];
};

function normalizeInputType(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * P ou K elemental não pode ser convertido implicitamente para P2O5/K2O. A equivalência depende de uma
 * conversão química que precisa ser deliberada no dado/regra, não inferida da palavra usada pela IA.
 */
export function isAmbiguousElementalPkInput(inputType: string) {
  return new Set(["P", "K", "FOSFORO", "POTASSIO", "PHOSPHORUS", "POTASSIUM"])
    .has(normalizeInputType(inputType));
}

/**
 * Barreira única usada tanto ANTES de persistir a resposta do provedor quanto ANTES de promover uma
 * recomendação oficial. Ela garante que P/K nasce e termina ancorado no mesmo motor determinístico.
 */
export function validatePrescriptionPkRecommendations(input: {
  recommendations: PrescriptionRecommendationCandidate[];
  cropCode: string | null | undefined;
  interpretation: unknown;
  yieldGoal: number | null | undefined;
  yieldGoalUnit: string | null | undefined;
  cultivationOrderAfterSoilAnalysis: number | null | undefined;
}): PrescriptionPkValidationResult {
  const validated: ValidatedPrescriptionPkRecommendation[] = [];
  const failures: PrescriptionPkValidationFailure[] = [];
  const seen = new Set<UniformPkTarget>();

  for (let index = 0; index < input.recommendations.length; index += 1) {
    const recommendation = input.recommendations[index];
    if (typeof recommendation.inputType !== "string") continue;

    const canonical = canonicalCommercialTarget(recommendation.inputType);
    if (canonical !== "P2O5" && canonical !== "K2O") {
      if (isAmbiguousElementalPkInput(recommendation.inputType)) {
        failures.push({
          index,
          inputType: recommendation.inputType,
          nutrient: null,
          blockers: ["PK_ELEMENTAL_INPUT_AMBIGUOUS"],
          validation: null,
        });
      }
      continue;
    }

    const nutrient = canonical as UniformPkTarget;
    if (seen.has(nutrient)) {
      failures.push({
        index,
        inputType: recommendation.inputType,
        nutrient,
        blockers: ["PK_DUPLICATE_TARGET"],
        validation: null,
      });
      continue;
    }
    seen.add(nutrient);

    if (typeof recommendation.quantity !== "number" || typeof recommendation.unit !== "string") {
      failures.push({
        index,
        inputType: recommendation.inputType,
        nutrient,
        blockers: ["PK_QUANTITY_OR_UNIT_INVALID"],
        validation: null,
      });
      continue;
    }

    const validation = validateDeterministicPkRecommendation({
      cropCode: input.cropCode,
      interpretation: input.interpretation,
      yieldGoal: input.yieldGoal,
      yieldGoalUnit: input.yieldGoalUnit,
      cultivationOrderAfterSoilAnalysis: input.cultivationOrderAfterSoilAnalysis,
      nutrient,
      quantity: recommendation.quantity,
      unit: recommendation.unit,
    });

    if (!validation.allowed) {
      failures.push({
        index,
        inputType: recommendation.inputType,
        nutrient,
        blockers: [...validation.blockers],
        validation,
      });
      continue;
    }

    validated.push({ index, inputType: recommendation.inputType, nutrient, validation });
  }

  return { allowed: failures.length === 0, validated, failures };
}
