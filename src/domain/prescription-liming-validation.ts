import { canonicalCommercialTarget } from "./commercial-recommendation-targets.ts";
import type { SoybeanLimingUniformDecision } from "./soybean-liming-evidence.ts";

export type LimingRecommendationCandidate = {
  inputType?: unknown;
  quantity?: unknown;
  unit?: unknown;
};

export type PrescriptionLimingValidation = {
  allowed: boolean;
  blockers: string[];
  expectedTonHaPrnt100: number | null;
};

function normalizeUnit(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/⁻/g, "-")
    .replace(/¹/g, "1")
    .replace(/[·.]/g, "")
    .replace(/\s+/g, "");
}

function isTonPerHa(value: string) {
  return new Set(["t/ha", "tha-1", "tha1", "ton/ha", "tonelada/ha", "toneladas/ha"])
    .has(normalizeUnit(value));
}

/**
 * Firewall server-side para calagem.
 *
 * A IA só pode transportar a necessidade operacional PRNT100 que o motor já tenha
 * calculado. Ela pode ser uma dose realmente uniforme ou a média operacional dos
 * pontos quando todos representam peso igual do talhão. O provedor nunca calcula
 * essa média por conta própria.
 */
export function validatePrescriptionLimingRecommendation(input: {
  recommendations: LimingRecommendationCandidate[];
  deterministicDecision: SoybeanLimingUniformDecision | null | undefined;
}): PrescriptionLimingValidation {
  const limeRows = input.recommendations
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      typeof row.inputType === "string"
      && canonicalCommercialTarget(row.inputType) === "LIME_PRNT100",
    );

  const decision = input.deterministicDecision;
  const expectedTonHaPrnt100 = decision?.automaticGeneralDoseAllowed
    && typeof decision.operationalGeneralDoseTonHaPrnt100 === "number"
    && decision.operationalGeneralDoseTonHaPrnt100 > 0
      ? decision.operationalGeneralDoseTonHaPrnt100
      : null;

  const blockers: string[] = [];

  if (limeRows.length > 1) blockers.push("LIME_DUPLICATE_TARGET");

  if (expectedTonHaPrnt100 != null && limeRows.length === 0) {
    blockers.push("LIME_EXPECTED_RECOMMENDATION_MISSING");
  }

  for (const { row } of limeRows) {
    if (expectedTonHaPrnt100 == null) {
      blockers.push(
        decision?.status === "UNIFORM_NO_APPLY"
          ? "LIME_DOSE_FORBIDDEN_WHEN_NOT_INDICATED"
          : "LIME_DETERMINISTIC_DOSE_NOT_READY",
      );
      continue;
    }

    if (typeof row.quantity !== "number" || !Number.isFinite(row.quantity) || row.quantity <= 0) {
      blockers.push("LIME_QUANTITY_INVALID");
      continue;
    }

    if (typeof row.unit !== "string" || !isTonPerHa(row.unit)) {
      blockers.push("LIME_UNIT_MUST_BE_TON_PER_HA");
      continue;
    }

    if (Math.abs(row.quantity - expectedTonHaPrnt100) > 0.011) {
      blockers.push("LIME_QUANTITY_DOES_NOT_MATCH_DETERMINISTIC_ENGINE");
    }
  }

  return {
    allowed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    expectedTonHaPrnt100,
  };
}
