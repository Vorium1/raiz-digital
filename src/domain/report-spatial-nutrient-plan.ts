import type {
  DeterministicPkDoseDecision,
  DeterministicPkPointDoseEnvelope,
} from "./uniform-pk-readiness.ts";
import type { SoybeanSulfurUniformDecision } from "./sulfur-dose-engine.ts";

export type ReportSpatialNutrient = "P2O5" | "K2O" | "S";

export type ReportSpatialDosePoint = {
  sampleCode: string;
  doseKgPerHa: number;
  classification: string | null;
};

export type ReportSpatialNutrientDecision = {
  nutrient: ReportSpatialNutrient;
  status: "UNIFORM" | "POINT_SPECIFIC" | "BLOCKED";
  unit: "kg/ha";
  uniformDoseKgPerHa: number | null;
  rangeKgPerHa: { min: number; max: number } | null;
  points: ReportSpatialDosePoint[];
  purchaseEquivalent: {
    kgPerHaEquivalent: number;
    totalKg: number;
    basis: "EQUAL_AREA_GRID_MEAN";
    applicationRateAllowed: false;
  } | null;
  blockers: string[];
  source: string | null;
  note: string;
};

export type ReportSpatialNutrientPlan = {
  status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  samplingBasis: "EQUAL_AREA_GRID" | "UNSPECIFIED";
  policy: "POINT_SPECIFIC_WHEN_UNIFORM_NOT_SUPPORTED";
  nutrients: ReportSpatialNutrientDecision[];
};

function rounded(value: number) {
  return Math.round(value * 10) / 10;
}

function range(values: number[]) {
  if (!values.length) return null;
  return {
    min: rounded(Math.min(...values)),
    max: rounded(Math.max(...values)),
  };
}

function purchaseEquivalent(input: {
  equalAreaGrid: boolean;
  areaHa: number | null;
  points: ReportSpatialDosePoint[];
  status: ReportSpatialNutrientDecision["status"];
}) {
  if (
    input.status !== "POINT_SPECIFIC"
    || !input.equalAreaGrid
    || input.areaHa == null
    || !Number.isFinite(input.areaHa)
    || input.areaHa <= 0
    || input.points.length === 0
  ) return null;

  const kgPerHaEquivalent = rounded(
    input.points.reduce((sum, item) => sum + item.doseKgPerHa, 0) / input.points.length,
  );
  return {
    kgPerHaEquivalent,
    totalKg: rounded(kgPerHaEquivalent * input.areaHa),
    basis: "EQUAL_AREA_GRID_MEAN" as const,
    applicationRateAllowed: false as const,
  };
}

function pkDecision(input: {
  nutrient: "P2O5" | "K2O";
  equalAreaGrid: boolean;
  areaHa: number | null;
  uniform: DeterministicPkDoseDecision;
  envelope: DeterministicPkPointDoseEnvelope;
}): ReportSpatialNutrientDecision {
  const points = input.envelope.rows.map((row) => ({
    sampleCode: row.sampleCode,
    doseKgPerHa: rounded(row.doseKgPerHa),
    classification: row.soilLevel,
  }));

  if (
    input.uniform.ready
    && input.uniform.expected
    && !input.uniform.expected.isDiscretionaryRange
  ) {
    return {
      nutrient: input.nutrient,
      status: "UNIFORM",
      unit: "kg/ha",
      uniformDoseKgPerHa: rounded(input.uniform.expected.doseKgPerHa),
      rangeKgPerHa: range(points.map((item) => item.doseKgPerHa)),
      points,
      purchaseEquivalent: null,
      blockers: [],
      source: input.uniform.expected.source ?? input.envelope.source,
      note: "A evidência sustenta uma dose uniforme pela política determinística de representatividade; as doses por ponto permanecem congeladas para rastreabilidade.",
    };
  }

  if (input.envelope.ready && points.length > 0) {
    const status = "POINT_SPECIFIC" as const;
    return {
      nutrient: input.nutrient,
      status,
      unit: "kg/ha",
      uniformDoseKgPerHa: null,
      rangeKgPerHa: range(points.map((item) => item.doseKgPerHa)),
      points,
      purchaseEquivalent: purchaseEquivalent({
        equalAreaGrid: input.equalAreaGrid,
        areaHa: input.areaHa,
        points,
        status,
      }),
      blockers: input.uniform.blockers,
      source: input.envelope.source,
      note: "Não há taxa uniforme segura para todo o talhão. Aplicar conforme a decisão por ponto/zona; eventual média da grade serve somente para estimar compra/logística e nunca como taxa uniforme de aplicação.",
    };
  }

  return {
    nutrient: input.nutrient,
    status: "BLOCKED",
    unit: "kg/ha",
    uniformDoseKgPerHa: null,
    rangeKgPerHa: null,
    points,
    purchaseEquivalent: null,
    blockers: [...new Set([...input.uniform.blockers, ...input.envelope.blockers])],
    source: input.envelope.source ?? input.uniform.expected?.source ?? null,
    note: "A evidência atual não sustenta dose quantitativa oficial para este nutriente.",
  };
}

