import { canonicalCommercialTarget } from "./commercial-recommendation-targets.ts";
import type { SoybeanSulfurUniformDecision } from "./sulfur-dose-engine.ts";

export type SulfurRecommendationCandidate = {
  inputType?: unknown;
  quantity?: unknown;
  unit?: unknown;
};

export type PrescriptionSulfurValidation = {
  allowed: boolean;
  blockers: string[];
  expectedKgSPerHa: number | null;
};

function isKgPerHa(value: string) {
  const normalized = value
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

/**
 * Gate server-side para enxofre.
 *
 * Um provedor de narrativa/IA não pode criar uma dose de S paralela ao motor determinístico.
 * Quando o motor determina uma dose positiva, a recomendação precisa estar presente e coincidir;
 * quando o motor bloqueia a dose, qualquer S proposto também é bloqueado.
 */
export function validatePrescriptionSulfurRecommendation(input: {
  recommendations: SulfurRecommendationCandidate[];
  deterministicDecision: SoybeanSulfurUniformDecision | null | undefined;
}): PrescriptionSulfurValidation {
  const sulfurRows = input.recommendations
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => typeof row.inputType === "string" && canonicalCommercialTarget(row.inputType) === "S");

  const decision = input.deterministicDecision;
  const expectedKgSPerHa = decision?.dose.kind === "EXACT" ? decision.dose.kgSPerHa : null;
  const blockers: string[] = [];

  if (sulfurRows.length > 1) blockers.push("S_DUPLICATE_TARGET");

  if (expectedKgSPerHa != null && expectedKgSPerHa > 0 && sulfurRows.length === 0) {
    blockers.push("S_EXPECTED_RECOMMENDATION_MISSING");
  }

  for (const { row } of sulfurRows) {
    if (!decision || decision.dose.kind !== "EXACT") {
      blockers.push("S_DETERMINISTIC_DOSE_NOT_READY");
      continue;
    }
    if (typeof row.quantity !== "number" || !Number.isFinite(row.quantity) || row.quantity < 0) {
      blockers.push("S_QUANTITY_INVALID");
      continue;
    }
    if (typeof row.unit !== "string" || !isKgPerHa(row.unit)) {
      blockers.push("S_UNIT_MUST_BE_KG_PER_HA");
      continue;
    }
    if (Math.abs(row.quantity - decision.dose.kgSPerHa) > 0.11) {
      blockers.push("S_QUANTITY_DOES_NOT_MATCH_DETERMINISTIC_ENGINE");
    }
  }

  return { allowed: blockers.length === 0, blockers: [...new Set(blockers)], expectedKgSPerHa };
}
