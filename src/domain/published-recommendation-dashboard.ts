import { recommendationInputLabel } from "./recommendation-display.ts";

export type PublishedRecommendation = {
  inputType: string;
  quantity: number;
  unit: string;
  rationale?: string;
};

export type RecommendationCategory = "CORRECTION" | "MACRO" | "MICRO" | "OTHER";

export type PublishedRecommendationRow = {
  inputType: string;
  label: string;
  category: RecommendationCategory;
  doseQuantity: number;
  doseUnit: string;
  totalQuantity: number | null;
  totalUnit: "kg" | "t" | null;
  rationale: string | null;
};

export type PublishedRecommendationGroup = {
  category: RecommendationCategory;
  label: string;
  hint: string;
  rows: PublishedRecommendationRow[];
};

const CATEGORY_META: Record<RecommendationCategory, { label: string; hint: string }> = {
  CORRECTION: {
    label: "Correção do solo",
    hint: "Corretivos aprovados para acidez, saturação ou condicionamento.",
  },
  MACRO: {
    label: "Adubação principal",
    hint: "Nitrogênio, fósforo, potássio e enxofre aprovados.",
  },
  MICRO: {
    label: "Micronutrientes",
    hint: "Micronutrientes liberados somente quando a evidência permite dose.",
  },
  OTHER: {
    label: "Outras recomendações",
    hint: "Demais entradas aprovadas e congeladas neste laudo.",
  },
};

function normalizeCode(value: string) {
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

function categoryFor(inputType: string): RecommendationCategory {
  const code = normalizeCode(inputType);
  if (code.includes("CALCAR") || code.includes("LIME") || code.includes("GESS") || code.includes("GYPS")) {
    return "CORRECTION";
  }
  if (new Set(["N", "NITROGENIO", "NITROGEN", "P2O5", "P205", "K2O", "K20", "S", "ENXOFRE", "SULFUR"]).has(code)) {
    return "MACRO";
  }
  if (
    new Set([
      "B", "BORO", "BORON",
      "ZN", "ZINCO", "ZINC",
      "CU", "COBRE", "COPPER",
      "MN", "MANGANES", "MANGANESE",
      "MO", "MOLIBDENIO", "MOLYBDENUM",
      "CO", "COBALTO", "COBALT",
    ]).has(code)
  ) {
    return "MICRO";
  }
  return "OTHER";
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

function totalForArea(quantity: number, unit: string, areaHa: number) {
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(areaHa) || areaHa <= 0) return null;
  const normalized = normalizeUnit(unit);
  if (new Set(["kg/ha", "kgha-1", "kgha1"]).has(normalized)) {
    return { quantity: quantity * areaHa, unit: "kg" as const };
  }
  if (new Set(["t/ha", "tha-1", "tha1", "ton/ha", "tonelada/ha", "toneladas/ha"]).has(normalized)) {
    return { quantity: quantity * areaHa, unit: "t" as const };
  }
  return null;
}

export function buildPublishedRecommendationDashboard(input: {
  recommendations: PublishedRecommendation[];
  areaHa: number;
}): PublishedRecommendationGroup[] {
  const areaHa = Number.isFinite(input.areaHa) && input.areaHa > 0 ? input.areaHa : 0;
  const rows = input.recommendations
    .filter((item) =>
      typeof item.inputType === "string"
      && item.inputType.trim().length > 0
      && typeof item.unit === "string"
      && item.unit.trim().length > 0
      && Number.isFinite(item.quantity)
      && item.quantity > 0
    )
    .map((item): PublishedRecommendationRow => {
      const total = totalForArea(item.quantity, item.unit, areaHa);
      return {
        inputType: item.inputType,
        label: recommendationInputLabel(item.inputType),
        category: categoryFor(item.inputType),
        doseQuantity: item.quantity,
        doseUnit: item.unit.trim(),
        totalQuantity: total?.quantity ?? null,
        totalUnit: total?.unit ?? null,
        rationale: typeof item.rationale === "string" && item.rationale.trim() ? item.rationale.trim() : null,
      };
    });

  const order: RecommendationCategory[] = ["CORRECTION", "MACRO", "MICRO", "OTHER"];
  return order
    .map((category) => {
      const categoryRows = rows.filter((row) => row.category === category);
      return {
        category,
        label: CATEGORY_META[category].label,
        hint: CATEGORY_META[category].hint,
        rows: categoryRows,
      };
    })
    .filter((group) => group.rows.length > 0);
}
