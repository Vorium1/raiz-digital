export type OfficialCommercialPlanMode = "SINGLE" | "PK_PAIR" | "LIME";

export type FrozenCommercialPlanSnapshot = {
  id: string;
  label: string | null;
  simulationMode: OfficialCommercialPlanMode;
  schemaVersion: number;
  areaHa: number;
  sourceTargets: unknown;
  productSnapshots: unknown;
  engineInput: unknown;
  engineOutput: unknown;
  createdAt: string;
};

export type ProducerCommercialPlanRow = {
  productName: string;
  doseQuantity: number;
  doseUnit: "kg/ha" | "t/ha";
  totalQuantity: number;
  totalUnit: "t";
  pricePerTon: number | null;
};

export type ProducerCommercialPlanSummary = {
  planId: string;
  label: string | null;
  mode: OfficialCommercialPlanMode;
  areaHa: number;
  rows: ProducerCommercialPlanRow[];
  costPerHa: number | null;
  totalCost: number | null;
  hasFrozenCost: boolean;
};

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteNonNegative(value: unknown) {
  const number = finiteNumber(value);
  return number != null && number >= 0 ? number : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function productSnapshotAt(value: unknown, index: number) {
  if (!Array.isArray(value)) return null;
  return asObject(value[index]);
}

function productName(value: unknown, index: number) {
  const product = productSnapshotAt(value, index);
  return stringValue(product?.name) ?? stringValue(product?.code) ?? `Produto ${index + 1}`;
}

function productPrice(value: unknown, index: number) {
  const product = productSnapshotAt(value, index);
  return finiteNonNegative(product?.pricePerTon);
}

function sourceRecommendationIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const ids: string[] = [];
  for (const target of value) {
    const object = asObject(target);
    const recommendationId = stringValue(object?.recommendationId);
    if (!recommendationId) return null;
    ids.push(recommendationId);
  }
  return [...new Set(ids)];
}

function violationList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function commercialPlanConstraintViolations(snapshot: FrozenCommercialPlanSnapshot) {
  const output = asObject(snapshot.engineOutput);
  if (!output) return ["Resultado comercial congelado ausente ou inválido."];

  if (snapshot.simulationMode === "PK_PAIR") {
    const productA = asObject(output.productA);
    const productB = asObject(output.productB);
    const violations = [
      ...violationList(productA?.constraintViolations).map((item) => `Produto A: ${item}`),
      ...violationList(productB?.constraintViolations).map((item) => `Produto B: ${item}`),
    ];
    if (productA?.constraintsSatisfied !== true && violations.every((item) => !item.startsWith("Produto A:"))) {
      violations.push("Produto A não passou nos limites operacionais congelados.");
    }
    if (productB?.constraintsSatisfied !== true && violations.every((item) => !item.startsWith("Produto B:"))) {
      violations.push("Produto B não passou nos limites operacionais congelados.");
    }
    return violations;
  }

  const violations = violationList(output.constraintViolations);
  if (output.constraintsSatisfied !== true && violations.length === 0) {
    violations.push("O cenário não passou nos limites operacionais congelados.");
  }
  return violations;
}

export function buildProducerCommercialPlanSummary(
  snapshot: FrozenCommercialPlanSnapshot,
): ProducerCommercialPlanSummary | null {
  const areaHa = finiteNumber(snapshot.areaHa);
  const output = asObject(snapshot.engineOutput);
  if (areaHa == null || areaHa <= 0 || !output) return null;

  const rows: ProducerCommercialPlanRow[] = [];

  if (snapshot.simulationMode === "SINGLE") {
    const rateKgPerHa = finiteNonNegative(output.rateKgPerHa);
    const totalProductTon = finiteNonNegative(output.totalProductTon);
    if (rateKgPerHa == null || totalProductTon == null) return null;
    rows.push({
      productName: productName(snapshot.productSnapshots, 0),
      doseQuantity: rateKgPerHa,
      doseUnit: "kg/ha",
      totalQuantity: totalProductTon,
      totalUnit: "t",
      pricePerTon: productPrice(snapshot.productSnapshots, 0),
    });
  } else if (snapshot.simulationMode === "LIME") {
    const productDoseTonPerHa = finiteNonNegative(output.productDoseTonPerHa);
    const totalProductTon = finiteNonNegative(output.totalProductTon);
    if (productDoseTonPerHa == null || totalProductTon == null) return null;
    rows.push({
      productName: productName(snapshot.productSnapshots, 0),
      doseQuantity: productDoseTonPerHa,
      doseUnit: "t/ha",
      totalQuantity: totalProductTon,
      totalUnit: "t",
      pricePerTon: productPrice(snapshot.productSnapshots, 0),
    });
  } else {
    const productA = asObject(output.productA);
    const productB = asObject(output.productB);
    const rateA = finiteNonNegative(productA?.rateKgPerHa);
    const rateB = finiteNonNegative(productB?.rateKgPerHa);
    const totalA = finiteNonNegative(productA?.totalProductTon);
    const totalB = finiteNonNegative(productB?.totalProductTon);
    if (rateA == null || rateB == null || totalA == null || totalB == null) return null;
    rows.push(
      {
        productName: productName(snapshot.productSnapshots, 0),
        doseQuantity: rateA,
        doseUnit: "kg/ha",
        totalQuantity: totalA,
        totalUnit: "t",
        pricePerTon: productPrice(snapshot.productSnapshots, 0),
      },
      {
        productName: productName(snapshot.productSnapshots, 1),
        doseQuantity: rateB,
        doseUnit: "kg/ha",
        totalQuantity: totalB,
        totalUnit: "t",
        pricePerTon: productPrice(snapshot.productSnapshots, 1),
      },
    );
  }

  const costPerHa = finiteNonNegative(output.costPerHa);
  const totalCost = finiteNonNegative(output.totalCost);

  return {
    planId: snapshot.id,
    label: snapshot.label,
    mode: snapshot.simulationMode,
    areaHa,
    rows,
    costPerHa,
    totalCost,
    hasFrozenCost: costPerHa != null && totalCost != null,
  };
}

export function inspectOfficialCommercialPlan(snapshot: FrozenCommercialPlanSnapshot) {
  const recommendationIds = sourceRecommendationIds(snapshot.sourceTargets);
  const summary = buildProducerCommercialPlanSummary(snapshot);
  const violations = commercialPlanConstraintViolations(snapshot);

  let reason: string | null = null;
  if (!recommendationIds?.length) {
    reason = "O cenário comercial não possui recomendações oficiais rastreáveis em todos os alvos congelados.";
  } else if (!summary) {
    reason = "O cenário comercial congelado está incompleto para compor um laudo oficial.";
  } else if (violations.length > 0) {
    reason = "O cenário comercial possui violação de limite operacional e não pode ser promovido ao laudo oficial.";
  }

  return {
    valid: reason == null,
    reason,
    recommendationIds: recommendationIds ?? [],
    violations,
    summary,
  };
}
