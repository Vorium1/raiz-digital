export type SpatialPrescriptionBlocker =
  | "FIELD_BOUNDARY_MISSING"
  | "RELIABLE_SAMPLE_COORDINATES_MISSING"
  | "SPATIAL_METHOD_POLICY_NOT_VALIDATED"
  | "SAMPLE_COUNT_MISSING"
  | "SAMPLE_DEPTH_MISSING"
  | "ANALYTICAL_METHOD_MISSING"
  | "ATTRIBUTE_QUALITY_NOT_VALIDATED"
  | "SAMPLE_DISTRIBUTION_INVALID"
  | "INSUFFICIENT_POINTS_FOR_2D_SURFACE"
  | "EXPLORATORY_ONLY_WITH_FEW_POINTS"
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
    interpolationClass: "NONE" | "EXPLORATORY_ONLY" | "CANDIDATE_REVIEW" | "CANDIDATE_WITH_CROSS_VALIDATION";
    extrapolationAllowed: false;
    clipToFieldBoundaryRequired: true;
    supportMaskRequired: true;
    noDataMustRemainNoData: true;
    finalProfessionalApprovalRequired: true;
    universalRmseThresholdAvailable: false;
  };
};

function basePolicy(input: SpatialPrescriptionRequestInput): SpatialPrescriptionRequestDecision["policy"] {
  const n = Number.isInteger(input.sampleCount) && (input.sampleCount as number) >= 0 ? (input.sampleCount as number) : null;
  const method = input.requestedSpatialMethod ?? null;
  let interpolationClass: SpatialPrescriptionRequestDecision["policy"]["interpolationClass"] = "NONE";
  if (n != null) {
    if (n < 3) interpolationClass = "NONE";
    else if (n < 50) interpolationClass = "EXPLORATORY_ONLY";
    else if (n >= 100 && method === "KRIGING") interpolationClass = "CANDIDATE_WITH_CROSS_VALIDATION";
    else interpolationClass = "CANDIDATE_REVIEW";
  }
  return {
    sampleCount: n,
    requestedSpatialMethod: method,
    interpolationClass,
    extrapolationAllowed: false,
    clipToFieldBoundaryRequired: true,
    supportMaskRequired: true,
    noDataMustRemainNoData: true,
    finalProfessionalApprovalRequired: true,
    universalRmseThresholdAvailable: false,
  };
}

/**
 * Taxa variável é opt-in e fail-closed.
 *
 * A pesquisa A-H de 2026-09-14 separou evidência científica de política conservadora de software:
 * - <3 pontos: não há suporte para superfície 2-D; exibir pontos/uma zona uniforme;
 * - 3-49: pontos, vizinho/Thiessen ou zonas locais podem ser EXPLORATÓRIOS, nunca prescrição;
 * - 50-99: interpolação é apenas candidata e exige revisão profissional explícita;
 * - >=100: krigagem continua candidata, exige distribuição adequada, validação cruzada e aprovação humana;
 * - nenhum número acima é tratado como "lei agronômica"; é política de segurança RAIZ;
 * - não existe threshold universal de RMSE/MAE/ME capaz de aprovar o mapa sozinho;
 * - extrapolação é sempre proibida, o talhão deve ser recortado à máscara de suporte e NoData nunca vira zero.
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

  if (n != null && n > 0 && n < 3) blockers.push("INSUFFICIENT_POINTS_FOR_2D_SURFACE");
  if (n != null && n >= 3 && n < 50) blockers.push("EXPLORATORY_ONLY_WITH_FEW_POINTS");

  if (n != null && n > 0 && method === "KRIGING") {
    if (n < 50) blockers.push("KRIGING_NOT_ALLOWED_WITH_FEW_POINTS");
    if (n >= 100 && input.crossValidationPassed !== true) blockers.push("CROSS_VALIDATION_REQUIRED");
  }

  // Toda prescrição oficial continua humana, inclusive quando n>=100 e a validação cruzada passou.
  if (method && input.professionalSpatialReviewApproved !== true) {
    blockers.push("PROFESSIONAL_SPATIAL_REVIEW_REQUIRED");
  }

  return {
    mode: "VARIABLE_RATE",
    requested: true,
    canGenerateVariableRate: blockers.length === 0,
    blockers: [...new Set(blockers)],
    policy,
  };
}


export type SpatialEvidenceEnvelopeInput = {
  explicitRequested: boolean;
  hasFieldBoundary: boolean;
  totalPointCount: number;
  reliablePointCount: number;
  reliableLabLinkedPointCount: number;
  distinctReliableLabCoordinateCount: number;
  sampleDistribution: SampleDistribution;
};

export type SpatialEvidenceEnvelope = {
  requested: boolean;
  status:
    | "NOT_REQUESTED"
    | "NO_SPATIAL_EVIDENCE"
    | "POINTS_ONLY"
    | "EXPLORATORY_ONLY"
    | "INTERPOLATION_CANDIDATE";
  automaticInterpolationAllowed: false;
  automaticVariableRateAllowed: false;
  evidence: {
    hasFieldBoundary: boolean;
    totalPointCount: number;
    reliablePointCount: number;
    reliableLabLinkedPointCount: number;
    distinctReliableLabCoordinateCount: number;
    sampleDistribution: SampleDistribution;
  };
  limitations: string[];
};

/**
 * Envelope estrutural progressivo antes de escolher atributo/método.
 *
 * Ele responde somente "o que a geometria + vínculo laboratorial já sustentam?".
 * Não escolhe parâmetro, interpolador, variograma, RMSE ou dose e, portanto,
 * nunca libera taxa variável automaticamente.
 */
