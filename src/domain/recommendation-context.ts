export type PkDoseReadinessBlocker =
  | "YIELD_GOAL_MISSING"
  | "YIELD_GOAL_INVALID"
  | "YIELD_UNIT_MISSING"
  | "YIELD_UNIT_UNSUPPORTED"
  | "POST_ANALYSIS_CULTIVATION_ORDER_MISSING"
  | "POST_ANALYSIS_CULTIVATION_ORDER_UNSUPPORTED";

export type PkDoseReadinessInput = {
  yieldGoal: number | null | undefined;
  yieldGoalUnit: string | null | undefined;
  cultivationOrderAfterSoilAnalysis: number | null | undefined;
};

export type PkDoseReadiness = {
  ready: boolean;
  blockers: PkDoseReadinessBlocker[];
  normalized: {
    yieldGoalTonPerHa: number | null;
    cultivationYear: "PRIMEIRO" | "SEGUNDO" | null;
  };
};

/**
 * O motor atual de P/K recebe produtividade em t/ha. Aceitamos somente grafias
 * que representam a MESMA unidade, sem fazer conversão de sacas, peso de grão
 * ou outra inferência dependente da cultura.
 */
function isTonPerHaUnit(unit: string): boolean {
  const normalized = unit
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/⁻/g, "-")
    .replace(/¹/g, "1");

  return new Set([
    "t/ha",
    "t.ha-1",
    "tha-1",
    "ton/ha",
    "tonelada/ha",
    "toneladas/ha",
  ]).has(normalized);
}

/**
 * Avalia somente se o contexto mínimo para o módulo determinístico de P/K
 * existente está completo. Não calcula dose e não usa nível tecnológico como
 * multiplicador. BAIXO/MEDIO/ALTO continua sendo metadado/cenário até existir
 * uma regra técnica homologada que associe isso quantitativamente à adubação.
 */
export function evaluatePkDoseReadiness(input: PkDoseReadinessInput): PkDoseReadiness {
  const blockers: PkDoseReadinessBlocker[] = [];

  let yieldGoalTonPerHa: number | null = null;
  if (input.yieldGoal == null) {
    blockers.push("YIELD_GOAL_MISSING");
  } else if (!Number.isFinite(input.yieldGoal) || input.yieldGoal <= 0) {
    blockers.push("YIELD_GOAL_INVALID");
  }

  if (input.yieldGoalUnit == null || !input.yieldGoalUnit.trim()) {
    blockers.push("YIELD_UNIT_MISSING");
  } else if (!isTonPerHaUnit(input.yieldGoalUnit)) {
    blockers.push("YIELD_UNIT_UNSUPPORTED");
  } else if (input.yieldGoal != null && Number.isFinite(input.yieldGoal) && input.yieldGoal > 0) {
    yieldGoalTonPerHa = input.yieldGoal;
  }

  let cultivationYear: "PRIMEIRO" | "SEGUNDO" | null = null;
  if (input.cultivationOrderAfterSoilAnalysis == null) {
    blockers.push("POST_ANALYSIS_CULTIVATION_ORDER_MISSING");
  } else if (input.cultivationOrderAfterSoilAnalysis === 1) {
    cultivationYear = "PRIMEIRO";
  } else if (input.cultivationOrderAfterSoilAnalysis === 2) {
    cultivationYear = "SEGUNDO";
  } else {
    blockers.push("POST_ANALYSIS_CULTIVATION_ORDER_UNSUPPORTED");
  }

  return {
    ready: blockers.length === 0,
    blockers,
    normalized: {
      yieldGoalTonPerHa,
      cultivationYear,
    },
  };
}
