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
 * A IA só pode transportar uma necessidade uniforme PRNT100 que o motor já tenha
 * calculado. Quando a decisão é espacial, bloqueada ou "não aplicar", nenhuma dose
 * única positiva pode ser criada pelo provedor.
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
  const expectedTonHaPrnt100 = decision?.status === "UNIFORM_APPLY"
    && decision.automaticUniformDoseAllowed
    && typeof decision.uniformDoseTonHaPrnt100 === "number"
    && decision.uniformDoseTonHaPrnt100 > 0
      ? decision.uniformDoseTonHaPrnt100
      : null;

  const blockers: string[] = [];

  if (limeRows.length > 1) blockers.push("LIME_DUPLICATE_TARGET");

  if (expectedTonHaPrnt100 != null && limeRows.length === 0) {
    blockers.push("LIME_EXPECTED_RECOMMENDATION_MISSING");
  }

  for (const { row } of limeRows) {
    if (expectedTonHaPrnt100 == null) {
      blockers.push(
        decision?.status === "SPATIAL"
          ? "LIME_UNIFORM_DOSE_FORBIDDEN_FOR_SPATIAL_DECISION"
          : decision?.status === "UNIFORM_NO_APPLY"
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
