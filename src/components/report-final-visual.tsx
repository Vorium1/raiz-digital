import { Icon } from "@/components/icon";
import { BrandLogo } from "@/components/brand-logo";
import { PublishedNdviMap } from "@/components/published-ndvi-map";
import { ReportBrand, ReportSignature } from "@/components/report-brand";
import { effectivePointCoordinates, pointPositionKind, type MapPoint } from "@/components/spatial-map-types";
import { buildProducerCommercialPlanSummary, type FrozenCommercialPlanSnapshot } from "@/domain/official-commercial-plan";
import { buildProducerResultSummary } from "@/domain/producer-result-summary";
import type { TenantBranding } from "@/lib/repositories/tenant-branding";
import type { ReportFertilityHorizon } from "@/domain/report-fertility-horizon";
import type { SoilComplementAction } from "@/domain/soil-complement-actions";
import type {
  ReportApplicationGuidance,
  ReportBiologicalContext,
  ReportClimateContext,
} from "@/domain/report-context-blocks";
import type { ReportAgroclimateSnapshot } from "@/domain/report-agroclimate-snapshot";
import type { FrozenNdviSnapshot } from "@/lib/repositories/premium-report-publication";
import type { ReportSpatialNutrientPlan } from "@/domain/report-spatial-nutrient-plan";
import type { SoybeanLimingUniformDecision } from "@/domain/soybean-liming-evidence";
import type { Integrated020LimingLayerRequirement, LimingMethodSelection } from "@/domain/liming-method-selector";
import { classifyNdviValue, VIGOR_ZONE_LABELS, type VigorZone } from "@/domain/ndvi-engine";

const NDVI_REPORT_SCALE: Array<{ zone: VigorZone; range: string; cssClass: string }> = [
  { zone: "SEM_VEGETACAO", range: "< 0,20", cssClass: "zone-bare" },
  { zone: "BAIXO", range: "0,20–0,39", cssClass: "zone-low" },
  { zone: "MODERADO", range: "0,40–0,59", cssClass: "zone-moderate" },
  { zone: "ALTO", range: "0,60–0,79", cssClass: "zone-high" },
  { zone: "MUITO_ALTO", range: "≥ 0,80", cssClass: "zone-very-high" },
];

type StructuredFact = {
  sampleCode: string;
  parameterCode: string;
  value: number;
  unit: string;
  method: string;
  sampleType?: string | null;
  depthFromCm?: number | null;
  depthToCm?: number | null;
  source?: string;
};

type StructuredInterpretation = {
  sampleCode: string;
  parameterCode: string;
  classificationRole?: "TARGET" | "AUXILIARY";
  interpretable: boolean;
  classification?: string;
  reason?: string;
};

type ReportContext = {
  id?: string | null;
  fieldId?: string | null;
  code?: string | null;
  clientName?: string | null;
  propertyName?: string | null;
  fieldName?: string | null;
  areaHa?: number | null;
  seasonLabel?: string | null;
  currentCrop?: string | null;
  nextCrop?: string | null;
  cultivar?: string | null;
  managementSystem?: string | null;
  soilTexture?: string | null;
  yieldGoal?: number | null;
  yieldGoalUnit?: string | null;
  laboratoryName?: string | null;
  municipality?: string | null;
  state?: string | null;
  confidenceScore?: number | null;
  confidenceLevel?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type Recommendation = {
  inputType?: string;
  quantity?: number;
  unit?: string;
  rationale?: string;
  timing?: string;
  applicationTiming?: string;
  stage?: string;
  when?: string;
  period?: string;
  via?: string;
  applicationMethod?: string;
  method?: string;
  placement?: string;
};

type Prescription = {
  summary?: string;
  recommendations?: Recommendation[];
  managementPractices?: string[];
  missingInformation?: string[];
  sources?: Array<{ title?: string; institution?: string }>;
  fertilityPlan?: ReportFertilityHorizon | null;
  soilComplementActions?: SoilComplementAction[];
  climateContext?: ReportClimateContext | null;
  biologicalContext?: ReportBiologicalContext | null;
  applicationGuidance?: ReportApplicationGuidance | null;
  spatialNutrientPlan?: ReportSpatialNutrientPlan | null;
  limingDecision?: SoybeanLimingUniformDecision | null;
  limingMethodSelection?: LimingMethodSelection | null;
  limingLayerRequirement?: Integrated020LimingLayerRequirement | null;
  limingReferenceScenarios?: Integrated020LimingLayerRequirement[];
  agroclimateSnapshot?: ReportAgroclimateSnapshot | null;
};

type Props = {
  context: ReportContext;
  branding: TenantBranding;
  facts: StructuredFact[];
  interpretationRows: StructuredInterpretation[];
  points: MapPoint[];
  boundary: unknown | null;
  narrativeSummary?: string | null;
  prescription?: Prescription | null;
  interpretationStatus?: string | null;
  prescriptionStatus?: string | null;
  confidence?: { score: number; level: string } | null;
  viewingPublished: boolean;
  currentStatusLabel: string;
  generatedAt: string;
  interpretationRevision?: number | null;
  responsibleName?: string | null;
  technicalBase?: string | null;
  publishedByName?: string | null;
  publishedAt?: string | null;
  publishedHashPrefix?: string | null;
  commercialPlanSnapshot?: FrozenCommercialPlanSnapshot | null;
  ndviSnapshot?: FrozenNdviSnapshot | null;
  showTechnicalAppendix?: boolean;
};

type ParameterSummary = {
  code: string;
  value: string;
  method: string;
  classification: string | null;
  auxiliary: boolean;
  pendingCode: "INSUFFICIENT_EVIDENCE" | "REQUIRES_AGRONOMIST_REVIEW" | null;
  pendingReason: string | null;
  sampleCount: number;
};

function numberPt(value: number, maximumFractionDigits = 2) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits });
}

function commercialTotalDisplay(totalQuantity: number, totalUnit: string) {
  if (totalUnit === "t" && totalQuantity > 0 && totalQuantity < 1) {
    return numberPt(totalQuantity * 1000, 0) + " kg";
  }
  return numberPt(totalQuantity, 2) + " " + totalUnit;
}

const CLASSIFICATION_ORDER = ["MUITO_BAIXO", "BAIXO", "MEDIO", "ALTO", "MUITO_ALTO"];