export function evaluateSpatialEvidenceEnvelope(
  input: SpatialEvidenceEnvelopeInput,
): SpatialEvidenceEnvelope {
  const evidence = {
    hasFieldBoundary: input.hasFieldBoundary,
    totalPointCount: Math.max(0, Math.trunc(input.totalPointCount)),
    reliablePointCount: Math.max(0, Math.trunc(input.reliablePointCount)),
    reliableLabLinkedPointCount: Math.max(0, Math.trunc(input.reliableLabLinkedPointCount)),
    distinctReliableLabCoordinateCount: Math.max(0, Math.trunc(input.distinctReliableLabCoordinateCount)),
    sampleDistribution: input.sampleDistribution,
  };
  const base = {
    requested: input.explicitRequested,
    automaticInterpolationAllowed: false as const,
    automaticVariableRateAllowed: false as const,
    evidence,
  };

  if (!input.explicitRequested) {
    return { ...base, status: "NOT_REQUESTED" as const, limitations: [] };
  }

  const limitations: string[] = [];
  if (!input.hasFieldBoundary) limitations.push("FIELD_BOUNDARY_MISSING");
  if (evidence.reliablePointCount < evidence.totalPointCount) limitations.push("UNRELIABLE_COORDINATES_EXCLUDED");
  if (evidence.reliableLabLinkedPointCount < evidence.reliablePointCount) limitations.push("POINTS_WITHOUT_LAB_EVIDENCE_EXCLUDED");
  if (evidence.distinctReliableLabCoordinateCount < evidence.reliableLabLinkedPointCount) limitations.push("DUPLICATE_SPATIAL_SUPPORT_EXCLUDED");

  const n = evidence.distinctReliableLabCoordinateCount;
  if (!input.hasFieldBoundary || n === 0) {
    return {
      ...base,
      status: "NO_SPATIAL_EVIDENCE" as const,
      limitations: [...limitations, "RELIABLE_LAB_LINKED_SPATIAL_SUPPORT_MISSING"],
    };
  }

  if (n < 3) {
    return {
      ...base,
      status: "POINTS_ONLY" as const,
      limitations: [...limitations, "INSUFFICIENT_POINTS_FOR_2D_SURFACE"],
    };
  }

  if (input.sampleDistribution === "COLLINEAR") {
    return {
      ...base,
      status: "POINTS_ONLY" as const,
      limitations: [...limitations, "SAMPLE_DISTRIBUTION_COLLINEAR"],
    };
  }

  if (input.sampleDistribution !== "DISTRIBUTED") {
    return {
      ...base,
      status: "POINTS_ONLY" as const,
      limitations: [...limitations, "SAMPLE_DISTRIBUTION_REVIEW_REQUIRED"],
    };
  }

  if (n < 50) {
    return {
      ...base,
      status: "EXPLORATORY_ONLY" as const,
      limitations: [...limitations, "EXPLORATORY_ONLY_WITH_FEW_POINTS"],
    };
  }

  return {
    ...base,
    status: "INTERPOLATION_CANDIDATE" as const,
    limitations: [
      ...limitations,
      "TARGET_ATTRIBUTE_AND_METHOD_SELECTION_REQUIRED",
      "PROFESSIONAL_SPATIAL_REVIEW_REQUIRED",
    ],
  };
}
