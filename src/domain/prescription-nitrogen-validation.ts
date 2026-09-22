import { canonicalCommercialTarget } from "./commercial-recommendation-targets.ts";
import type { NitrogenExecutionEvidence } from "./nitrogen-prescription-evidence.ts";

export type NitrogenRecommendationCandidate = {
  inputType?: unknown;
  quantity?: unknown;
  unit?: unknown;
};

export type PrescriptionNitrogenValidation = {
  allowed: boolean;
  blockers: string[];
  expectedKgNPerHa: number | null;
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

function isKgPerHa(value: string) {
  return new Set(["kg/ha", "kgha-1", "kgha1"]).has(normalizeUnit(value));
}

/**
 * Firewall server-side para N.
 *
 * A prescrição só pode transportar uma dose de N quando existe execução
 * determinística CURRENT, READY e com dose EXATA. Faixas, execuções stale,
 * decisões em revisão e objetivos de qualidade do trigo nunca viram um número
 * automático pela IA.
 */
export function validatePrescriptionNitrogenRecommendation(input: {
  recommendations: NitrogenRecommendationCandidate[];
  deterministicEvidence: NitrogenExecutionEvidence | null | undefined;
}): PrescriptionNitrogenValidation {
  const nitrogenRows = input.recommendations
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      typeof row.inputType === "string"
      && canonicalCommercialTarget(row.inputType) === "N",
    );

  const evidence = input.deterministicEvidence;
  const expectedKgNPerHa =
    evidence?.status === "CURRENT"
    && evidence.executionStatus === "READY_FOR_IMPLEMENTATION"
    && evidence.recommendation.dose.kind === "EXACT"
    && evidence.recommendation.dose.kgNPerHa > 0
      ? evidence.recommendation.dose.kgNPerHa
      : null;

  const blockers: string[] = [];
  if (nitrogenRows.length > 1) blockers.push("N_DUPLICATE_TARGET");

  if (expectedKgNPerHa != null && nitrogenRows.length === 0) {
    blockers.push("N_EXPECTED_RECOMMENDATION_MISSING");
  }

  for (const { row } of nitrogenRows) {
    if (expectedKgNPerHa == null) {
      blockers.push(
        evidence?.status === "STALE"
          ? "N_EXECUTION_STALE"
          : evidence?.status === "INVALID"
            ? "N_EXECUTION_INVALID"
            : evidence?.status === "CURRENT"
              ? "N_DETERMINISTIC_DOSE_NOT_EXACT_READY"
              : "N_DETERMINISTIC_EXECUTION_NOT_AVAILABLE",
      );
      continue;
    }

    if (typeof row.quantity !== "number" || !Number.isFinite(row.quantity) || row.quantity <= 0) {
      blockers.push("N_QUANTITY_INVALID");
      continue;
    }
    if (typeof row.unit !== "string" || !isKgPerHa(row.unit)) {
      blockers.push("N_UNIT_MUST_BE_KG_PER_HA");
      continue;
    }
    if (Math.abs(row.quantity - expectedKgNPerHa) > 0.11) {
      blockers.push("N_QUANTITY_DOES_NOT_MATCH_DETERMINISTIC_ENGINE");
    }
  }

  return {
    allowed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    expectedKgNPerHa,
  };
}
