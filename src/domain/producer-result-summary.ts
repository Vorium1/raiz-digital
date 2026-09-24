import { recommendationInputLabel } from "./recommendation-display.ts";

export type ProducerSummaryRecommendation = {
  inputType: string;
  quantity: number;
  unit: string;
};

export type ProducerSummaryRow = {
  inputType: string;
  label: string;
  doseQuantity: number;
  doseUnit: string;
  totalQuantity: number | null;
  totalUnit: "kg" | "t" | null;
  quantityKind: "NUTRIENT_EQUIVALENT" | "LIME_PRNT100_EQUIVALENT" | "OTHER";
};

export type ProducerResultSummary = {
  areaHa: number;
  rows: ProducerSummaryRow[];
  hasUniformRecommendations: boolean;
  showsNutrientEquivalentNote: boolean;
  showsLimeEquivalentNote: boolean;
  costFrozenInOfficialReport: false;
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

function quantityKind(inputType: string): ProducerSummaryRow["quantityKind"] {
  const code = normalizeText(inputType);
  if (new Set(["N", "NITROGENIO", "NITROGEN", "P2O5", "P205", "K2O", "K20", "S", "ENXOFRE", "SULFUR"]).has(code)) {
    return "NUTRIENT_EQUIVALENT";
  }
  if ((code.includes("CALCAR") || code.includes("LIME")) && code.includes("PRNT") && code.includes("100")) {
    return "LIME_PRNT100_EQUIVALENT";
  }
  return "OTHER";
}

function totalForArea(quantity: number, unit: string, areaHa: number) {
  if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(areaHa) || areaHa <= 0) return null;
  const normalized = normalizeUnit(unit);
  if (new Set(["kg/ha", "kgha-1", "kgha1"]).has(normalized)) {
    return { quantity: quantity * areaHa, unit: "kg" as const };
  }
  if (new Set(["t/ha", "tha-1", "tha1", "ton/ha", "tonelada/ha", "toneladas/ha"]).has(normalized)) {
    return { quantity: quantity * areaHa, unit: "t" as const };
  }
  return null;
}

/**
 * Monta apenas uma leitura operacional do que JÁ foi aprovado e congelado no laudo.
 * Não converte nutriente em produto comercial, não escolhe formulação e não estima custo.
 */
export function buildProducerResultSummary(input: {
  areaHa: number;
  recommendations: ProducerSummaryRecommendation[];
}): ProducerResultSummary {
  const safeAreaHa = Number.isFinite(input.areaHa) && input.areaHa > 0 ? input.areaHa : 0;

  const rows = input.recommendations
    .filter((item) =>
      typeof item.inputType === "string"
      && item.inputType.trim().length > 0
      && Number.isFinite(item.quantity)
      && item.quantity > 0
      && typeof item.unit === "string"
      && item.unit.trim().length > 0
    )
    .map((item) => {
      const total = totalForArea(item.quantity, item.unit, safeAreaHa);
      return {
        inputType: item.inputType,
        label: recommendationInputLabel(item.inputType),
        doseQuantity: item.quantity,
        doseUnit: item.unit.trim(),
        totalQuantity: total?.quantity ?? null,
        totalUnit: total?.unit ?? null,
        quantityKind: quantityKind(item.inputType),
      };
    });

  return {
    areaHa: safeAreaHa,
    rows,
    hasUniformRecommendations: rows.length > 0,
    showsNutrientEquivalentNote: rows.some((row) => row.quantityKind === "NUTRIENT_EQUIVALENT"),
    showsLimeEquivalentNote: rows.some((row) => row.quantityKind === "LIME_PRNT100_EQUIVALENT"),
    costFrozenInOfficialReport: false,
  };
}
