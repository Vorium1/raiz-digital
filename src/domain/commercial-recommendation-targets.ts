import type { CommercialNutrient, NutrientTargets } from "./commercial-input-engine.ts";

export type RecommendationTargetRow = {
  recommendationId?: string | null;
  inputType: string;
  recommendedQuantity: number;
  recommendedUnit: string;
  calculationSource?: string | null;
  recommendedAt?: string | null;
  sourceGenerationId?: string | null;
  recommendationCurrent: boolean;
  recommendationCurrentCode?: string | null;
  recommendationCurrentReason?: string | null;
};

export type CommercialTargetBlockerCode =
  | "STALE_RECOMMENDATION"
  | "UNSUPPORTED_INPUT_TYPE"
  | "UNSUPPORTED_UNIT"
  | "AMBIGUOUS_TARGET";

export type CommercialTargetBlocker = {
  code: CommercialTargetBlockerCode;
  inputType: string;
  reason: string;
};

export type CommercialTargetSourceRow = {
  recommendationId: string | null;
  inputType: string;
  canonicalTarget: CommercialNutrient | "LIME_PRNT100";
  quantity: number;
  unit: string;
  calculationSource: string | null;
  recommendedAt: string | null;
  sourceGenerationId: string | null;
  freshnessCode: string | null;
};

export type CommercialTargetState = {
  nutrientTargetsKgPerHa: NutrientTargets;
  limingRequirementTonPerHaPrnt100: number | null;
  blockers: CommercialTargetBlocker[];
  sourceRows: CommercialTargetSourceRow[];
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[₂]/g, "2")
    .replace(/[₅]/g, "5")
    .replace(/[₀]/g, "0")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

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

function isKgPerHa(unit: string) {
  return new Set(["kg/ha", "kgha-1", "kgha1"]).has(normalizeUnit(unit));
}

function isTonPerHa(unit: string) {
  return new Set(["t/ha", "tha-1", "tha1", "ton/ha", "tonelada/ha", "toneladas/ha"]).has(normalizeUnit(unit));
}

export function canonicalCommercialTarget(inputType: string): CommercialNutrient | "LIME_PRNT100" | null {
  const code = normalizeText(inputType);

  if ((code.includes("CALCAR") || code.includes("LIME")) && code.includes("PRNT") && code.includes("100")) {
    return "LIME_PRNT100";
  }

  const aliases: Record<string, CommercialNutrient> = {
    N: "N",
    NITROGENIO: "N",
    NITROGEN: "N",
    P2O5: "P2O5",
    P205: "P2O5",
    FOSFORO_P2O5: "P2O5",
    FOSFORO_P205: "P2O5",
    PHOSPHORUS_P2O5: "P2O5",
    K2O: "K2O",
    K20: "K2O",
    POTASSIO_K2O: "K2O",
    POTASSIO_K20: "K2O",
    POTASSIUM_K2O: "K2O",
    S: "S",
    ENXOFRE: "S",
    SULFUR: "S",
    S_SO4: "S",
    CA: "Ca",
    CALCIO: "Ca",
    CALCIUM: "Ca",
    MG: "Mg",
    MAGNESIO: "Mg",
    MAGNESIUM: "Mg",
  };
  return aliases[code] ?? null;
}

function sameNumber(a: number, b: number) {
  return Math.abs(a - b) <= 1e-6;
}

function sourceRow(row: RecommendationTargetRow, canonicalTarget: CommercialNutrient | "LIME_PRNT100"): CommercialTargetSourceRow {
  return {
    recommendationId: row.recommendationId ?? null,
    inputType: row.inputType,
    canonicalTarget,
    quantity: row.recommendedQuantity,
    unit: row.recommendedUnit,
    calculationSource: row.calculationSource ?? null,
    recommendedAt: row.recommendedAt ?? null,
    sourceGenerationId: row.sourceGenerationId ?? null,
    freshnessCode: row.recommendationCurrentCode ?? null,
  };
}

