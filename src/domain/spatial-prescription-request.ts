export type SpatialPrescriptionBlocker =
  | "FIELD_BOUNDARY_MISSING"
  | "RELIABLE_SAMPLE_COORDINATES_MISSING"
  | "SPATIAL_METHOD_POLICY_NOT_VALIDATED"
  | "SAMPLE_COUNT_MISSING"
  | "SAMPLE_DEPTH_MISSING"
  | "ANALYTICAL_METHOD_MISSING"
  | "ATTRIBUTE_QUALITY_NOT_VALIDATED"
  | "SAMPLE_DISTRIBUTION_INVALID"
  | "KRIGING_NOT_ALLOWED_WITH_FEW_POINTS"
  | "PROFESSIONAL_SPATIAL_REVIEW_REQUIRED"
  | "CROSS_VALIDATION_REQUIRED";

export type SpatialMethod = "KRIGING" | "IDW" | "THIESSEN" | "NEAREST_NEIGHBOR";
export type SampleDistribution = "DISTRIBUTED" | "COLLINEAR" | "UNKNOWN";

export type SpatialPrescriptionRequestInput = {
  explicitRequested: boolean;
  hasFieldBoundary: boolean;
  hasReliableSampleCoordinates: boolean;
  activeSpatialPolicyId?: string | null;
  sampleCount?: number | null;
  hasSampleDepth?: boolean;
  hasAnalyticalMethod?: boolean;
  attributeQualityValidated?: boolean;
  sampleDistribution?: SampleDistribution;
  requestedSpatialMethod?: SpatialMethod | null;
  professionalSpatialReviewApproved?: boolean;
  crossValidationPassed?: boolean | null;
};

export type SpatialPrescriptionRequestDecision = {
  mode: "UNIFORM" | "VARIABLE_RATE";
  requested: boolean;
  canGenerateVariableRate: boolean;
  blockers: SpatialPrescriptionBlocker[];
  policy: {
    sampleCount: number | null;
    requestedSpatialMethod: SpatialMethod | null;
    interpolationClass: "NONE" | "REVIEW_ONLY" | "CANDIDATE_WITH_CROSS_VALIDATION";
    extrapolationAllowed: false;
    clipToFieldBoundaryRequired: true;
    supportMaskRequired: true;
    noDataMustRemainNoData: true;
  };
};

function basePolicy(input: SpatialPrescriptionRequestInput): SpatialPrescriptionRequestDecision["policy"] {
  const n = Number.isInteger(input.sampleCount) && (input.sampleCount as number) >= 0 ? (input.sampleCount as number) : null;
  const method = input.requestedSpatialMethod ?? null;
  let interpolationClass: SpatialPrescriptionRequestDecision["policy"]["interpolationClass"] = "NONE";
  if (method) interpolationClass = n != null && n >= 100 && method === "KRIGING" ? "CANDIDATE_WITH_CROSS_VALIDATION" : "REVIEW_ONLY";
  return {
    sampleCount: n,
    requestedSpatialMethod: method,
    interpolationClass,
    extrapolationAllowed: false,
    clipToFieldBoundaryRequired: true,
    supportMaskRequired: true,
    noDataMustRemainNoData: true,
  };
}

/**
 * Taxa variável é opt-in. A pesquisa técnica Work acrescentou uma segunda camada de segurança:
 * além de polígono, coordenadas confiáveis e política ACTIVE, o pedido precisa carregar contagem,
 * profundidade, método analítico, qualidade do atributo e distribuição amostral.
 *
 * Política conservadora RAIZ (governança, não “lei agronômica”):
 * - <50 pontos: não ajustar krigagem; Thiessen/NN/IDW somente com revisão profissional explícita;
 * - 50-99: qualquer interpolação permanece sob revisão profissional;
 * - >=100: krigagem pode ser candidata somente com distribuição adequada + validação cruzada aprovada;
 * - colinear/unknown nunca libera krigagem;
 * - extrapolação é sempre false; limite do talhão + máscara de suporte são obrigatórios; NoData não vira zero.
 */
export function evaluateSpatialPrescriptionRequest(
  input: SpatialPrescriptionRequestInput,
): SpatialPrescriptionRequestDecision {
  const policy = basePolicy(input);
  if (!input.explicitRequested) {
    return {
      mode: "UNIFORM",
      requested: false,
      canGenerateVariableRate: false,
      blockers: [],
      policy,
    };
  }

  const blockers: SpatialPrescriptionBlocker[] = [];
  if (!input.hasFieldBoundary) blockers.push("FIELD_BOUNDARY_MISSING");
  if (!input.hasReliableSampleCoordinates) blockers.push("RELIABLE_SAMPLE_COORDINATES_MISSING");
  if (!input.activeSpatialPolicyId?.trim()) blockers.push("SPATIAL_METHOD_POLICY_NOT_VALIDATED");

  const n = policy.sampleCount;
  if (n == null || n <= 0) blockers.push("SAMPLE_COUNT_MISSING");
  if (input.hasSampleDepth !== true) blockers.push("SAMPLE_DEPTH_MISSING");
  if (input.hasAnalyticalMethod !== true) blockers.push("ANALYTICAL_METHOD_MISSING");
  if (input.attributeQualityValidated !== true) blockers.push("ATTRIBUTE_QUALITY_NOT_VALIDATED");
  if (!input.sampleDistribution || input.sampleDistribution === "UNKNOWN" || input.sampleDistribution === "COLLINEAR") {
    blockers.push("SAMPLE_DISTRIBUTION_INVALID");
  }

  const method = input.requestedSpatialMethod ?? null;
  if (!method) blockers.push("PROFESSIONAL_SPATIAL_REVIEW_REQUIRED");
  if (n != null && n > 0 && method === "KRIGING") {
    if (n < 50) blockers.push("KRIGING_NOT_ALLOWED_WITH_FEW_POINTS");
    else if (n < 100) blockers.push("PROFESSIONAL_SPATIAL_REVIEW_REQUIRED");
    else if (input.crossValidationPassed !== true) blockers.push("CROSS_VALIDATION_REQUIRED");
  }

  if (method && method !== "KRIGING" && input.professionalSpatialReviewApproved !== true) {
    blockers.push("PROFESSIONAL_SPATIAL_REVIEW_REQUIRED");
  }

  // Mesmo >=100 pontos não transforma um método/filtro de qualidade em decisão automática.
  // KRIGING só deixa de exigir review adicional quando a política ACTIVE já representa a aprovação
  // profissional do método e a validação cruzada deste conjunto passou. Fallbacks exigem review explícito.
  return {
    mode: "VARIABLE_RATE",
    requested: true,
    canGenerateVariableRate: blockers.length === 0,
    blockers: [...new Set(blockers)],
    policy,
  };
}