function sulfurDecision(input: {
  equalAreaGrid: boolean;
  areaHa: number | null;
  decision: SoybeanSulfurUniformDecision | null | undefined;
}): ReportSpatialNutrientDecision {
  const sulfur = input.decision;
  const points: ReportSpatialDosePoint[] = (sulfur?.pointDoses ?? []).map((row) => ({
    sampleCode: row.sampleCode,
    doseKgPerHa: rounded(row.doseKgSPerHa),
    classification: row.classification,
  }));

  if (sulfur?.dose.kind === "EXACT" && sulfur.status === "READY_FOR_IMPLEMENTATION") {
    return {
      nutrient: "S",
      status: "UNIFORM",
      unit: "kg/ha",
      uniformDoseKgPerHa: rounded(sulfur.dose.kgSPerHa),
      rangeKgPerHa: range(points.map((item) => item.doseKgPerHa))
        ?? { min: rounded(sulfur.dose.kgSPerHa), max: rounded(sulfur.dose.kgSPerHa) },
      points,
      purchaseEquivalent: null,
      blockers: [],
      source: sulfur.source,
      note: "A regra de enxofre sustenta uma dose uniforme; a leitura por ponto permanece congelada para rastreabilidade.",
    };
  }

  if (
    sulfur?.status === "READY_FOR_IMPLEMENTATION"
    && sulfur.blockers.includes("S_NO_STRICT_PREDOMINANCE")
    && points.length > 0
  ) {
    const status = "POINT_SPECIFIC" as const;
    return {
      nutrient: "S",
      status,
      unit: "kg/ha",
      uniformDoseKgPerHa: null,
      rangeKgPerHa: range(points.map((item) => item.doseKgPerHa)),
      points,
      purchaseEquivalent: purchaseEquivalent({
        equalAreaGrid: input.equalAreaGrid,
        areaHa: input.areaHa,
        points,
        status,
      }),
      blockers: sulfur.blockers,
      source: sulfur.source,
      note: "Os pontos não sustentam dose uniforme de enxofre. Preservar a decisão 0/20 kg S/ha por ponto; equivalência de compra, quando disponível, não é taxa uniforme.",
    };
  }

  return {
    nutrient: "S",
    status: "BLOCKED",
    unit: "kg/ha",
    uniformDoseKgPerHa: null,
    rangeKgPerHa: null,
    points,
    purchaseEquivalent: null,
    blockers: sulfur?.blockers ?? ["S_DECISION_UNAVAILABLE"],
    source: sulfur?.source ?? null,
    note: "A evidência atual não sustenta dose quantitativa oficial de enxofre.",
  };
}

export function buildReportSpatialNutrientPlan(input: {
  areaHa: number | null;
  equalAreaGrid: boolean;
  pkDoses: Record<"P2O5" | "K2O", DeterministicPkDoseDecision>;
  pkPointDoses: Record<"P2O5" | "K2O", DeterministicPkPointDoseEnvelope>;
  sulfurDecision?: SoybeanSulfurUniformDecision | null;
}): ReportSpatialNutrientPlan {
  const nutrients = [
    pkDecision({
      nutrient: "P2O5",
      equalAreaGrid: input.equalAreaGrid,
      areaHa: input.areaHa,
      uniform: input.pkDoses.P2O5,
      envelope: input.pkPointDoses.P2O5,
    }),
    pkDecision({
      nutrient: "K2O",
      equalAreaGrid: input.equalAreaGrid,
      areaHa: input.areaHa,
      uniform: input.pkDoses.K2O,
      envelope: input.pkPointDoses.K2O,
    }),
    sulfurDecision({
      equalAreaGrid: input.equalAreaGrid,
      areaHa: input.areaHa,
      decision: input.sulfurDecision,
    }),
  ];

  const available = nutrients.filter((item) => item.status !== "BLOCKED").length;
  return {
    status: available === nutrients.length ? "AVAILABLE" : available > 0 ? "PARTIAL" : "UNAVAILABLE",
    samplingBasis: input.equalAreaGrid ? "EQUAL_AREA_GRID" : "UNSPECIFIED",
    policy: "POINT_SPECIFIC_WHEN_UNIFORM_NOT_SUPPORTED",
    nutrients,
  };
}