/**
 * Traduz SOMENTE recomendações oficiais correntes em alvos físicos consumíveis pela camada comercial.
 *
 * Não converte unidade, não interpreta nome comercial como nutriente e não usa recomendação stale.
 * Quando duas linhas diferentes mapeiam para o mesmo alvo com valores divergentes, o alvo é removido
 * e marcado como ambíguo em vez de escolher uma delas silenciosamente.
 */
export function deriveCommercialTargets(rows: RecommendationTargetRow[]): CommercialTargetState {
  const blockers: CommercialTargetBlocker[] = [];
  const sourceRows: CommercialTargetSourceRow[] = [];
  const nutrientTargetsKgPerHa: NutrientTargets = {};
  let limingRequirementTonPerHaPrnt100: number | null = null;
  const ambiguous = new Set<CommercialNutrient | "LIME_PRNT100">();

  for (const row of rows) {
    if (!Number.isFinite(row.recommendedQuantity) || row.recommendedQuantity < 0) {
      blockers.push({ code: "UNSUPPORTED_UNIT", inputType: row.inputType, reason: "A recomendação não possui quantidade física válida para simulação comercial." });
      continue;
    }
    if (!row.recommendationCurrent) {
      blockers.push({
        code: "STALE_RECOMMENDATION",
        inputType: row.inputType,
        reason: row.recommendationCurrentReason ?? "Recomendação histórica não pode alimentar uma simulação comercial corrente.",
      });
      continue;
    }

    const target = canonicalCommercialTarget(row.inputType);
    if (!target) {
      blockers.push({ code: "UNSUPPORTED_INPUT_TYPE", inputType: row.inputType, reason: "O tipo de recomendação não identifica de forma inequívoca um nutriente ou necessidade PRNT100." });
      continue;
    }

    if (target === "LIME_PRNT100") {
      if (!isTonPerHa(row.recommendedUnit)) {
        blockers.push({ code: "UNSUPPORTED_UNIT", inputType: row.inputType, reason: "Necessidade de calcário PRNT100 precisa estar explicitamente em t/ha; a RAIZ não converte unidade por suposição." });
        continue;
      }
      if (limingRequirementTonPerHaPrnt100 != null && !sameNumber(limingRequirementTonPerHaPrnt100, row.recommendedQuantity)) {
        ambiguous.add(target);
        blockers.push({ code: "AMBIGUOUS_TARGET", inputType: row.inputType, reason: "Existem recomendações correntes divergentes para calcário PRNT100; nenhuma delas foi escolhida automaticamente." });
      } else {
        limingRequirementTonPerHaPrnt100 = row.recommendedQuantity;
        sourceRows.push(sourceRow(row, target));
      }
      continue;
    }

    if (!isKgPerHa(row.recommendedUnit)) {
      blockers.push({ code: "UNSUPPORTED_UNIT", inputType: row.inputType, reason: `${target} precisa estar explicitamente em kg/ha para a camada comercial; a RAIZ não converte unidade por suposição.` });
      continue;
    }

    const existing = nutrientTargetsKgPerHa[target];
    if (existing != null && !sameNumber(existing, row.recommendedQuantity)) {
      ambiguous.add(target);
      blockers.push({ code: "AMBIGUOUS_TARGET", inputType: row.inputType, reason: `Existem recomendações correntes divergentes para ${target}; nenhuma delas foi escolhida automaticamente.` });
    } else {
      nutrientTargetsKgPerHa[target] = row.recommendedQuantity;
      sourceRows.push(sourceRow(row, target));
    }
  }

  for (const target of ambiguous) {
    if (target === "LIME_PRNT100") limingRequirementTonPerHaPrnt100 = null;
    else delete nutrientTargetsKgPerHa[target];
  }

  // Uma evidência ambígua não pode continuar aparecendo na UI como se fosse um alvo utilizável.
  // Mantemos o blocker como explicação, mas removemos todas as linhas daquele alvo do pacote comercial.
  const usableSourceRows = sourceRows.filter((row) => !ambiguous.has(row.canonicalTarget));

  return { nutrientTargetsKgPerHa, limingRequirementTonPerHaPrnt100, blockers, sourceRows: usableSourceRows };
}
