export type SulfurDoseDecision = {
  ruleId: "S-TRIGO-EMBRAPA-2026" | "S-CANOLA-CQFS-2016" | "S-ARROZ-SOSBAI-2025";
  ruleVersion: "1.0.0" | "1.1.0";
  sourceSnapshotId: "RAIZ-WORK-RESEARCH-2026-09-14" | "RAIZ-WORK-GEMINI-CROSSCHECK-2026-09-14";
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

export const RICE_S_SOSBAI_2025_PROFILE = "SOSBAI_2025_ARROZ_IRRIGADO" as const;

/**
 * SOSBAI 2025, p.49: em solo com S <10 mg/dm3 medido com extrator fosfato de cálcio
 * 500 mg/L, a resposta observada limita-se à faixa de 20–30 kg S/ha.
 *
 * A função mantém a faixa como faixa; não escolhe 20, 25 ou 30 kg/ha por conta própria.
 * Produtos comerciais citados pela fonte não são selecionados automaticamente aqui.
 */
export function computeRiceSulfurRecommendation(input: {
  profileId: string;
  sulfurMgDm3: number;
  extractionMethod: "CALCIUM_PHOSPHATE_500_MG_L" | "OTHER" | "UNKNOWN";
  unit: "mg/dm3" | string;
}): SulfurDoseDecision {
  validateSulfur(input.sulfurMgDm3);

  if (input.profileId !== RICE_S_SOSBAI_2025_PROFILE) {
    return {
      ruleId: "S-ARROZ-SOSBAI-2025",
      ruleVersion: "1.1.0",
      sourceSnapshotId: "RAIZ-WORK-GEMINI-CROSSCHECK-2026-09-14",
      status: "REQUIRES_AGRONOMIST_REVIEW",
      needed: null,
      dose: { kind: "BLOCKED", reason: "Perfil incompatível com a recomendação de S da SOSBAI 2025 para arroz irrigado." },
      blockers: ["RICE_PROFILE_NOT_VALIDATED"],
      source: "SOSBAI 2025 p.49 — Adubação sulfatada",
    };
  }

  if (input.extractionMethod !== "CALCIUM_PHOSPHATE_500_MG_L") {
    return {
      ruleId: "S-ARROZ-SOSBAI-2025",
      ruleVersion: "1.1.0",
      sourceSnapshotId: "RAIZ-WORK-GEMINI-CROSSCHECK-2026-09-14",
      status: "REQUIRES_AGRONOMIST_REVIEW",
      needed: null,
      dose: { kind: "BLOCKED", reason: "A SOSBAI 2025 define o limiar com extrator fosfato de cálcio 500 mg/L; não converter outro método por analogia." },
      blockers: ["ANALYTICAL_METHOD_NOT_VALIDATED"],
      source: "SOSBAI 2025 p.49 — Adubação sulfatada",
    };
  }

  if (input.unit !== "mg/dm3") {
    return {
      ruleId: "S-ARROZ-SOSBAI-2025",
      ruleVersion: "1.1.0",
      sourceSnapshotId: "RAIZ-WORK-GEMINI-CROSSCHECK-2026-09-14",
      status: "REQUIRES_AGRONOMIST_REVIEW",
      needed: null,
      dose: { kind: "BLOCKED", reason: "Unidade incompatível; o limiar da fonte está em mg/dm3." },
      blockers: ["ANALYTICAL_UNIT_NOT_VALIDATED"],
      source: "SOSBAI 2025 p.49 — Adubação sulfatada",
    };
  }

  const needed = input.sulfurMgDm3 < 10;
  return {
    ruleId: "S-ARROZ-SOSBAI-2025",
    ruleVersion: "1.1.0",
    sourceSnapshotId: "RAIZ-WORK-GEMINI-CROSSCHECK-2026-09-14",
    status: "READY_FOR_IMPLEMENTATION",
    needed,
    dose: needed
      ? { kind: "RANGE", minKgSPerHa: 20, maxKgSPerHa: 30 }
      : { kind: "EXACT", kgSPerHa: 0 },
    blockers: [],
    source: "SOSBAI 2025 p.49 — S <10 mg/dm3 por fosfato de cálcio 500 mg/L; resposta limitada a 20–30 kg S/ha",
  };
}
