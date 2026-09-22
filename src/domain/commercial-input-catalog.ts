import type { CommercialNutrient, NutrientGuarantees } from "./commercial-input-engine.ts";

export type CommercialInputKind = "FERTILIZER" | "LIMESTONE" | "CORRECTIVE";

export type CommercialInputCatalogDraft = {
  code: string;
  name: string;
  kind: CommercialInputKind;
  guaranteesPercent?: NutrientGuarantees | null;
  prntPercent?: number | null;
  pricePerTon?: number | null;
  minRateKgPerHa?: number | null;
  maxRateKgPerHa?: number | null;
  active?: boolean;
};

export type NormalizedCommercialInputCatalogDraft = {
  code: string;
  name: string;
  kind: CommercialInputKind;
  guaranteesPercent: NutrientGuarantees;
  prntPercent: number | null;
  pricePerTon: number | null;
  minRateKgPerHa: number | null;
  maxRateKgPerHa: number | null;
  active: boolean;
};

const KINDS = new Set<CommercialInputKind>(["FERTILIZER", "LIMESTONE", "CORRECTIVE"]);
const NUTRIENTS: CommercialNutrient[] = ["N", "P2O5", "K2O", "S", "Ca", "Mg"];

function optionalFiniteNonNegative(value: number | null | undefined, label: string) {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} deve ser um número finito maior ou igual a zero.`);
  return value;
}

function normalizeGuarantees(input: NutrientGuarantees | null | undefined): NutrientGuarantees {
  const source = input ?? {};
  const normalized: NutrientGuarantees = {};
  for (const nutrient of NUTRIENTS) {
    const value = source[nutrient];
    if (value == null) continue;
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error(`Garantia de ${nutrient} deve ficar entre 0 e 100%.`);
    }
    if (value > 0) normalized[nutrient] = Math.round(value * 10_000) / 10_000;
  }
  return normalized;
}

export function normalizeCommercialInputCatalogDraft(input: CommercialInputCatalogDraft): NormalizedCommercialInputCatalogDraft {
  const code = input.code.trim().toUpperCase().replace(/\s+/g, "-");
  const name = input.name.trim();
  if (!code) throw new Error("Código do insumo é obrigatório.");
  if (code.length > 80) throw new Error("Código do insumo deve ter no máximo 80 caracteres.");
  if (!name) throw new Error("Nome do insumo é obrigatório.");
  if (name.length > 160) throw new Error("Nome do insumo deve ter no máximo 160 caracteres.");
  if (!KINDS.has(input.kind)) throw new Error("Tipo de insumo inválido.");

  const guaranteesPercent = normalizeGuarantees(input.guaranteesPercent);
  const prntPercent = optionalFiniteNonNegative(input.prntPercent, "PRNT");
  const pricePerTon = optionalFiniteNonNegative(input.pricePerTon, "Preço por tonelada");
  const minRateKgPerHa = optionalFiniteNonNegative(input.minRateKgPerHa, "Dose operacional mínima");
  const maxRateKgPerHa = optionalFiniteNonNegative(input.maxRateKgPerHa, "Dose operacional máxima");

  if (prntPercent === 0) throw new Error("PRNT, quando informado, deve ser maior que zero.");
  if (minRateKgPerHa != null && maxRateKgPerHa != null && minRateKgPerHa > maxRateKgPerHa) {
    throw new Error("Dose operacional mínima não pode ser maior que a máxima.");
  }

  const hasPositiveGuarantee = Object.values(guaranteesPercent).some((value) => typeof value === "number" && value > 0);
  if (input.kind === "FERTILIZER" && !hasPositiveGuarantee) {
    throw new Error("Fertilizante precisa ter ao menos uma garantia nutricional positiva.");
  }
  if (input.kind === "LIMESTONE" && prntPercent == null) {
    throw new Error("Calcário precisa ter PRNT informado para permitir conversão segura da dose.");
  }
  if (input.kind === "CORRECTIVE" && !hasPositiveGuarantee && prntPercent == null) {
    throw new Error("Corretivo precisa ter ao menos uma garantia positiva ou PRNT informado.");
  }

  return {
    code,
    name,
    kind: input.kind,
    guaranteesPercent,
    prntPercent,
    pricePerTon,
    minRateKgPerHa,
    maxRateKgPerHa,
    active: input.active ?? true,
  };
}