function normalizedClassification(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function classificationLabel(value: string) {
  const normalized = normalizedClassification(value);
  const known: Record<string, string> = {
    MUITO_BAIXO: "Muito baixo",
    BAIXO: "Baixo",
    MEDIO: "Médio",
    ALTO: "Alto",
    MUITO_ALTO: "Muito alto",
  };
  return known[normalized] ?? value.replace(/_/g, " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

function classificationTone(value: string) {
  const normalized = normalizedClassification(value);
  if (normalized === "MUITO_BAIXO" || normalized === "BAIXO") return "low";
  if (normalized === "MEDIO") return "medium";
  if (normalized === "ALTO") return "high";
  if (normalized === "MUITO_ALTO") return "very-high";
  return "neutral";
}

function distributionForParameter(rows: StructuredInterpretation[], code: string) {
  const values = rows
    .filter((row) => row.parameterCode === code && row.interpretable && row.classification)
    .map((row) => row.classification as string);
  const counts = new Map<string, { label: string; count: number }>();
  for (const value of values) {
    const normalized = normalizedClassification(value);
    const current = counts.get(normalized);
    counts.set(normalized, { label: classificationLabel(value), count: (current?.count ?? 0) + 1 });
  }
  return Array.from(counts.entries())
    .map(([key, value]) => ({ key, ...value, tone: classificationTone(key) }))
    .sort((a, b) => {
      const ai = CLASSIFICATION_ORDER.indexOf(a.key);
      const bi = CLASSIFICATION_ORDER.indexOf(b.key);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.label.localeCompare(b.label);
    });
}

function recommendationShortLabel(inputType: string | undefined) {
  const code = (inputType ?? "").trim().toUpperCase();
  if (code === "K2O") return "Potássio";
  if (code === "P2O5") return "Fósforo";
  if (code === "S") return "Enxofre";
  if (code === "N") return "Nitrogênio";
  if (code.includes("CALCAR") || code.includes("LIME")) return "Calcário";
  return inputType || "Recomendação";
}

function parameterDisplayLabel(code: string) {
  const normalized = code.trim().toUpperCase();
  const labels: Record<string, string> = {
    P: "Fósforo",
    K: "Potássio",
    S: "Enxofre",
    N: "Nitrogênio",
    B: "Boro",
    ZN: "Zinco",
    CU: "Cobre",
    MN: "Manganês",
    CA: "Cálcio",
    MG: "Magnésio",
    MO: "Matéria orgânica",
    PH: "pH",
    AL: "Alumínio",
  };
  return labels[normalized] ?? code;
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

function parameterSummaries(facts: StructuredFact[], rows: StructuredInterpretation[]): ParameterSummary[] {
  const order = new Map<string, number>();
  const codes: string[] = [];
  const register = (code: string) => {
    if (!order.has(code)) {
      order.set(code, order.size);
      codes.push(code);
    }
  };
  facts.forEach((fact) => register(fact.parameterCode));
  rows.forEach((row) => register(row.parameterCode));

  return codes.map((code) => {
    const parameterFacts = facts.filter((fact) => fact.parameterCode === code);
    const parameterRows = rows.filter((row) => row.parameterCode === code);
    const units = unique(parameterFacts.map((fact) => fact.unit));
    const methods = unique(parameterFacts.map((fact) => fact.method));
    const numericValues = parameterFacts.map((fact) => Number(fact.value)).filter(Number.isFinite);

    let value = "—";
    if (numericValues.length === 1) {
      value = numberPt(numericValues[0]) + (units[0] ? " " + units[0] : "");
    } else if (numericValues.length > 1 && units.length <= 1) {
      const minimum = Math.min(...numericValues);
      const maximum = Math.max(...numericValues);
      const average = numericValues.reduce((sum, item) => sum + item, 0) / numericValues.length;
      const unit = units[0] ? " " + units[0] : "";
      value = numberPt(minimum) + "–" + numberPt(maximum) + unit + " · média " + numberPt(average) + unit;
    } else if (numericValues.length > 1) {
      value = numericValues.length + " resultados · " + units.join(" / ");
    }

    const targetRows = parameterRows.filter((row) => row.classificationRole !== "AUXILIARY");
    const labels = unique(targetRows.filter((row) => row.interpretable).map((row) => row.classification));
    const nonInterpretable = targetRows.some((row) => !row.interpretable);
    const pendingReasons = unique(targetRows.filter((row) => !row.interpretable).map((row) => row.reason));
    const pendingReason = pendingReasons.length ? pendingReasons.join(" · ") : null;
    const auxiliary = (parameterRows.length > 0 && targetRows.length === 0)
      || Boolean(pendingReason && /dado auxiliar|insumo\/contexto|não é um alvo|nao e um alvo|não se aplica|nao se aplica/i.test(pendingReason));
    const requiresReview = Boolean(pendingReason && /agronom|revis|valid/i.test(pendingReason));

    return {
      code,
      value,
      method: methods.length === 1 ? methods[0] : methods.length > 1 ? "Métodos múltiplos" : "Método não informado",
      classification: labels.length === 1 ? labels[0] : labels.length > 1 ? "Variável: " + labels.join(" · ") : null,
      auxiliary,
      pendingCode: nonInterpretable && !auxiliary ? (requiresReview ? "REQUIRES_AGRONOMIST_REVIEW" : "INSUFFICIENT_EVIDENCE") : null,
      pendingReason,
      sampleCount: new Set(parameterFacts.map((fact) => fact.sampleCode)).size,
    };
  });
}

function toRing(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point) => {
    if (!Array.isArray(point) || point.length < 2) return [];
    const longitude = Number(point[0]);
    const latitude = Number(point[1]);
    return Number.isFinite(longitude) && Number.isFinite(latitude) ? [[longitude, latitude] as [number, number]] : [];
  });
}

function boundaryRings(boundary: unknown): Array<Array<[number, number]>> {
  if (!boundary || typeof boundary !== "object") return [];
  const geometry = boundary as { type?: string; coordinates?: unknown };
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.map(toRing).filter((ring) => ring.length >= 3);
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.flatMap((polygon) =>
      Array.isArray(polygon) ? polygon.map(toRing).filter((ring) => ring.length >= 3) : [],
    );
  }
  return [];
}

function SpatialOverview({ boundary, points }: { boundary: unknown | null; points: MapPoint[] }) {
  const rings = boundaryRings(boundary);
  const effectivePoints = points.map((point) => ({ point, coordinates: effectivePointCoordinates(point) }));
  const allCoordinates: Array<[number, number]> = [
    ...rings.flat(),
    ...effectivePoints.map(({ coordinates }) => [coordinates.longitude, coordinates.latitude] as [number, number]),
  ];

  if (!allCoordinates.length) {
    return <div className="report-visual-map-empty">Sem geometria espacial congelada para exibir.</div>;
  }

  const longitudes = allCoordinates.map(([longitude]) => longitude);
  const latitudes = allCoordinates.map(([, latitude]) => latitude);
  let minLon = Math.min(...longitudes);
  let maxLon = Math.max(...longitudes);
  let minLat = Math.min(...latitudes);
  let maxLat = Math.max(...latitudes);
  if (minLon === maxLon) { minLon -= 0.0005; maxLon += 0.0005; }
  if (minLat === maxLat) { minLat -= 0.0005; maxLat += 0.0005; }

  const width = maxLon - minLon;
  const height = maxLat - minLat;
  const x = (longitude: number) => 6 + ((longitude - minLon) / width) * 88;
  const y = (latitude: number) => 64 - ((latitude - minLat) / height) * 56;

  return (
    <div className="report-visual-map">
      <svg viewBox="0 0 100 70" role="img" aria-label="Contorno do talhão e pontos de amostragem sem deslocamento de coordenadas">
        {rings.map((ring, index) => (
          <polygon
            key={index}
            points={ring.map(([longitude, latitude]) => x(longitude).toFixed(2) + "," + y(latitude).toFixed(2)).join(" ")}
            className={index === 0 ? "report-map-boundary primary" : "report-map-boundary"}
          />
        ))}
        {effectivePoints.map(({ point, coordinates }) => {
          const kind = pointPositionKind(point);
          return (
            <g key={point.id} className={"report-map-point " + kind.toLowerCase()}>
              <circle cx={x(coordinates.longitude)} cy={y(coordinates.latitude)} r="1.8" />
              <text x={x(coordinates.longitude) + 2.5} y={y(coordinates.latitude) - 1.7}>{point.code}</text>
            </g>
          );
        })}
      </svg>
      <div className="report-map-legend">
        <span><i className="observed" />Observada</span>
        <span><i className="audited_source" />Fonte auditada</span>
        <span><i className="planned" />Planejada/estimada</span>
      </div>
    </div>
  );
}

function producerRow(item: Recommendation, areaHa: number | null) {
  if (
    typeof item.inputType !== "string"
    || typeof item.quantity !== "number"
    || !Number.isFinite(item.quantity)
    || typeof item.unit !== "string"
  ) return null;
  return buildProducerResultSummary({
    areaHa: areaHa ?? 0,
    recommendations: [{ inputType: item.inputType, quantity: item.quantity, unit: item.unit }],
  }).rows[0] ?? null;
}

function ConceptMiniBrands({ branding }: { branding: TenantBranding }) {
  return (
    <div className="concept-mini-brands">
      <div className="concept-mini-partner">
        {branding.logoDataUrl ? <ReportBrand branding={branding} /> : <strong>{branding.displayName || "Empresa parceira"}</strong>}
      </div>
      <div className="concept-mini-raiz"><BrandLogo variant="light" /></div>
    </div>
  );
}

export function FinalVisualReport(props: Props) {
  const summaries = parameterSummaries(props.facts, props.interpretationRows);
  const prescription = props.prescription ?? null;
  const recommendations = prescription?.recommendations ?? [];
  const management = prescription?.managementPractices ?? [];
  const missingInformation = prescription?.missingInformation ?? [];
  const fertilityPlan = prescription?.fertilityPlan ?? null;
  const soilComplementActions = prescription?.soilComplementActions ?? [];
  const climateContext = prescription?.climateContext ?? null;
  const biologicalContext = prescription?.biologicalContext ?? null;
  const applicationGuidance = prescription?.applicationGuidance ?? null;
  const agroclimateSnapshot = prescription?.agroclimateSnapshot ?? null;
  const spatialNutrientPlan = prescription?.spatialNutrientPlan ?? null;
  const limingDecision = prescription?.limingDecision ?? null;
  const limingMethodSelection = prescription?.limingMethodSelection ?? null;
  const limingLayerRequirement = prescription?.limingLayerRequirement ?? null;
  const limingReferenceScenarios = prescription?.limingReferenceScenarios ?? [];
  const limingScenario55 = limingReferenceScenarios.find((item) => item.targetPh === "5.5" && item.status !== "BLOCKED") ?? null;
  const limingScenario60 = limingReferenceScenarios.find((item) => item.targetPh === "6.0" && item.status !== "BLOCKED") ?? null;
  const limingScenarioDose = (scenario: Integrated020LimingLayerRequirement | null) =>
    scenario ? scenario.operationalGeneralDoseTonHaPrnt100 ?? scenario.uniformDoseTonHaPrnt100 : null;
  const commercial = props.commercialPlanSnapshot ? buildProducerCommercialPlanSummary(props.commercialPlanSnapshot) : null;
  const areaHa = typeof props.context.areaHa === "number" ? props.context.areaHa : null;
  const collectedCount = props.points.filter((point) => Boolean(point.collectedAt)).length;
  const operationalSummary = buildProducerResultSummary({
    areaHa: areaHa ?? 0,
    recommendations: recommendations
      .filter((item): item is Recommendation & { inputType: string; quantity: number; unit: string } =>
        typeof item.inputType === "string"
        && typeof item.quantity === "number"
        && Number.isFinite(item.quantity)
        && typeof item.unit === "string",
      )
      .map((item) => ({ inputType: item.inputType, quantity: item.quantity, unit: item.unit })),
  });
  const diagnosticSummaries = summaries.filter((item) => !item.auxiliary);
  const primaryCommercialRow = commercial?.rows.length === 1 ? commercial.rows[0] : null;
  const primaryRecommendation = operationalSummary.rows[0] ?? null;
  const currentCropLabel = (props.context.currentCrop || props.context.nextCrop || "").trim();
  const seasonLabel = (props.context.seasonLabel || "").trim();
  const cropSeasonLabel = currentCropLabel && seasonLabel
    ? seasonLabel.toLocaleLowerCase("pt-BR").includes(currentCropLabel.toLocaleLowerCase("pt-BR"))
      ? seasonLabel
      : currentCropLabel + " " + seasonLabel
    : currentCropLabel || seasonLabel || "—";
  const fertilityYieldGoalLabel = fertilityPlan?.targetYieldDisplay
    ? fertilityPlan.targetYieldDisplay.replace(/\s*\([^)]*\)\s*$/, "")
    : null;
  const hasYieldGoalLabel = props.context.yieldGoal != null || Boolean(fertilityYieldGoalLabel);
  const yieldGoalLabel = props.context.yieldGoal != null
    ? numberPt(Number(props.context.yieldGoal)) + (props.context.yieldGoalUnit ? " " + props.context.yieldGoalUnit : "")
    : fertilityYieldGoalLabel ?? "Não registrada";
  const totalYieldBags = props.context.yieldGoal != null
    && areaHa != null
    && /sc\s*\/\s*ha/i.test(props.context.yieldGoalUnit ?? "")
      ? Math.round(Number(props.context.yieldGoal) * areaHa)
      : null;
  const mapCanUseNdvi = Boolean(
    props.ndviSnapshot
    && props.ndviSnapshot.rasterArchived
    && props.context.fieldId
    && props.boundary,
  );
  const ndviMeanZone = props.ndviSnapshot ? classifyNdviValue(props.ndviSnapshot.meanNdvi) : null;
  const ndviMeanZoneLabel = ndviMeanZone ? VIGOR_ZONE_LABELS[ndviMeanZone] : null;
  const ndviObservedRange = props.ndviSnapshot
    ? numberPt(props.ndviSnapshot.minNdvi, 2) + " a " + numberPt(props.ndviSnapshot.maxNdvi, 2)
    : null;
  const fieldTotalLabel = props.context.fieldName ? "No talhão · " + props.context.fieldName : "No talhão";
  const factRange = (parameterCode: string) => {
    const values = props.facts
      .filter((fact) => fact.parameterCode.trim().toUpperCase() === parameterCode)
      .map((fact) => Number(fact.value))
      .filter((value) => Number.isFinite(value));
    if (!values.length) return null;
    return { min: Math.min(...values), max: Math.max(...values), count: values.length };
  };
  const phRange = factRange("PH");
  const smpRange = factRange("SMP");
  const rangeLabel = (range: { min: number; max: number } | null, decimals = 1) => {
    if (!range) return "—";
    return Math.abs(range.max - range.min) < 0.0001
      ? numberPt(range.min, decimals)
      : numberPt(range.min, decimals) + "–" + numberPt(range.max, decimals);
  };
  const phRangeLabel = rangeLabel(phRange);
  const smpRangeLabel = rangeLabel(smpRange);
  const acidityContextLabel = [
    phRange ? "pH " + phRangeLabel : null,
    smpRange ? "SMP " + smpRangeLabel : null,
  ].filter((item): item is string => Boolean(item)).join(" · ") || "Leitura de acidez não disponível nesta versão";
  const fertilityScopeText = "Recomendação válida para " + cropSeasonLabel
    + (props.context.yieldGoal != null ? " com meta de " + yieldGoalLabel : "")
    + ". Esta dose vale para esta safra e não deve ser repetida automaticamente em cultivos futuros. Mudança de cultura, meta produtiva, safra ou nova análise exige novo cálculo.";
  const nutrientInputByParameter: Record<string, string> = { P: "P2O5", K: "K2O", S: "S", N: "N" };
  const fertilityProfileRows = diagnosticSummaries.map((summary) => {
    const code = summary.code.toUpperCase();
    const distribution = distributionForParameter(props.interpretationRows, summary.code);
    const lowCount = distribution
      .filter((item) => item.key === "MUITO_BAIXO" || item.key === "BAIXO")
      .reduce((sum, item) => sum + item.count, 0);
    const mediumCount = distribution
      .filter((item) => item.key === "MEDIO")
      .reduce((sum, item) => sum + item.count, 0);
    const classifiedCount = distribution.reduce((sum, item) => sum + item.count, 0);

    const soilTone = lowCount > 0 ? "low" : mediumCount > 0 ? "medium" : classifiedCount > 0 ? "high" : "neutral";
    const nutrientInput = nutrientInputByParameter[code] ?? code;
    const recommendation = recommendations.find((item) => (item.inputType ?? "").trim().toUpperCase() === nutrientInput);
    const spatial = spatialNutrientPlan?.nutrients.find((item) => item.nutrient === nutrientInput) ?? null;
    const complement = soilComplementActions.find((item) => item.parameterCode.toUpperCase() === code) ?? null;

    const explicitDose = Boolean(
      recommendation
      && typeof recommendation.quantity === "number"
      && Number.isFinite(recommendation.quantity)
      && recommendation.quantity > 0
      && recommendation.unit
    );
    const spatialDose = Boolean(
      spatial?.status === "POINT_SPECIFIC"
      || (spatial?.status === "UNIFORM" && (spatial.uniformDoseKgPerHa ?? 0) > 0)
    );
    const complementNeedsAction = Boolean(
      complement
      && (complement.status === "LOW_REQUIRES_COMPLEMENT_REVIEW"
        || complement.status === "HETEROGENEOUS_REQUIRES_COMPLEMENT_REVIEW")
    );
    const needsAction = explicitDose || spatialDose || complementNeedsAction;

    let action = "";
    if (recommendation && typeof recommendation.quantity === "number" && recommendation.unit) {
      action = "Aplicar " + numberPt(recommendation.quantity) + " " + recommendation.unit + " de " + (recommendation.inputType ?? nutrientInput).replace("CALCARIO_PRNT100", "PRNT 100%") + ".";
    } else if (spatial?.status === "POINT_SPECIFIC") {
      action = spatial.rangeKgPerHa
        ? "Aplicar por ponto/zona: " + numberPt(spatial.rangeKgPerHa.min) + "–" + numberPt(spatial.rangeKgPerHa.max) + " kg/ha."
        : "Aplicar conforme a decisão por ponto/zona.";
    } else if (spatial?.status === "UNIFORM" && spatial.uniformDoseKgPerHa != null) {
      action = "Aplicar " + numberPt(spatial.uniformDoseKgPerHa) + " kg/ha.";
    } else if (complementNeedsAction && complement) {
      action = complement.action;
    }

    let needLabel = "";
    let needDetail = "";
    let actionTone: "correct" | "complement" | "replenish" | "zone" = "replenish";
    if (spatial?.status === "POINT_SPECIFIC") {
      needLabel = soilTone === "low" || soilTone === "medium" ? "CORRIGIR POR ZONA" : "REPOR POR ZONA";
      needDetail = "A necessidade varia entre os pontos do talhão.";
      actionTone = "zone";
    } else if (complementNeedsAction) {
      needLabel = soilTone === "low" ? "CORRIGIR" : "COMPLEMENTAR";
      needDetail = lowCount > 0
        ? lowCount + " ponto(s) abaixo do desejável."
        : "Há diferença entre pontos que exige complemento direcionado.";
      actionTone = soilTone === "low" ? "correct" : "complement";
    } else if (explicitDose || spatialDose) {
      if (soilTone === "low") {
        needLabel = "CORRIGIR";
        needDetail = lowCount + " ponto(s) abaixo do desejável.";
        actionTone = "correct";
      } else if (soilTone === "medium") {
        needLabel = "COMPLEMENTAR";
        needDetail = mediumCount + " ponto(s) em nível médio para a cultura.";
        actionTone = "complement";
      } else {
        needLabel = "REPOR PARA A SAFRA";
        needDetail = "Reposição/manutenção para " + cropSeasonLabel + (hasYieldGoalLabel ? " · meta " + yieldGoalLabel : "") + ".";
        actionTone = "replenish";
      }
    }

    return {
      code: summary.code,
      label: parameterDisplayLabel(summary.code),
      soilTone,
      needLabel,
      needDetail,
      action,
      actionTone,
      needsAction,
    };
  });

  const fertilityActionRows = fertilityProfileRows
    .filter((item) => item.needsAction)
    .sort((a, b) => {
      const rank: Record<string, number> = { correct: 0, zone: 1, complement: 2, replenish: 3 };
      return (rank[a.actionTone] ?? 9) - (rank[b.actionTone] ?? 9) || a.label.localeCompare(b.label, "pt-BR");
    });
  const fertilityQuietRows = fertilityProfileRows.filter((item) => !item.needsAction);
  const quietNutrientLabels = fertilityQuietRows.map((item) => item.label);
  const nextCropForProfile = currentCropLabel || "a cultura desta safra";

  const limeRecommendation = recommendations.find((item) => /CALCAR|LIME/i.test(item.inputType ?? "")) ?? null;
  const limingMissingInformation = missingInformation.find((item) => /^calagem\b/i.test(item.trim())) ?? null;
  const limingFeature = (() => {
    if (limeRecommendation && typeof limeRecommendation.quantity === "number" && limeRecommendation.unit) {
      return {
        tone: "apply" as const,
        status: "CORRIGIR ACIDEZ",
        dose: numberPt(limeRecommendation.quantity) + " " + limeRecommendation.unit,
        detail: "Dose de calcário registrada na decisão oficial desta safra.",
      };
    }
    if (limingDecision?.status === "SPATIAL") {
      const dose = limingDecision.doseRangeTonHaPrnt100
        ? numberPt(limingDecision.doseRangeTonHaPrnt100.min) + "–" + numberPt(limingDecision.doseRangeTonHaPrnt100.max) + " t/ha"
        : "Dose por ponto/zona";
      return {
        tone: "spatial" as const,
        status: "CORRIGIR POR ZONA",
        dose,
        detail: "A necessidade de calagem varia dentro do talhão. Base técnica: equivalente PRNT 100%.",
      };
    }
    if (limingDecision?.status === "UNIFORM_APPLY") {
      const dose = limingDecision.operationalGeneralDoseTonHaPrnt100 ?? limingDecision.uniformDoseTonHaPrnt100;
      return {
        tone: "apply" as const,
        status: "CORRIGIR ACIDEZ",
        dose: dose != null ? numberPt(dose) + " t/ha" : "Dose oficial registrada",
        detail: "Aplicação uniforme indicada na decisão congelada. Base técnica: equivalente PRNT 100%.",
      };
    }
    if (limingDecision?.status === "UNIFORM_NO_APPLY") {
      return {
        tone: "none" as const,
        status: "SEM CALAGEM NESTA DECISÃO",
        dose: "0 t/ha",
        detail: "A decisão agronômica congelada concluiu que não há aplicação geral de calcário nesta safra.",
      };
    }
    if (limingDecision?.status === "BLOCKED" && limingLayerRequirement && limingLayerRequirement.status !== "BLOCKED") {
      const dose55 = limingScenarioDose(limingScenario55);
      const dose60 = limingScenarioDose(limingScenario60);
      const general = limingLayerRequirement.operationalGeneralDoseTonHaPrnt100
        ?? limingLayerRequirement.uniformDoseTonHaPrnt100;
      const range = limingLayerRequirement.doseRangeTonHaPrnt100;
      const scenarioDisplay = dose55 != null && dose60 != null
        ? numberPt(dose55) + " t/ha (pH 5,5) · " + numberPt(dose60) + " t/ha (pH 6,0)"
        : null;
      return {
        tone: "pending" as const,
        status: scenarioDisplay ? "REFERÊNCIAS TÉCNICAS · CAMADA 0–20" : "REFERÊNCIA TÉCNICA · CAMADA 0–20",
        dose: scenarioDisplay
          ?? (general != null
            ? numberPt(general) + " t/ha PRNT 100%"
            : range
              ? numberPt(range.min) + "–" + numberPt(range.max) + " t/ha PRNT 100%"
              : "Necessidade por ponto calculada"),
        detail: scenarioDisplay
          ? "Cenários SMP calculados com a mesma amostra integrada 0–20 cm. A escolha do pH-alvo e do protocolo pertence à metodologia de calagem; a RAIZ não escolhe um alvo diferente só para aproximar uma dose esperada."
          : "Cálculo SMP para a camada integrada 0–20 cm, meta pH " + limingLayerRequirement.targetPh
            + ". Método: " + (limingMethodSelection?.selectedMethodId ?? limingLayerRequirement.methodId)
            + ". A profundidade real do laudo foi preservada; esta referência não é convertida silenciosamente em regra moderna de aplicação.",
      };
    }
    if (limingDecision?.status === "BLOCKED") {
      return {
        tone: "pending" as const,
        status: "CALAGEM NÃO CONCLUÍDA",
        dose: "Dose não liberada",
        detail: limingMissingInformation
          ? limingMissingInformation + " Isso não significa ausência de necessidade."
          : "A versão oficial não possui dose de calcário tecnicamente fechada. Isso não significa ausência de necessidade.",
      };
    }
    if (limingDecision?.status === "NOT_APPLICABLE") {
      return {
        tone: "neutral" as const,
        status: "FORA DO ESCOPO DESTA DECISÃO",
        dose: "Sem dose",
        detail: "O perfil agronômico congelado nesta versão não liberou uma decisão de calagem.",
      };
    }
    return {
      tone: "pending" as const,
      status: "DECISÃO NÃO REGISTRADA NESTA VERSÃO",
      dose: "Sem dose congelada",
      detail: limingMissingInformation
        ? limingMissingInformation + " A ausência de dose não significa que o talhão não precise de calcário."
        : "Esta publicação não contém uma decisão de calagem. A ausência de dose não significa que o talhão não precise de calcário.",
    };
  })();
  const quietProfileLabels = quietNutrientLabels;

  const producerPlanRows: Array<{
    key: string;
    label: string;
    dose: string;
    detail: string | null;
    tone: "apply" | "none" | "pending";
  }> = operationalSummary.rows.map((row) => ({
    key: "recommendation-" + row.inputType,
    label: row.label,
    dose: numberPt(row.doseQuantity) + " " + row.doseUnit,
    detail: row.totalQuantity != null && row.totalUnit
      ? numberPt(row.totalQuantity) + " " + row.totalUnit + " equivalentes na área"
      : null,
    tone: "apply",
  }));

  const hasLimePlanRow = operationalSummary.rows.some(
    (row) => row.quantityKind === "LIME_PRNT100_EQUIVALENT" || /CALCAR|LIME/i.test(row.inputType),
  );
  if (!hasLimePlanRow && limingDecision?.status === "UNIFORM_APPLY") {
    const limeDose = limingDecision.operationalGeneralDoseTonHaPrnt100 ?? limingDecision.uniformDoseTonHaPrnt100;
    producerPlanRows.push({
      key: "lime-uniform",
      label: "Calcário",
      dose: limeDose != null ? numberPt(limeDose) + " t/ha PRNT 100%" : "Dose determinística congelada",
      detail: "Correção da acidez para esta safra.",
      tone: "apply",
    });
  } else if (!hasLimePlanRow && limingDecision?.status === "SPATIAL") {
    producerPlanRows.push({
      key: "lime-spatial",
      label: "Calcário",
      dose: limingDecision.doseRangeTonHaPrnt100
        ? numberPt(limingDecision.doseRangeTonHaPrnt100.min) + "–" + numberPt(limingDecision.doseRangeTonHaPrnt100.max) + " t/ha PRNT 100%"
        : "Aplicação por ponto/zona",
      detail: "Usar a decisão espacial; não converter a faixa em taxa uniforme simples.",
      tone: "apply",
    });
  } else if (!hasLimePlanRow && limingDecision?.status === "UNIFORM_NO_APPLY") {
    producerPlanRows.push({
      key: "lime-no-apply",
      label: "Calcário",
      dose: "Não aplicar nesta safra",
      detail: "A decisão de calagem está fechada sem necessidade de aplicação.",
      tone: "none",
    });
  } else if (
    !hasLimePlanRow
    && limingDecision?.status === "BLOCKED"
    && limingLayerRequirement
    && limingLayerRequirement.status !== "BLOCKED"
  ) {
    const general = limingLayerRequirement.operationalGeneralDoseTonHaPrnt100
      ?? limingLayerRequirement.uniformDoseTonHaPrnt100;
    const range = limingLayerRequirement.doseRangeTonHaPrnt100;
    const dose55 = limingScenarioDose(limingScenario55);
    const dose60 = limingScenarioDose(limingScenario60);
    const scenarioDisplay = dose55 != null && dose60 != null
      ? "pH 5,5: " + numberPt(dose55) + " t/ha · pH 6,0: " + numberPt(dose60) + " t/ha"
      : null;
    producerPlanRows.push({
      key: "lime-integrated-020-reference",
      label: "Calcário · referência 0–20",
      dose: scenarioDisplay
        ?? (general != null
          ? numberPt(general) + " t/ha PRNT 100%"
          : range
            ? numberPt(range.min) + "–" + numberPt(range.max) + " t/ha PRNT 100%"
            : "Necessidade por ponto calculada"),
      detail: scenarioDisplay
        ? "Cenários equivalentes PRNT 100% calculados com a camada integrada 0–20. Definir o protocolo/pH-alvo aplicável antes de converter para o produto comercial."
        : "Necessidade equivalente da camada integrada 0–20 cm pelo SMP. O método de aplicação do manejo atual permanece identificado separadamente.",
      tone: "pending",
    });
  } else if (
    !hasLimePlanRow
    && (!limingDecision || limingDecision.status === "BLOCKED" || limingDecision.status === "NOT_APPLICABLE")
  ) {
    producerPlanRows.push({
      key: "lime-unresolved",
      label: "Calcário",
      dose: limingDecision?.status === "BLOCKED"
        ? "Decisão de calagem não concluída"
        : "Decisão não registrada nesta versão",
      detail: limingMissingInformation
        ? limingMissingInformation + " A ausência de dose não significa ausência de necessidade."
        : limingDecision?.status === "BLOCKED"
          ? "A ausência de dose não significa ausência de necessidade; esta decisão precisa ser concluída no fluxo técnico."
          : "Esta publicação não possui uma decisão de calagem congelada. A ausência de dose não significa ausência de necessidade.",
      tone: "pending",
    });
  }

  const producerPlanText = producerPlanRows
    .map((row) => row.label + ": " + row.dose)
    .join("; ");

  const plainProducerOpinion = producerPlanRows.length
    ? "Para " + (props.context.fieldName || "esta área") + ", nesta safra, o plano é " + producerPlanText + ". "
      + (commercial?.rows.length
        ? "Os produtos comerciais congelados devem ser executados conforme o cenário aprovado."
        : "As doses de nutrientes são necessidades agronômicas; a fonte comercial deve respeitar o teor do produto escolhido.")
    : "Para " + (props.context.fieldName || "esta área") + ", nenhuma aplicação geral foi indicada para esta safra.";

  /* legacy branch kept out of rendering: */
  const _legacyProducerOpinion = commercial?.rows.length
    ? "Para " + (props.context.fieldName || "esta área") + ", o plano comercial congelado usa "
      + commercial.rows.map((row) => numberPt(row.doseQuantity, 4) + " " + row.doseUnit + " de " + row.productName).join(" e ")
      + ". Antes da operação, confira produto, teor e posicionamento."
    : operationalSummary.rows.length
      ? "Para " + (props.context.fieldName || "esta área") + ", a necessidade aprovada é "
        + operationalSummary.rows.map((row) => numberPt(row.doseQuantity) + " " + row.doseUnit + " de " + row.label).join(" e ")
        + ". Isso ainda não representa o peso de um fertilizante comercial."
      : "Ainda não existe uma dose geral segura para " + (props.context.fieldName || "esta área") + ". Resolva as pendências indicadas antes de definir produto e quantidade.";
  void _legacyProducerOpinion;

  return (
    <article className="concept-report">
      <section className="concept-report-page concept-cover-page">
        <div className="concept-brand-row">
          <div className="concept-partner-brand">
            {props.branding.logoDataUrl
              ? <ReportBrand branding={props.branding} />
              : <><strong>{props.branding.displayName || "Empresa parceira"}</strong><small>MARCA DA EMPRESA</small></>}
          </div>
          <div className="concept-raiz-brand"><BrandLogo variant="light" /></div>
        </div>

        <div className="concept-cover-title concept-cover-title-approved">
          <span>RELATÓRIO</span>
          <h1>AGRONÔMICO</h1>
          <p>Do solo à decisão.</p>
        </div>

        <div className="concept-cover-identification">
          <span>IDENTIFICAÇÃO DA ÁREA</span>
          <div className="concept-cover-meta concept-cover-meta-identified">
            <div><span>PRODUTOR</span><strong>{props.context.clientName || "—"}</strong></div>
            <div><span>PROPRIEDADE</span><strong>{props.context.propertyName || "—"}</strong></div>
            <div><span>TALHÃO</span><strong>{props.context.fieldName || "—"}</strong></div>
            <div><span>MUNICÍPIO / UF</span><strong>{[props.context.municipality, props.context.state].filter(Boolean).join(" / ") || "—"}</strong></div>
            <div><span>CULTURA / SAFRA</span><strong>{cropSeasonLabel}</strong></div>
            <div><span>ÁREA</span><strong>{areaHa != null ? numberPt(areaHa) + " ha" : "—"}</strong></div>
          </div>
        </div>

        <div className="concept-cover-map">
          <div className="concept-map-frame concept-map-frame-cover">
            {mapCanUseNdvi ? (
              <PublishedNdviMap
                fieldId={props.context.fieldId!}
                capturedAt={props.ndviSnapshot!.capturedAt}
                boundary={props.boundary as any}
                points={props.points}
                height={430}
                showLegend={false}
                eager
                showHint={false}
              />
            ) : (
              <SpatialOverview boundary={props.boundary} points={props.points} />
            )}
          </div>
        </div>

        <footer className="concept-page-footer"><span>RAIZ DIGITAL • DO SOLO À DECISÃO</span><b>1 / 5</b></footer>
      </section>

      <section className="concept-report-page">
        <div className="concept-section-header">
          <ConceptMiniBrands branding={props.branding} />
          <span>01 / VISÃO GERAL</span>
        </div>
        <div className="concept-page-heading concept-page-heading-approved"><span>A ÁREA EM UMA</span><h2>VISÃO</h2></div>

        <div className="concept-map-shell concept-map-shell-overview">
          <div className="concept-map-frame concept-map-frame-overview">
            {mapCanUseNdvi ? (
              <PublishedNdviMap
                fieldId={props.context.fieldId!}
                capturedAt={props.ndviSnapshot!.capturedAt}
                boundary={props.boundary as any}
                points={props.points}
                height={430}
                showLegend={false}
                eager
                showHint={false}
              />
            ) : (
              <SpatialOverview boundary={props.boundary} points={props.points} />
            )}
            {props.ndviSnapshot && (
              <>
                <span className="concept-map-date">NDVI / {props.ndviSnapshot.capturedAt.slice(0, 10).split("-").reverse().join(".")}</span>
                <span className="concept-map-ndvi"><small>NDVI MÉDIO</small><strong>{numberPt(props.ndviSnapshot.meanNdvi, 2)}</strong></span>
              </>
            )}
          </div>

          <div className="concept-stat-grid concept-stat-grid-approved">
            <div><span>ÁREA</span><strong>{areaHa != null ? numberPt(areaHa) + " ha" : "—"}</strong><small>{props.context.fieldName || "Talhão"}</small></div>
            <div><span>AMOSTRAGEM</span><strong>{props.points.length} pontos</strong><small>{collectedCount ? collectedCount + " coletados" : "Coletas do snapshot"}</small></div>
            <div><span>NDVI MÉDIO</span><strong>{props.ndviSnapshot ? numberPt(props.ndviSnapshot.meanNdvi, 2) : "—"}</strong><small>{props.ndviSnapshot ? (ndviMeanZoneLabel ?? "Vigor médio congelado") : "Sem NDVI congelado"}</small></div>
          </div>
        </div>

        {props.ndviSnapshot && (
          <section className="concept-ndvi-explainer">
            <div className="concept-ndvi-summary">
              <div>
                <span>COMO LER O NDVI</span>
                <strong>{numberPt(props.ndviSnapshot.meanNdvi, 2)} = {ndviMeanZoneLabel?.replace("Vigor ", "vigor ")}</strong>
                <small>Escala teórica de -1 a +1 · faixa observada neste talhão: {ndviObservedRange}.</small>
              </div>
              <p>Quanto maior o NDVI, maior tende a ser a densidade e o vigor da vegetação naquele momento. O índice não mede produtividade sozinho: cultura, estágio, clima e manejo precisam ser considerados.</p>
            </div>
            <div className="concept-ndvi-scale">
              {NDVI_REPORT_SCALE.map((item) => {
                const pct = props.ndviSnapshot?.zoneBreakdownPct?.[item.zone];
                return (
                  <div className={item.cssClass} key={item.zone}>
                    <i />
                    <strong>{VIGOR_ZONE_LABELS[item.zone].replace("Vigor ", "")}</strong>
                    <span>{item.range}{typeof pct === "number" && pct > 0 ? " · " + numberPt(pct, 0) + "%" : ""}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="concept-decision-hero concept-decision-hero-approved">
          <span>DECISÃO EM {commercial ? "PRODUTO" : "NECESSIDADE AGRONÔMICA"}</span>
          {primaryCommercialRow ? (
            <div className="concept-decision-split">
              <div><strong>{numberPt(primaryCommercialRow.doseQuantity, 4)} {primaryCommercialRow.doseUnit}</strong><small>{primaryCommercialRow.productName}</small></div>
              <div><strong>{commercialTotalDisplay(primaryCommercialRow.totalQuantity, primaryCommercialRow.totalUnit)}</strong><small>{fieldTotalLabel}</small></div>
            </div>
          ) : commercial && commercial.rows.length > 1 ? (
            <div className="concept-decision-split">
              <div><strong>{commercial.rows.length} produtos</strong><small>Plano comercial congelado</small></div>
              <div><strong>{commercial.rows.map((row) => row.productName).join(" + ")}</strong><small>Doses detalhadas nas páginas seguintes</small></div>
            </div>
          ) : primaryRecommendation ? (
            <div className="concept-decision-split">
              <div><strong>{numberPt(primaryRecommendation.doseQuantity)} {primaryRecommendation.doseUnit}</strong><small>{primaryRecommendation.label}</small></div>
              <div><strong>{primaryRecommendation.totalQuantity != null && primaryRecommendation.totalUnit ? numberPt(primaryRecommendation.totalQuantity) + " " + primaryRecommendation.totalUnit : "—"}</strong><small>{fieldTotalLabel}</small></div>
            </div>
          ) : (
            <div className="concept-decision-split">
              <div><strong>Sem dose uniforme</strong><small>A evidência não sustentou uma taxa geral.</small></div>
              <div><strong>SEM DECISÃO LIBERADA</strong><small>O laudo oficial não deve ser publicado enquanto uma decisão essencial estiver incompleta.</small></div>
            </div>
          )}
          {!commercial && primaryRecommendation && <small className="concept-hero-footnote">Ainda não é peso de fertilizante comercial: produto e teor precisam estar oficialmente definidos.</small>}
        </div>

        <footer className="concept-page-footer"><span>RAIZ DIGITAL • RELATÓRIO OFICIAL</span><b>2 / 5</b></footer>
      </section>

      <section className="concept-report-page">
        <div className="concept-section-header">
          <ConceptMiniBrands branding={props.branding} />
          <span>02 / DIAGNÓSTICO</span>
        </div>
        <div className="concept-page-heading concept-page-heading-approved"><span>O QUE O SEU SOLO</span><h2>PEDE</h2></div>

        <div className="concept-diagnostic-intro">
          <strong>NECESSIDADES PARA {cropSeasonLabel.toUpperCase()}</strong>
          <span>O foco desta página é mostrar o que precisa ser feito agora. Nutrientes sem ação geral ficam resumidos no final; correção de acidez aparece sempre em bloco próprio.</span>
        </div>

        <section className="concept-soil-needs-summary">
          <article>
            <span>CULTURA / SAFRA</span>
            <strong>{cropSeasonLabel}</strong>
            <small>{hasYieldGoalLabel ? "Meta produtiva · " + yieldGoalLabel : "Meta produtiva não registrada nesta versão"}</small>
          </article>
          <article>
            <span>AÇÕES DEFINIDAS</span>
            <strong>{fertilityActionRows.length}</strong>
            <small>{fertilityActionRows.length === 1 ? "necessidade com ação nesta safra" : "necessidades com ação nesta safra"}</small>
          </article>
          <article>
            <span>ACIDEZ DO SOLO</span>
            <strong>{phRange ? "pH " + phRangeLabel : "Sem faixa de pH"}</strong>
            <small>{smpRange ? "Índice SMP · " + smpRangeLabel : "SMP não disponível nesta versão"}</small>
          </article>
        </section>

        <section className={"concept-needs-card-grid" + (fertilityActionRows.length > 4 ? " is-dense" : "")}>
          {fertilityActionRows.map((item) => (
            <article className={"concept-need-card need-" + item.actionTone} key={item.code}>
              <header>
                <b>{item.code}</b>
                <div><span>{item.label}</span><strong>{item.needLabel}</strong></div>
              </header>
              <p>{item.action}</p>
              <small>{item.needDetail}</small>
            </article>
          ))}
          {fertilityActionRows.length === 0 && (
            <div className="concept-empty-state">Nenhuma reposição ou correção nutricional geral foi registrada para esta safra.</div>
          )}
        </section>

        <section className={"concept-liming-feature liming-" + limingFeature.tone}>
          <div className="concept-liming-copy">
            <span>CORREÇÃO DA ACIDEZ · CALAGEM</span>
            <strong>{limingFeature.status}</strong>
            <p>{limingFeature.detail}</p>
          </div>
          <div className="concept-liming-dose">
            <span>CALCÁRIO</span>
            <strong>{limingFeature.dose}</strong>
            <small>{acidityContextLabel}</small>
          </div>
        </section>

        {quietProfileLabels.length > 0 && (
          <div className="concept-profile-legend concept-profile-legend-roomy">
            <strong>OUTROS PARÂMETROS ACOMPANHADOS</strong>
            <span>{quietProfileLabels.join(", ")}. Foram avaliados, mas não possuem recomendação geral de aplicação para {nextCropForProfile} nesta decisão.</span>
          </div>
        )}

        <div className="concept-profile-explainer concept-profile-explainer-roomy">
          <span><b>CORRIGIR</b> = há correção do solo ou nutriente a fazer.</span>
          <span><b>REPOR PARA A SAFRA</b> = o teor pode estar adequado, mas a cultura exige reposição/manutenção.</span>
          <span><b>CALAGEM</b> = só recebe dose quando a decisão estiver tecnicamente fechada e congelada no relatório.</span>
        </div>

        <div className="concept-scope-strip concept-scope-strip-roomy"><strong>VIGÊNCIA DA RECOMENDAÇÃO</strong><span>{fertilityScopeText}</span></div>
        <footer className="concept-page-footer"><span>RAIZ DIGITAL • RELATÓRIO OFICIAL</span><b>3 / 5</b></footer>
      </section>

      <section className="concept-report-page">
        <div className="concept-section-header">
          <ConceptMiniBrands branding={props.branding} />
          <span>03 / EXECUÇÃO DA SAFRA</span>
        </div>
        <div className="concept-page-heading"><span>COMO EXECUTAR E ACOMPANHAR</span><h2>Aplicação, fertilidade e risco da safra.</h2></div>

        <div className="concept-management-grid">
          <section>
            <span>APLICAÇÃO / POSICIONAMENTO</span>
            <h3>{applicationGuidance?.status === "PLACEMENT_REVIEW_REQUIRED" ? "Rever antes de executar" : "Orientação operacional"}</h3>
            <p>{applicationGuidance?.guidance || "A recomendação não contém orientação adicional de posicionamento nesta versão."}</p>
            {applicationGuidance?.costBenefitNote && <small>{applicationGuidance.costBenefitNote}</small>}
          </section>
          <section>
            <span>PRODUTO COMERCIAL</span>
            <h3>{commercial ? "Cenário congelado" : "Ainda não definido"}</h3>
            {commercial ? commercial.rows.map((row, index) => (
              <p key={row.productName + index}><strong>{row.productName}</strong> · {numberPt(row.doseQuantity, 4)} {row.doseUnit} · total {commercialTotalDisplay(row.totalQuantity, row.totalUnit)}</p>
            )) : <p>A necessidade agronômica está separada do peso do fertilizante. Selecione e congele um cenário comercial para o produto aparecer aqui.</p>}
          </section>
        </div>

        <div className="concept-three-card-grid concept-three-card-grid-compact">
          <section><span>MICRONUTRIENTES</span><h3>{soilComplementActions.length ? "Pontos de atenção" : "Sem dose geral automática"}</h3><p>{soilComplementActions.slice(0,2).map((item) => item.label + ": " + item.action).join(" · ") || "A RAIZ não inventou dose genérica para B, Zn, Cu ou Mn."}</p></section>
          <section><span>BIOLOGIA</span><h3>{biologicalContext?.hasAnyBiology ? "Evidência registrada" : "Sem evidência congelada"}</h3><p>{biologicalContext?.summary || "Biologia isolada não reduz automaticamente N, P, K ou S."}</p></section>
          <section><span>CLIMA / RISCO</span><h3>{agroclimateSnapshot?.status === "READY" ? "Contexto oficial completo" : agroclimateSnapshot?.status === "PARTIAL" ? "Contexto parcial" : "Sem pacote oficial completo"}</h3><p>{climateContext?.status === "PROVIDED" && climateContext.notes ? climateContext.notes : "Clima contextualiza risco e operação; não altera sozinho as doses determinísticas."}</p></section>
        </div>

        <section className="concept-priorities concept-priorities-compact">
          <span>ORDEM DE AÇÃO</span>
          <ol>{management.slice(0, 4).map((item, index) => <li key={index}><b>{index + 1}</b><p>{item}</p></li>)}</ol>
        </section>

        <div className="concept-trace-strip">
          <div><span>BASE TÉCNICA</span><strong>{props.technicalBase || "Motor RAIZ versionado"}</strong></div>
          <div><span>REVISÃO</span><strong>{props.interpretationRevision ?? "—"}</strong></div>
          <div><span>INTEGRIDADE</span><strong>{props.viewingPublished ? "Snapshot verificado" : props.currentStatusLabel}</strong></div>
        </div>
        <footer className="concept-page-footer"><span>RAIZ DIGITAL • RELATÓRIO OFICIAL</span><b>4 / 5</b></footer>
      </section>

      <section className="concept-report-page concept-final-page">
        <div className="concept-section-header">
          <ConceptMiniBrands branding={props.branding} />
          <span>04 / PLANO AO PRODUTOR</span>
        </div>
        <div className="concept-page-heading concept-page-heading-approved"><span>O PLANO PARA O</span><h2>PRODUTOR</h2></div>

        <section className="concept-yield-banner concept-yield-banner-approved concept-yield-banner-primary">
          <span>META PRODUTIVA · {cropSeasonLabel}</span>
          <div><strong>{yieldGoalLabel}</strong>{totalYieldBags != null && <b>{totalYieldBags.toLocaleString("pt-BR")} sacas na área</b>}</div>
          <small>Meta usada no cálculo desta safra. O rendimento final depende também de clima, cultivar, sanidade e manejo.</small>
        </section>

        <section className="concept-producer-plan-card">
          <span>NECESSIDADES PARA BUSCAR ESTA META</span>
          <p className="concept-producer-plan-intro">
            Considerando a análise do solo e as exigências de {currentCropLabel || "esta cultura"}, estas são as correções e reposições indicadas para a safra atual.
          </p>
          <div className="concept-producer-plan-list">
            {producerPlanRows.map((row) => (
              <div className={"concept-producer-plan-row plan-" + row.tone} key={row.key}>
                <div><small>{row.label}</small><strong>{row.dose}</strong></div>
                {row.detail && <p>{row.detail}</p>}
              </div>
            ))}
            {!producerPlanRows.length && (
              <div className="concept-producer-plan-row plan-none">
                <div><small>Aplicações gerais</small><strong>Nenhuma aplicação geral indicada</strong></div>
              </div>
            )}
          </div>
          {!commercial && operationalSummary.rows.some((row) => row.quantityKind === "NUTRIENT_EQUIVALENT") && (
            <small>As doses de nutrientes são necessidades agronômicas. A quantidade do fertilizante comercial depende do teor da fonte escolhida.</small>
          )}
        </section>

        <section className="concept-final-opinion concept-final-opinion-compact">
          <span>PARECER FINAL</span>
          <p>{plainProducerOpinion}</p>
        </section>

        <section className="concept-final-signature">
          <ReportSignature branding={props.branding} />
        </section>

        <div className="concept-final-integrity">
          <Icon name="shield" size={14}/>
          <span>{props.viewingPublished ? "Documento oficial congelado e verificado" : props.currentStatusLabel}{props.publishedHashPrefix ? " · " + props.publishedHashPrefix + "…" : ""}</span>
        </div>
        <footer className="concept-page-footer"><span>RAIZ DIGITAL • MOTOR AGRONÔMICO E RASTREABILIDADE</span><b>5 / 5</b></footer>
      </section>

      {props.showTechnicalAppendix && (
        <section className="concept-technical-appendix">
          <header className="concept-technical-appendix-head">
            <ConceptMiniBrands branding={props.branding} />
            <div>
              <span>ANEXO TÉCNICO</span>
              <h2>Evidências e rastreabilidade completas</h2>
              <p>Este anexo existe somente na visualização técnica. As cinco páginas anteriores permanecem como a entrega simples ao produtor.</p>
            </div>
          </header>

          <div className="concept-technical-meta">
            <div><span>Base técnica</span><strong>{props.technicalBase || "Motor RAIZ versionado"}</strong></div>
            <div><span>Revisão</span><strong>{props.interpretationRevision ?? "—"}</strong></div>
            <div><span>Confiança</span><strong>{props.confidence ? numberPt(props.confidence.score) + " · " + props.confidence.level : "—"}</strong></div>
            <div><span>Estado</span><strong>{props.viewingPublished ? "Snapshot publicado" : props.currentStatusLabel}</strong></div>
          </div>

          <section className="concept-technical-block">
            <h3>Resultados laboratoriais e interpretação</h3>
            <div className="concept-technical-table-wrap">
              <table className="concept-technical-table">
                <thead><tr><th>Amostra</th><th>Profundidade</th><th>Parâmetro</th><th>Resultado</th><th>Método</th><th>Interpretação</th></tr></thead>
                <tbody>
                  {props.facts.map((fact, index) => {
                    const interpreted = props.interpretationRows.find((row) => row.sampleCode === fact.sampleCode && row.parameterCode === fact.parameterCode);
                    return (
                      <tr key={fact.sampleCode + fact.parameterCode + index}>
                        <td>{fact.sampleCode}</td>
                        <td>{typeof fact.depthFromCm === "number" && typeof fact.depthToCm === "number" ? fact.depthFromCm + "–" + fact.depthToCm + " cm" : "—"}</td>
                        <td>{fact.parameterCode}</td>
                        <td>{numberPt(fact.value)} {fact.unit}</td>
                        <td>{fact.method || "—"}</td>
                        <td>{interpreted?.interpretable ? interpreted.classification || "Interpretável" : interpreted?.reason || "Sem classificação congelada"}</td>
                      </tr>
                    );
                  })}
                  {!props.facts.length && <tr><td colSpan={6}>Nenhum resultado laboratorial congelado neste documento.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {(limingMethodSelection || limingLayerRequirement || limingReferenceScenarios.length > 0) && (
            <section className="concept-technical-block">
              <h3>Metodologia de calagem</h3>
              <div className="concept-technical-list">
                <article>
                  <div>
                    <strong>Perfil de amostragem</strong>
                    <b>{limingMethodSelection?.samplingProfile || limingLayerRequirement?.samplingProfile || "Não registrado"}</b>
                  </div>
                  <p>
                    Método selecionado: {limingMethodSelection?.selectedMethodId || limingLayerRequirement?.methodId || "sem método fechado"}.
                    {limingMethodSelection?.scope ? " Escopo: " + limingMethodSelection.scope + "." : ""}
                  </p>
                  <small>
                    {limingMethodSelection?.source
                      ? limingMethodSelection.source.title + " · " + limingMethodSelection.source.year + " · " + limingMethodSelection.source.locator
                      : limingLayerRequirement?.source
                        ? limingLayerRequirement.source.title + " · " + limingLayerRequirement.source.year + " · " + limingLayerRequirement.source.locator
                        : "Fonte metodológica não congelada nesta versão."}
                  </small>
                </article>
                {limingReferenceScenarios
                  .filter((item) => item.status !== "BLOCKED")
                  .map((item) => {
                    const general = item.operationalGeneralDoseTonHaPrnt100 ?? item.uniformDoseTonHaPrnt100;
                    const range = item.doseRangeTonHaPrnt100;
                    return (
                      <article key={"liming-scenario-" + item.targetPh}>
                        <div>
                          <strong>{"SMP · alvo pH " + item.targetPh}</strong>
                          <b>{general != null
                            ? numberPt(general) + " t/ha PRNT 100%"
                            : range
                              ? numberPt(range.min) + "–" + numberPt(range.max) + " t/ha PRNT 100%"
                              : "Por ponto"}</b>
                        </div>
                        <p>{range ? "Faixa entre pontos: " + numberPt(range.min) + "–" + numberPt(range.max) + " t/ha PRNT 100%." : "Sem faixa espacial registrada."}</p>
                        <small>Cenário técnico da camada recebida; o pH-alvo e o método permanecem explícitos para auditoria.</small>
                      </article>
                    );
                  })}
              </div>
            </section>
          )}

          <section className="concept-technical-block">
            <h3>Recomendações completas</h3>
            <div className="concept-technical-list">
              {recommendations.map((item, index) => (
                <article key={(item.inputType || "recomendacao") + index}>
                  <div><strong>{recommendationShortLabel(item.inputType)}</strong><b>{typeof item.quantity === "number" ? numberPt(item.quantity) + " " + (item.unit || "") : "Sem dose quantitativa"}</b></div>
                  <p>{item.rationale || "Sem justificativa adicional congelada."}</p>
                  <small>{[item.timing || item.applicationTiming || item.stage || item.when || item.period, item.via || item.applicationMethod || item.method || item.placement].filter(Boolean).join(" · ") || "Sem orientação operacional adicional."}</small>
                </article>
              ))}
              {!recommendations.length && <p className="concept-technical-empty">Nenhuma recomendação quantitativa congelada.</p>}
            </div>
          </section>

          <div className="concept-technical-columns">
            <section className="concept-technical-block">
              <h3>Manejo completo</h3>
              {management.length ? <ol>{management.map((item, index) => <li key={index}>{item}</li>)}</ol> : <p className="concept-technical-empty">Sem práticas adicionais congeladas.</p>}
            </section>
            <section className="concept-technical-block">
              <h3>Limitações / dados pendentes</h3>
              {missingInformation.length ? <ul>{missingInformation.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="concept-technical-empty">Nenhuma pendência adicional registrada.</p>}
            </section>
          </div>

          {soilComplementActions.length > 0 && (
            <section className="concept-technical-block">
              <h3>Micronutrientes, matéria orgânica e complementos</h3>
              <div className="concept-technical-list">
                {soilComplementActions.map((item, index) => (
                  <article key={item.label + index}><div><strong>{item.label}</strong></div><p>{item.action}</p></article>
                ))}
              </div>
            </section>
          )}

          <section className="concept-technical-block">
            <h3>Pontos de amostragem</h3>
            <div className="concept-technical-table-wrap">
              <table className="concept-technical-table">
                <thead><tr><th>Ponto</th><th>Coordenada efetiva</th><th>Profundidade</th><th>Origem</th><th>Coleta</th></tr></thead>
                <tbody>
                  {props.points.map((point) => {
                    const coordinates = effectivePointCoordinates(point);
                    const kind = pointPositionKind(point);
                    return (
                      <tr key={point.id}>
                        <td>{point.code}</td>
                        <td>{coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}</td>
                        <td>{numberPt(point.depthFromCm)}–{numberPt(point.depthToCm)} cm</td>
                        <td>{kind === "OBSERVED" ? "Observada" : kind === "AUDITED_SOURCE" ? "Fonte auditada" : "Planejada / estimada"}</td>
                        <td>{point.collectedAt ? new Date(point.collectedAt).toLocaleDateString("pt-BR") : "—"}</td>
                      </tr>
                    );
                  })}
                  {!props.points.length && <tr><td colSpan={5}>Nenhum ponto congelado neste documento.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="concept-technical-block">
            <h3>Fontes declaradas na prescrição</h3>
            {prescription?.sources?.length ? (
              <ul>{prescription.sources.map((source, index) => <li key={index}>{[source.title, source.institution].filter(Boolean).join(" — ") || "Fonte sem rótulo"}</li>)}</ul>
            ) : <p className="concept-technical-empty">Nenhuma fonte adicional declarada no payload da prescrição.</p>}
          </section>

          <footer className="concept-technical-footer">
            <span>{props.viewingPublished ? "Snapshot oficial congelado" : "Versão técnica atual"}</span>
            <span>{props.publishedHashPrefix ? "SHA-256 " + props.publishedHashPrefix + "…" : "Sem hash de publicação nesta visualização"}</span>
          </footer>
        </section>
      )}
    </article>
  );
}
