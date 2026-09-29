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

type StructuredFact = {
  sampleCode: string;
  parameterCode: string;
  value: number;
  unit: string;
  method: string;
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
  const diagnosticCodes = summaries.filter((item) => !item.auxiliary).map((item) => item.code);
  const primaryCommercialRow = commercial?.rows.length === 1 ? commercial.rows[0] : null;
  const primaryRecommendation = operationalSummary.rows[0] ?? null;
  const currentCropLabel = (props.context.currentCrop || "").trim();
  const seasonLabel = (props.context.seasonLabel || "").trim();
  const cropSeasonLabel = currentCropLabel && seasonLabel
    ? seasonLabel.toLocaleLowerCase("pt-BR").includes(currentCropLabel.toLocaleLowerCase("pt-BR"))
      ? seasonLabel
      : currentCropLabel + " " + seasonLabel
    : currentCropLabel || seasonLabel || "—";
  const yieldGoalLabel = props.context.yieldGoal != null
    ? numberPt(Number(props.context.yieldGoal)) + (props.context.yieldGoalUnit ? " " + props.context.yieldGoalUnit : "")
    : "Meta não congelada";
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
  const hasValidationPending = missingInformation.length > 0;
  const currentFertilityStage = fertilityPlan?.stages.find((stage) => stage.kind === "CURRENT_CULTIVATION") ?? null;
  const fertilityScopeText = fertilityPlan
    ? "Escopo das doses: " + (currentFertilityStage?.label ?? "cultivo atual")
      + ". O 2º cultivo usa a regra específica correspondente e uma nova análise é obrigatória após "
      + fertilityPlan.reanalysisAfterCultivations + " cultivos. Horizonte de " + fertilityPlan.horizonYears
      + " anos é planejamento, não repetição automática desta dose."
    : "Escopo das doses: cultivo atual desta análise. Mudança de safra, cultura ou evidência exige novo cálculo.";
  const hasLimeRecommendation = recommendations.some((item) => /CALCAR|LIME/i.test(item.inputType ?? ""));
  const plainProducerOpinion = commercial?.rows.length
    ? "Para " + (props.context.fieldName || "esta área") + ", o plano comercial congelado usa "
      + commercial.rows.map((row) => numberPt(row.doseQuantity, 4) + " " + row.doseUnit + " de " + row.productName).join(" e ")
      + ". Antes da operação, confira produto, teor e posicionamento."
    : operationalSummary.rows.length
      ? "Para " + (props.context.fieldName || "esta área") + ", a necessidade aprovada é "
        + operationalSummary.rows.map((row) => numberPt(row.doseQuantity) + " " + row.doseUnit + " de " + row.label).join(" e ")
        + ". Isso ainda não representa o peso de um fertilizante comercial."
      : "Ainda não existe uma dose geral segura para " + (props.context.fieldName || "esta área") + ". Resolva as pendências indicadas antes de definir produto e quantidade.";

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

        <div className="concept-cover-map">
          <div className="concept-map-frame concept-map-frame-cover">
            {mapCanUseNdvi ? (
              <PublishedNdviMap
                fieldId={props.context.fieldId!}
                capturedAt={props.ndviSnapshot!.capturedAt}
                boundary={props.boundary as any}
                points={props.points}
                height={470}
                showLegend={false}
                eager
                showHint={false}
              />
            ) : (
              <SpatialOverview boundary={props.boundary} points={props.points} />
            )}
          </div>
        </div>

        <div className="concept-cover-meta">
          <div><span>ÁREA</span><strong>{props.context.fieldName || "Talhão"}</strong></div>
          <div><span>CULTURA / SAFRA</span><strong>{cropSeasonLabel}</strong></div>
          <div><span>HECTARES</span><strong>{areaHa != null ? numberPt(areaHa) + " ha" : "—"}</strong></div>
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
            <div><span>NDVI</span><strong>{props.ndviSnapshot ? numberPt(props.ndviSnapshot.meanNdvi, 2) : "—"}</strong><small>{props.ndviSnapshot ? "Vigor médio congelado" : "Sem NDVI congelado"}</small></div>
          </div>
        </div>

        <div className="concept-decision-hero concept-decision-hero-approved">
          <span>DECISÃO EM {commercial ? "PRODUTO" : "NECESSIDADE AGRONÔMICA"}</span>
          {primaryCommercialRow ? (
            <div className="concept-decision-split">
              <div><strong>{numberPt(primaryCommercialRow.doseQuantity, 4)} {primaryCommercialRow.doseUnit}</strong><small>{primaryCommercialRow.productName}</small></div>
              <div><strong>{commercialTotalDisplay(primaryCommercialRow.totalQuantity, primaryCommercialRow.totalUnit)}</strong><small>Total para a área</small></div>
            </div>
          ) : commercial && commercial.rows.length > 1 ? (
            <div className="concept-decision-split">
              <div><strong>{commercial.rows.length} produtos</strong><small>Plano comercial congelado</small></div>
              <div><strong>{commercial.rows.map((row) => row.productName).join(" + ")}</strong><small>Doses detalhadas nas páginas seguintes</small></div>
            </div>
          ) : primaryRecommendation ? (
            <div className="concept-decision-split">
              <div><strong>{numberPt(primaryRecommendation.doseQuantity)} {primaryRecommendation.doseUnit}</strong><small>{primaryRecommendation.label}</small></div>
              <div><strong>{primaryRecommendation.totalQuantity != null && primaryRecommendation.totalUnit ? numberPt(primaryRecommendation.totalQuantity) + " " + primaryRecommendation.totalUnit : "—"}</strong><small>Equivalente na área</small></div>
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
        <div className="concept-page-heading concept-page-heading-approved"><span>O QUE O SOLO</span><h2>REVELA</h2></div>

        <section className="concept-diagnostic-card concept-diagnostic-card-approved">
          <div className="concept-diagnostic-grid">
            {diagnosticCodes.map((code) => {
              const distribution = distributionForParameter(props.interpretationRows, code);
              const total = distribution.reduce((sum, item) => sum + item.count, 0);
              return (
                <div className="concept-diagnostic-row concept-diagnostic-row-approved" key={code}>
                  <div className="concept-parameter-badge">{code}</div>
                  <div className="concept-diagnostic-content">
                    <div className="concept-diagnostic-row-head">
                      <strong>{code === "P" ? "FÓSFORO" : code === "K" ? "POTÁSSIO" : code === "B" ? "BORO" : code === "S" ? "ENXOFRE" : code}</strong>
                      <small>{distribution.map((item) => item.count + " " + item.label.toLowerCase()).join(" • ") || "Sem classificação consolidada"}</small>
                    </div>
                    <div className="concept-distribution-bar">
                      {distribution.map((item) => <i key={item.key} className={"tone-" + item.tone} style={{ width: total ? (item.count / total * 100) + "%" : "0%" }} />)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="concept-scope-strip"><strong>VIGÊNCIA DA RECOMENDAÇÃO</strong><span>{fertilityScopeText}</span></div>

        <div className="concept-decision-grid">
          {recommendations.map((item, index) => {
            const operational = producerRow(item, areaHa);
            return (
              <section className="concept-decision-card" key={(item.inputType || "rec") + index}>
                <span>{recommendationShortLabel(item.inputType).toUpperCase()}</span>
                <h3>{typeof item.quantity === "number" ? numberPt(item.quantity) : "—"} {item.unit || ""}{item.inputType ? " de " + item.inputType.replace("CALCARIO_PRNT100", "PRNT 100%") : ""}</h3>
                <p>{operational?.totalQuantity != null && operational.totalUnit ? numberPt(operational.totalQuantity) + " " + operational.totalUnit + " equivalentes no talhão." : "Dose sustentada pelo motor para esta decisão."}</p>
                <b>LIBERADO</b>
              </section>
            );
          })}

          {spatialNutrientPlan?.nutrients.filter((item) => item.status === "POINT_SPECIFIC").map((item) => (
            <section className="concept-decision-card" key={"spatial-" + item.nutrient}>
              <span>{recommendationShortLabel(item.nutrient).toUpperCase()}</span>
              <h3>{item.rangeKgPerHa ? numberPt(item.rangeKgPerHa.min) + "–" + numberPt(item.rangeKgPerHa.max) + " kg/ha" : "Dose por ponto/zona"}</h3>
              <p>{item.purchaseEquivalent ? "Equivalência de compra: " + numberPt(item.purchaseEquivalent.totalKg) + " kg no talhão. Não usar esta média como taxa uniforme." : item.note}</p>
              <b>POR PONTO / ZONA</b>
            </section>
          ))}

          {!hasLimeRecommendation && limingDecision?.status === "UNIFORM_NO_APPLY" && (
            <section className="concept-decision-card" key="lime-no-apply">
              <span>CALCÁRIO</span><h3>Não aplicar</h3>
              <p>O critério determinístico atual não indica calagem para os pontos avaliados.</p>
              <b>DECISÃO FECHADA</b>
            </section>
          )}
          {!hasLimeRecommendation && limingDecision?.status === "SPATIAL" && (
            <section className="concept-decision-card" key="lime-spatial">
              <span>CALCÁRIO</span>
              <h3>{limingDecision.doseRangeTonHaPrnt100 ? numberPt(limingDecision.doseRangeTonHaPrnt100.min) + "–" + numberPt(limingDecision.doseRangeTonHaPrnt100.max) + " t/ha PRNT 100%" : "Dose por ponto"}</h3>
              <p>{limingDecision.automaticGeneralDoseAllowed && limingDecision.operationalGeneralDoseTonHaPrnt100 != null ? "Dose geral operacional: " + numberPt(limingDecision.operationalGeneralDoseTonHaPrnt100) + " t/ha PRNT 100%." : "Aplicar conforme a decisão por ponto/zona; não promover média simples sem suporte de área equivalente."}</p>
              <b>DECISÃO ESPACIAL</b>
            </section>
          )}

          {soilComplementActions.filter((item) => item.parameterCode !== "MO" && item.evaluatedCount > 0).map((item) => (
            <section className="concept-decision-card concept-decision-card-secondary" key={"complement-" + item.parameterCode}>
              <span>{item.label.toUpperCase()}</span>
              <h3>{item.status === "SUFFICIENT_NO_GENERAL_COMPLEMENT" ? "Sem aplicação geral" : "Correção localizada"}</h3>
              <p>{item.action}</p>
              <b>{item.status === "SUFFICIENT_NO_GENERAL_COMPLEMENT" ? "SEM NECESSIDADE GERAL" : "DECISÃO TÉCNICA NECESSÁRIA"}</b>
            </section>
          ))}
        </div>
        <footer className="concept-page-footer"><span>RAIZ DIGITAL • RELATÓRIO OFICIAL</span><b>3 / 5</b></footer>
      </section>

      <section className="concept-report-page">
        <div className="concept-section-header">
          <ConceptMiniBrands branding={props.branding} />
          <span>03 / PLANEJAMENTO TÉCNICO</span>
        </div>
        <div className="concept-page-heading"><span>COMO EXECUTAR E ACOMPANHAR</span><h2>Aplicação, fertilidade e risco.</h2></div>

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

        {fertilityPlan ? (
          <section className="concept-fertility-card concept-fertility-card-compact">
            <div className="concept-fertility-head"><span>HORIZONTE DE FERTILIDADE</span><strong>{fertilityPlan.targetYieldDisplay || yieldGoalLabel}</strong></div>
            {fertilityPlan.stages.slice(0, 3).map((stage) => (
              <div className="concept-fertility-row" key={stage.kind + String(stage.cultivationOrder ?? "")}>
                <div><strong>{stage.label}</strong><small>{stage.rationale}</small></div>
                <b>{stage.status === "REANALYSIS_REQUIRED" ? "NOVA ANÁLISE" : [stage.p2o5KgPerHa != null ? "P₂O₅ " + numberPt(stage.p2o5KgPerHa) : null, stage.k2oKgPerHa != null ? "K₂O " + numberPt(stage.k2oKgPerHa) : null].filter(Boolean).join(" · ") || "PARCIAL"}</b>
              </div>
            ))}
            <small>Reanálise após {fertilityPlan.reanalysisAfterCultivations} cultivo(s). Meta produtiva não é garantia de rendimento.</small>
          </section>
        ) : <div className="concept-empty-state">Plano plurianual não congelado nesta decisão.</div>}

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

        <section className="concept-producer-apply-card">
          <span>{commercial ? "APLICAR" : operationalSummary.rows.length ? "NECESSIDADE APROVADA" : "SEM APLICAÇÃO GERAL"}</span>
          {primaryCommercialRow ? (
            <>
              <strong>{numberPt(primaryCommercialRow.doseQuantity, 4)} {primaryCommercialRow.doseUnit} de {primaryCommercialRow.productName}</strong>
              <b>{commercialTotalDisplay(primaryCommercialRow.totalQuantity, primaryCommercialRow.totalUnit)} na {props.context.fieldName || "área"}</b>
            </>
          ) : commercial && commercial.rows.length > 1 ? (
            <>
              <strong>{commercial.rows.map((row) => numberPt(row.doseQuantity, 4) + " " + row.doseUnit + " de " + row.productName).join(" + ")}</strong>
              <b>{commercial.rows.map((row) => row.productName + ": " + commercialTotalDisplay(row.totalQuantity, row.totalUnit)).join(" · ")}</b>
            </>
          ) : operationalSummary.rows.length ? (
            <>
              <strong>{operationalSummary.rows.map((row) => numberPt(row.doseQuantity) + " " + row.doseUnit + " de " + row.label).join(" · ")}</strong>
              <b>Definir a fonte comercial antes de converter estas necessidades em produto e quantidade a comprar.</b>
              <small>Estas quantidades são necessidades agronômicas equivalentes; não interpretar como peso de fertilizante comercial.</small>
            </>
          ) : (
            <>
              <strong>Nenhuma aplicação uniforme foi indicada nesta decisão.</strong>
              <b>O laudo oficial só é publicado quando as decisões agronômicas essenciais estão fechadas.</b>
            </>
          )}
        </section>

        <section className="concept-yield-banner concept-yield-banner-approved">
          <span>CENÁRIO DE PLANEJAMENTO</span>
          <div><strong>{yieldGoalLabel}</strong>{totalYieldBags != null && <b>{totalYieldBags.toLocaleString("pt-BR")} sacas</b>}</div>
          <small>Meta usada no cálculo. Sujeita a clima, cultivar, sanidade e manejo.</small>
        </section>

        <section className="concept-final-opinion concept-final-opinion-compact">
          <span>PARECER FINAL</span>
          <p>{plainProducerOpinion}</p>
        </section>

        <section className="concept-identification-card concept-identification-card-approved">
          <span>IDENTIFICAÇÃO</span>
          <div className="concept-identification-grid">
            <p><strong>Cliente:</strong> {props.context.clientName || "—"}</p>
            <p><strong>Área:</strong> {areaHa != null ? numberPt(areaHa) + " ha" : "—"}</p>
            <p><strong>Empresa:</strong> {props.branding.displayName || "—"}</p>
            <p><strong>Município / UF:</strong> {[props.context.municipality, props.context.state].filter(Boolean).join(" / ") || "—"}</p>
            <p><strong>Responsável técnico:</strong> {props.responsibleName || props.branding.responsibleName || "—"}</p>
            <p><strong>Registro:</strong> {props.branding.responsibleRegistration || "—"}</p>
          </div>
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
                <thead><tr><th>Amostra</th><th>Parâmetro</th><th>Resultado</th><th>Método</th><th>Interpretação</th></tr></thead>
                <tbody>
                  {props.facts.map((fact, index) => {
                    const interpreted = props.interpretationRows.find((row) => row.sampleCode === fact.sampleCode && row.parameterCode === fact.parameterCode);
                    return (
                      <tr key={fact.sampleCode + fact.parameterCode + index}>
                        <td>{fact.sampleCode}</td>
                        <td>{fact.parameterCode}</td>
                        <td>{numberPt(fact.value)} {fact.unit}</td>
                        <td>{fact.method || "—"}</td>
                        <td>{interpreted?.interpretable ? interpreted.classification || "Interpretável" : interpreted?.reason || "Sem classificação congelada"}</td>
                      </tr>
                    );
                  })}
                  {!props.facts.length && <tr><td colSpan={5}>Nenhum resultado laboratorial congelado neste documento.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

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
