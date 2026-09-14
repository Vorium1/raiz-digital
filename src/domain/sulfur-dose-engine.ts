export type SulfurDoseDecision = {
  ruleId: "S-TRIGO-EMBRAPA-2026" | "S-CANOLA-CQFS-2016";
  ruleVersion: "1.0.0";
  sourceSnapshotId: "RAIZ-WORK-RESEARCH-2026-09-14";
  status: "READY_FOR_IMPLEMENTATION" | "REQUIRES_AGRONOMIST_REVIEW";
  needed: boolean | null;
  dose: { kind: "EXACT"; kgSPerHa: number } | { kind: "RANGE"; minKgSPerHa: number; maxKgSPerHa: number } | { kind: "BLOCKED"; reason: string };
  blockers: string[];
  source: string;
};

function validateSulfur(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error("Teor de enxofre deve ser finito e maior ou igual a zero.");
}

/**
 * A pesquisa Work foi explícita: limiar de S só pode ser aplicado quando o método de extração
 * é compatível com a fonte. `methodValidated=false` falha fechado em vez de assumir equivalência.
 */
export function computeWheatSulfurRecommendation(input: {
  sulfurMgDm3: number;
  methodValidated: boolean;
}): SulfurDoseDecision {
  validateSulfur(input.sulfurMgDm3);
  if (!input.methodValidated) {
    return {
      ruleId: "S-TRIGO-EMBRAPA-2026",
      ruleVersion: "1.0.0",
      sourceSnapshotId: "RAIZ-WORK-RESEARCH-2026-09-14",
      status: "REQUIRES_AGRONOMIST_REVIEW",
      needed: null,
      dose: { kind: "BLOCKED", reason: "O método de extração não foi validado contra o limiar da fonte." },
      blockers: ["ANALYTICAL_METHOD_NOT_VALIDATED"],
      source: "Embrapa Trigo 2026 p.33",
    };
  }
  const needed = input.sulfurMgDm3 < 5;
  return {
    ruleId: "S-TRIGO-EMBRAPA-2026",
    ruleVersion: "1.0.0",
    sourceSnapshotId: "RAIZ-WORK-RESEARCH-2026-09-14",
    status: "READY_FOR_IMPLEMENTATION",
    needed,
    dose: needed ? { kind: "RANGE", minKgSPerHa: 20, maxKgSPerHa: 30 } : { kind: "EXACT", kgSPerHa: 0 },
    blockers: [],
    source: "Embrapa Trigo 2026 p.33",
  };
}

export function computeCanolaSulfurRecommendation(input: {
  sulfurMgDm3: number;
  methodValidated: boolean;
}): SulfurDoseDecision {
  validateSulfur(input.sulfurMgDm3);
  if (!input.methodValidated) {
    return {
      ruleId: "S-CANOLA-CQFS-2016",
      ruleVersion: "1.0.0",
      sourceSnapshotId: "RAIZ-WORK-RESEARCH-2026-09-14",
      status: "REQUIRES_AGRONOMIST_REVIEW",
      needed: null,
      dose: { kind: "BLOCKED", reason: "O método de extração não foi validado contra o limiar da fonte." },
      blockers: ["ANALYTICAL_METHOD_NOT_VALIDATED"],
      source: "Tomm et al. 2009 p.53; CQFS-RS/SC 2016",
    };
  }
  const needed = input.sulfurMgDm3 < 10;
  return {
    ruleId: "S-CANOLA-CQFS-2016",
    ruleVersion: "1.0.0",
    sourceSnapshotId: "RAIZ-WORK-RESEARCH-2026-09-14",
    status: "READY_FOR_IMPLEMENTATION",
    needed,
    dose: { kind: "EXACT", kgSPerHa: needed ? 20 : 0 },
    blockers: [],
    source: "Tomm et al. 2009 p.53; CQFS-RS/SC 2016",
  };
}
