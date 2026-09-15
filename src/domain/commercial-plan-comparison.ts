export type CommercialSimulationMode = "SINGLE" | "PK_PAIR" | "LIME";

export type CommercialSnapshotForComparison = {
  id: string;
  simulationMode: CommercialSimulationMode;
  areaHa: number;
  sourceTargets: Array<{
    recommendationId?: string | null;
    inputType?: string;
    canonicalTarget?: string;
    quantity?: number;
    unit?: string;
    calculationSource?: string | null;
    recommendedAt?: string | null;
    sourceGenerationId?: string | null;
    freshnessCode?: string | null;
  }>;
  engineOutput?: unknown;
};

export type CommercialPlanComparisonRow = {
  id: string;
  simulationMode: CommercialSimulationMode;
  areaHa: number;
  costPerHa: number | null;
  totalCost: number | null;
  totalProductTon: number | null;
  totalRateKgPerHa: number | null;
  productDoseTonPerHa: number | null;
  costPerHaDeltaFromReference: number | null;
  totalCostDeltaFromReference: number | null;
  constraintViolationCount: number;
};

export type CommercialPlanComparison = {
  directCostComparison: boolean;
  directTotalComparison: boolean;
  sameAgronomicBasis: boolean;
  sameArea: boolean;
  referenceId: string | null;
  rows: CommercialPlanComparisonRow[];
};

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sumKnown(values: Array<number | null>): number | null {
  return values.every((value) => value != null)
    ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;
}

function normalizedOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

function normalizedTargetSignature(snapshot: CommercialSnapshotForComparison) {
  return snapshot.sourceTargets
    .map((target) => ({
      target: target.canonicalTarget?.trim() || target.inputType?.trim() || "",
      quantity: typeof target.quantity === "number" && Number.isFinite(target.quantity)
        ? Number(target.quantity.toFixed(8))
        : null,
      unit: target.unit?.trim().toLowerCase() || "",
      recommendationId: normalizedOptionalText(target.recommendationId),
      calculationSource: normalizedOptionalText(target.calculationSource),
      recommendedAt: normalizedOptionalText(target.recommendedAt),
      sourceGenerationId: normalizedOptionalText(target.sourceGenerationId),
      freshnessCode: normalizedOptionalText(target.freshnessCode),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

/**
 * Para habilitar delta financeiro, não basta a quantidade coincidir: o snapshot precisa apontar
 * para a mesma evidência/recomendação agronômica congelada. Isso evita comparar silenciosamente
 * cenários produzidos por gerações técnicas diferentes que por acaso resultaram no mesmo número.
 */
export function haveSameAgronomicBasis(snapshots: CommercialSnapshotForComparison[]) {
  if (snapshots.length < 2) return false;
  const reference = JSON.stringify(normalizedTargetSignature(snapshots[0]));
  return snapshots.slice(1).every((snapshot) => JSON.stringify(normalizedTargetSignature(snapshot)) === reference);
}

function countConstraintViolations(mode: CommercialSimulationMode, output: JsonObject) {
  if (mode === "PK_PAIR") {
    const productA = asObject(output.productA);
    const productB = asObject(output.productB);
    const a = Array.isArray(productA.constraintViolations) ? productA.constraintViolations.length : 0;
    const b = Array.isArray(productB.constraintViolations) ? productB.constraintViolations.length : 0;
    return a + b;
  }
  return Array.isArray(output.constraintViolations) ? output.constraintViolations.length : 0;
}

function metrics(snapshot: CommercialSnapshotForComparison): Omit<CommercialPlanComparisonRow, "costPerHaDeltaFromReference" | "totalCostDeltaFromReference"> {
  const output = asObject(snapshot.engineOutput);
  let totalProductTon = finiteNumber(output.totalProductTon);
  let totalRateKgPerHa: number | null = null;
  let productDoseTonPerHa: number | null = null;

  if (snapshot.simulationMode === "PK_PAIR") {
    const productA = asObject(output.productA);
    const productB = asObject(output.productB);
    totalRateKgPerHa = sumKnown([
      finiteNumber(productA.rateKgPerHa),
      finiteNumber(productB.rateKgPerHa),
    ]);
    if (totalProductTon == null) {
      totalProductTon = sumKnown([
        finiteNumber(productA.totalProductTon),
        finiteNumber(productB.totalProductTon),
      ]);
    }
  } else if (snapshot.simulationMode === "LIME") {
    productDoseTonPerHa = finiteNumber(output.productDoseTonPerHa);
  } else {
    totalRateKgPerHa = finiteNumber(output.rateKgPerHa);
  }

  return {
    id: snapshot.id,
    simulationMode: snapshot.simulationMode,
    areaHa: snapshot.areaHa,
    costPerHa: finiteNumber(output.costPerHa),
    totalCost: finiteNumber(output.totalCost),
    totalProductTon,
    totalRateKgPerHa,
    productDoseTonPerHa,
    constraintViolationCount: countConstraintViolations(snapshot.simulationMode, output),
  };
}

export function buildCommercialPlanComparison(snapshots: CommercialSnapshotForComparison[]): CommercialPlanComparison {
  if (snapshots.length === 0) {
    return {
      directCostComparison: false,
      directTotalComparison: false,
      sameAgronomicBasis: false,
      sameArea: false,
      referenceId: null,
      rows: [],
    };
  }

  const sameAgronomicBasis = haveSameAgronomicBasis(snapshots);
  const referenceArea = snapshots[0].areaHa;
  const sameArea = snapshots.every((snapshot) => Math.abs(snapshot.areaHa - referenceArea) <= 0.0001);
  const rawRows = snapshots.map(metrics);
  const reference = rawRows[0];

  return {
    directCostComparison: snapshots.length >= 2 && sameAgronomicBasis,
    directTotalComparison: snapshots.length >= 2 && sameAgronomicBasis && sameArea,
    sameAgronomicBasis,
    sameArea,
    referenceId: reference.id,
    rows: rawRows.map((row) => ({
      ...row,
      costPerHaDeltaFromReference: sameAgronomicBasis && row.costPerHa != null && reference.costPerHa != null
        ? row.costPerHa - reference.costPerHa
        : null,
      totalCostDeltaFromReference: sameAgronomicBasis && sameArea && row.totalCost != null && reference.totalCost != null
        ? row.totalCost - reference.totalCost
        : null,
    })),
  };
}