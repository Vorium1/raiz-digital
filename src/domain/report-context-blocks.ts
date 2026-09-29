import { evaluateSoybeanPkFurrowPlacementRsSc2025 } from "./soybean-pk-rs-sc-2025.ts";

export type ReportClimateContext = {
  status: "PROVIDED" | "DECLARED_UNAVAILABLE" | "MISSING";
  notes: string | null;
  source: "ANALYSIS_CONTEXT";
  automaticDoseAdjustmentAllowed: false;
};

export type ReportBiologicalContext = {
  hasAnyBiology: boolean;
  hasBioAsEvidence: boolean;
  coreBioAsComplete: boolean;
  officialBioAsInterpretationAvailable: boolean;
  hasMicrobiologyEvidence: boolean;
  microbiologyObservationCount: number;
  detectedFunctionalRoles: string[];
  warnings: string[];
  automaticNutrientCreditAllowed: false;
  automaticDoseAdjustmentAllowed: false;
  summary: string | null;
};

export type ReportApplicationGuidance = {
  cropCode: string | null;
  status: "NOT_APPLICABLE" | "DOSE_NOT_READY" | "PLACEMENT_REVIEW_REQUIRED" | "WITHIN_UNKNOWN_OFFSET_LIMITS";
  assessmentBasis: "UNIFORM" | "POINT_RANGE_MAX" | "NOT_READY";
  p2o5KgPerHa: number | null;
  k2oKgPerHa: number | null;
  p2o5RangeKgPerHa: { min: number; max: number } | null;
  k2oRangeKgPerHa: { min: number; max: number } | null;
  limitsWithoutSafeOffsetKgHa: { P2O5: number; K2O: number } | null;
  blockers: string[];
  guidance: string;
  costBenefitNote: string;
};

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function climateContextFromAnalysisContext(value: unknown): ReportClimateContext {
  const empty: ReportClimateContext = {
    status: "MISSING",
    notes: null,
    source: "ANALYSIS_CONTEXT",
    automaticDoseAdjustmentAllowed: false,
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  const draft = (value as { draft?: unknown }).draft;
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return empty;
  const source = draft as Record<string, unknown>;
  const status = source.weatherContextStatus === "PROVIDED"
    || source.weatherContextStatus === "DECLARED_UNAVAILABLE"
    || source.weatherContextStatus === "MISSING"
    ? source.weatherContextStatus
    : "MISSING";
  return {
    status,
    notes: textOrNull(source.weatherContextNotes),
    source: "ANALYSIS_CONTEXT",
    automaticDoseAdjustmentAllowed: false,
  };
}

export function buildReportBiologicalContext(input: {
  biologicalSoilEvidence: {
    hasAnyBiology?: boolean;
    coreBioAs?: { complete?: boolean } | null;
    interpretation?: { officialLabInterpretationAvailable?: boolean } | null;
    warnings?: string[];
  } | null | undefined;
  soilMicrobiologyEvidence: {
    hasMicrobiologyEvidence?: boolean;
    observations?: unknown[];
    detectedFunctionalRoles?: string[];
    warnings?: string[];
  } | null | undefined;
}): ReportBiologicalContext {
  const bioAs = input.biologicalSoilEvidence;
  const microbiology = input.soilMicrobiologyEvidence;
  const hasBioAsEvidence = bioAs?.hasAnyBiology === true;
  const hasMicrobiologyEvidence = microbiology?.hasMicrobiologyEvidence === true;
  const observationCount = Array.isArray(microbiology?.observations) ? microbiology!.observations!.length : 0;
  const roles = Array.isArray(microbiology?.detectedFunctionalRoles)
    ? [...new Set(microbiology!.detectedFunctionalRoles!.filter(Boolean))]
    : [];
  const warnings = [...new Set([
    ...(bioAs?.warnings ?? []),
    ...(microbiology?.warnings ?? []),
  ])];

  let summary: string | null = null;
  if (hasBioAsEvidence || hasMicrobiologyEvidence) {
    const parts: string[] = [];
    if (hasBioAsEvidence) {
      parts.push(
        bioAs?.interpretation?.officialLabInterpretationAvailable
          ? "Há evidência BioAS com interpretação laboratorial oficial preservada."
          : "Há evidência biológica/BioAS; índices ou classes só são usados quando vierem do laboratório ou de algoritmo oficial versionado.",
      );
    }
    if (hasMicrobiologyEvidence) {
      parts.push(
        observationCount > 0
          ? `Há ${observationCount} observação(ões) microbiológica(s) registrada(s).`
          : "Há evidência microbiológica registrada.",
      );
    }
    if (roles.length) parts.push(`Funções/grupos detectados: ${roles.join(", ")}.`);
    parts.push("Biologia, isoladamente, não gera crédito automático de N/P/K/S nem altera dose de fertilizante/corretivo.");
    summary = parts.join(" ");
  }

  return {
    hasAnyBiology: hasBioAsEvidence || hasMicrobiologyEvidence,
    hasBioAsEvidence,
    coreBioAsComplete: bioAs?.coreBioAs?.complete === true,
    officialBioAsInterpretationAvailable: bioAs?.interpretation?.officialLabInterpretationAvailable === true,
    hasMicrobiologyEvidence,
    microbiologyObservationCount: observationCount,
    detectedFunctionalRoles: roles,
    warnings,
    automaticNutrientCreditAllowed: false,
    automaticDoseAdjustmentAllowed: false,
    summary,
  };
}

export function buildSoybeanApplicationGuidance(input: {
  cropCode: string | null | undefined;
  state: string | null | undefined;
  p2o5KgPerHa: number | null | undefined;
  k2oKgPerHa: number | null | undefined;
  p2o5RangeKgPerHa?: { min: number; max: number } | null;
  k2oRangeKgPerHa?: { min: number; max: number } | null;
}): ReportApplicationGuidance {
  const cropCode = input.cropCode?.trim().toUpperCase() || null;
  const pRange = input.p2o5RangeKgPerHa ?? null;
  const kRange = input.k2oRangeKgPerHa ?? null;

  if (cropCode !== "SOJA") {
    return {
      cropCode,
      status: "NOT_APPLICABLE",
      assessmentBasis: "NOT_READY",
      p2o5KgPerHa: input.p2o5KgPerHa ?? null,
      k2oKgPerHa: input.k2oKgPerHa ?? null,
      p2o5RangeKgPerHa: pRange,
      k2oRangeKgPerHa: kRange,
      limitsWithoutSafeOffsetKgHa: null,
      blockers: [],
      guidance: "Orientação de posicionamento específica desta etapa implementada somente para soja RS/SC.",
      costBenefitNote: "Custo-benefício depende de produto, preço, equipamento e logística declarados; não é inferido sem cenário comercial.",
    };
  }

  const uniformP = typeof input.p2o5KgPerHa === "number" && Number.isFinite(input.p2o5KgPerHa)
    ? input.p2o5KgPerHa
    : null;
  const uniformK = typeof input.k2oKgPerHa === "number" && Number.isFinite(input.k2oKgPerHa)
    ? input.k2oKgPerHa
    : null;
  const rangeP = pRange && Number.isFinite(pRange.max) ? pRange.max : null;
  const rangeK = kRange && Number.isFinite(kRange.max) ? kRange.max : null;
  const plannedP = uniformP ?? rangeP;
  const plannedK = uniformK ?? rangeK;
  const assessmentBasis: ReportApplicationGuidance["assessmentBasis"] =
    uniformP != null && uniformK != null
      ? "UNIFORM"
      : plannedP != null && plannedK != null
        ? "POINT_RANGE_MAX"
        : "NOT_READY";

  if (plannedP == null || plannedK == null) {
    return {
      cropCode,
      status: "DOSE_NOT_READY",
      assessmentBasis,
      p2o5KgPerHa: uniformP,
      k2oKgPerHa: uniformK,
      p2o5RangeKgPerHa: pRange,
      k2oRangeKgPerHa: kRange,
      limitsWithoutSafeOffsetKgHa: { P2O5: 120, K2O: 80 },
      blockers: ["PK_DOSE_NOT_READY_FOR_PLACEMENT_REVIEW"],
      guidance: "A dose de P/K precisa estar fechada, como taxa uniforme ou faixa espacial por ponto, antes de avaliar o posicionamento de semeadura.",
      costBenefitNote: "Custo-benefício depende de produto, preço, concentração, equipamento e logística declarados; não é inferido sem cenário comercial.",
    };
  }

  const state = input.state?.trim().toUpperCase();
  const assessment = evaluateSoybeanPkFurrowPlacementRsSc2025({
    region: state === "RS" ? "RS" : state === "SC" ? "SC" : "OTHER",
    placement: "NO_OFFSET_OR_UNKNOWN",
    plannedP2O5KgHa: plannedP,
    plannedK2OKgHa: plannedK,
  });

  const placementBlockers = assessment.blockers.filter((code) =>
    code === "FURROW_P2O5_EXCEEDS_120_WITHOUT_SAFE_OFFSET"
    || code === "FURROW_K2O_EXCEEDS_80_WITHOUT_SAFE_OFFSET"
  );
  const placementReviewRequired = placementBlockers.length > 0;
  const spatialPrefix = assessmentBasis === "POINT_RANGE_MAX"
    ? "Como a recomendação é espacial, esta checagem usa o maior valor da faixa por ponto, não uma média do talhão. "
    : "";

  return {
    cropCode,
    status: placementReviewRequired ? "PLACEMENT_REVIEW_REQUIRED" : "WITHIN_UNKNOWN_OFFSET_LIMITS",
    assessmentBasis,
    p2o5KgPerHa: uniformP,
    k2oKgPerHa: uniformK,
    p2o5RangeKgPerHa: pRange,
    k2oRangeKgPerHa: kRange,
    limitsWithoutSafeOffsetKgHa: assessment.limitsWithoutSafeOffsetKgHa,
    blockers: assessment.blockers,
    guidance: placementReviewRequired
      ? spatialPrefix + "Se P/K forem aplicados no sulco e o afastamento 5 cm abaixo + 5 cm ao lado da semente não estiver confirmado, não colocar a necessidade inteira na linha. A referência limita a 120 kg P₂O₅/ha e 80 kg K₂O/ha nessa condição; o excedente precisa de posicionamento/época segura definidos no plano operacional. Isso não reduz a necessidade agronômica calculada."
      : spatialPrefix + "Com o afastamento 5×5 ainda não informado, os valores avaliados não ultrapassam os limites de P₂O₅/K₂O usados pela referência para sulco sem afastamento seguro confirmado. Produto, salinidade, formulação e regulagem do equipamento ainda precisam ser conferidos.",
    costBenefitNote: "Aplicar em uma ou mais operações é também uma decisão econômica/operacional. O RAIZ só compara custo quando produto, preço, concentração, equipamento e logística estiverem registrados; sem esses dados, não declara que uma aplicação única é mais barata ou melhor.",
  };
}
