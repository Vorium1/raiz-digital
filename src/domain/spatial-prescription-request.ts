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
  | "CROSS_VALIDATION_REQUIRED"
  | "INTERPOLATION_VALIDATION_REQUIRED"
  | "INTERPOLATION_VALIDATION_METHOD_MISMATCH";

export type SpatialMethod = "KRIGING" | "IDW" | "THIESSEN" | "NEAREST_NEIGHBOR";
export type SampleDistribution = "DISTRIBUTED" | "COLLINEAR" | "UNKNOWN";

export type SpatialCrossValidationEvidence = {
  strategy: "LOOCV" | "KFOLD" | "HOLDOUT";
  validationCount: number;
  rmse: number | null;
  mae: number | null;
  meanError: number | null;
};

export type SpatialVariogramEvidence = {
  model: "SPHERICAL" | "EXPONENTIAL" | "GAUSSIAN" | "MATERN" | "OTHER_VALIDATED";
  nugget: number | null;
  sill: number | null;
  range: number | null;
  experimentalLagCount?: number | null;
};

export type SpatialInterpolationValidationInput = {
  method: SpatialMethod;
  sampleCount: number;
  crossValidation?: SpatialCrossValidationEvidence | null;
  variogram?: SpatialVariogramEvidence | null;
  professionalMethodReviewApproved?: boolean;
};

export type SpatialInterpolationValidationDecision = {
  method: SpatialMethod;
  status: "INVALID_EVIDENCE" | "EVIDENCE_INCOMPLETE" | "REVIEW_REQUIRED" | "VALIDATED_FOR_OFFICIAL_SURFACE";
  officialSurfaceAllowed: boolean;
  automaticMethodSelectionAllowed: false;
  automaticVariableRateAllowed: false;
  crossValidation: SpatialCrossValidationEvidence | null;
  variogram: SpatialVariogramEvidence | null;
  blockers: string[];
  policy: {
    crossValidationRequired: true;
    krigingVariogramRequired: boolean;
    universalRmseThresholdAvailable: false;
    universalMaeThresholdAvailable: false;
    universalMeanErrorThresholdAvailable: false;
    professionalMethodReviewRequired: true;
  };
};

function finiteNonNegative(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function finiteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validação do MÉTODO espacial — separada do suporte amostral e da decisão de dose.
 *
 * Não existe corte universal de RMSE/MAE/ME que aprove um mapa sozinho. O RAIZ
 * exige que essas métricas existam, preserva seus valores e exige revisão
 * profissional. Krigagem também exige evidência de variograma.
 */
export function evaluateSpatialInterpolationValidation(
  input: SpatialInterpolationValidationInput,
): SpatialInterpolationValidationDecision {
  const blockers: string[] = [];
  const sampleCount = Number.isInteger(input.sampleCount) && input.sampleCount >= 0
    ? input.sampleCount
    : -1;
  const cv = input.crossValidation ?? null;
  const variogram = input.variogram ?? null;

  if (sampleCount < 3) blockers.push("INTERPOLATION_SAMPLE_COUNT_INVALID");

  if (!cv) {
    blockers.push("CROSS_VALIDATION_REQUIRED");
  } else {
    if (!Number.isInteger(cv.validationCount) || cv.validationCount <= 0 || cv.validationCount > sampleCount) {
      blockers.push("CROSS_VALIDATION_COUNT_INVALID");
    }
    if (cv.strategy === "LOOCV" && cv.validationCount !== sampleCount) {
      blockers.push("LOOCV_MUST_VALIDATE_ALL_SAMPLES");
    }
    if (!finiteNonNegative(cv.rmse)) blockers.push("RMSE_REQUIRED");
    if (!finiteNonNegative(cv.mae)) blockers.push("MAE_REQUIRED");
    if (!finiteNumber(cv.meanError)) blockers.push("MEAN_ERROR_REQUIRED");
    if (finiteNonNegative(cv.rmse) && finiteNonNegative(cv.mae) && (cv.mae as number) > (cv.rmse as number) + 1e-12) {
      blockers.push("CROSS_VALIDATION_METRICS_INCONSISTENT");
    }
  }

  if (input.method === "KRIGING") {
    if (!variogram) {
      blockers.push("KRIGING_VARIOGRAM_REQUIRED");
    } else {
      if (!finiteNonNegative(variogram.nugget)) blockers.push("VARIOGRAM_NUGGET_INVALID");
      if (!(typeof variogram.sill === "number" && Number.isFinite(variogram.sill) && variogram.sill > 0)) {
        blockers.push("VARIOGRAM_SILL_INVALID");
      }
      if (!(typeof variogram.range === "number" && Number.isFinite(variogram.range) && variogram.range > 0)) {
        blockers.push("VARIOGRAM_RANGE_INVALID");
      }
      if (
        variogram.experimentalLagCount != null
        && (!Number.isInteger(variogram.experimentalLagCount) || variogram.experimentalLagCount <= 0)
      ) {
        blockers.push("VARIOGRAM_LAG_COUNT_INVALID");
      }
    }
  }

  const invalidCodes = new Set([
    "INTERPOLATION_SAMPLE_COUNT_INVALID",
    "CROSS_VALIDATION_COUNT_INVALID",
    "LOOCV_MUST_VALIDATE_ALL_SAMPLES",
    "CROSS_VALIDATION_METRICS_INCONSISTENT",
    "VARIOGRAM_NUGGET_INVALID",
    "VARIOGRAM_SILL_INVALID",
    "VARIOGRAM_RANGE_INVALID",
    "VARIOGRAM_LAG_COUNT_INVALID",
  ]);
  const hasInvalid = blockers.some((item) => invalidCodes.has(item));
  const hasIncomplete = blockers.length > 0 && !hasInvalid;

  if (hasInvalid) {
    return {
      method: input.method,
      status: "INVALID_EVIDENCE",
      officialSurfaceAllowed: false,
      automaticMethodSelectionAllowed: false,
      automaticVariableRateAllowed: false,
      crossValidation: cv,
      variogram,
      blockers: [...new Set(blockers)],
      policy: {
        crossValidationRequired: true,
        krigingVariogramRequired: input.method === "KRIGING",
        universalRmseThresholdAvailable: false,
        universalMaeThresholdAvailable: false,
        universalMeanErrorThresholdAvailable: false,
        professionalMethodReviewRequired: true,
      },
    };
  }

  if (hasIncomplete) {
    return {
      method: input.method,
      status: "EVIDENCE_INCOMPLETE",
      officialSurfaceAllowed: false,
      automaticMethodSelectionAllowed: false,
      automaticVariableRateAllowed: false,
      crossValidation: cv,
      variogram,
      blockers: [...new Set(blockers)],
      policy: {
        crossValidationRequired: true,
        krigingVariogramRequired: input.method === "KRIGING",
        universalRmseThresholdAvailable: false,
        universalMaeThresholdAvailable: false,
        universalMeanErrorThresholdAvailable: false,
        professionalMethodReviewRequired: true,
      },
    };
  }

  if (input.professionalMethodReviewApproved !== true) {
    return {
      method: input.method,
      status: "REVIEW_REQUIRED",
      officialSurfaceAllowed: false,
      automaticMethodSelectionAllowed: false,
      automaticVariableRateAllowed: false,
      crossValidation: cv,
      variogram,
      blockers: ["PROFESSIONAL_METHOD_VALIDATION_REQUIRED"],
      policy: {
        crossValidationRequired: true,
        krigingVariogramRequired: input.method === "KRIGING",
        universalRmseThresholdAvailable: false,
        universalMaeThresholdAvailable: false,
        universalMeanErrorThresholdAvailable: false,
        professionalMethodReviewRequired: true,
      },
    };
  }

  return {
    method: input.method,
    status: "VALIDATED_FOR_OFFICIAL_SURFACE",
    officialSurfaceAllowed: true,
    automaticMethodSelectionAllowed: false,
    automaticVariableRateAllowed: false,
    crossValidation: cv,
    variogram,
    blockers: [],
    policy: {
      crossValidationRequired: true,
      krigingVariogramRequired: input.method === "KRIGING",
      universalRmseThresholdAvailable: false,
      universalMaeThresholdAvailable: false,
      universalMeanErrorThresholdAvailable: false,
      professionalMethodReviewRequired: true,
    },
  };
}

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
  /** @deprecated Booleano legado; não é suficiente para liberar mapa oficial. */
  crossValidationPassed?: boolean | null;
  interpolationValidation?: SpatialInterpolationValidationDecision | null;
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

export function spatialInterpolationClassForCount(
  sampleCount: number | null | undefined,
  method: SpatialMethod | null = null,
): SpatialPrescriptionRequestDecision["policy"]["interpolationClass"] {
  const n = Number.isInteger(sampleCount) && (sampleCount as number) >= 0 ? (sampleCount as number) : null;
  if (n == null || n < 3) return "NONE";
  if (n < 50) return "EXPLORATORY_ONLY";
  if (n >= 100 && method === "KRIGING") return "CANDIDATE_WITH_CROSS_VALIDATION";
  return "CANDIDATE_REVIEW";
}

function basePolicy(input: SpatialPrescriptionRequestInput): SpatialPrescriptionRequestDecision["policy"] {
  const n = Number.isInteger(input.sampleCount) && (input.sampleCount as number) >= 0 ? (input.sampleCount as number) : null;
  const method = input.requestedSpatialMethod ?? null;
  const interpolationClass = spatialInterpolationClassForCount(n, method);
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

  if (n != null && n > 0 && method === "KRIGING" && n < 50) {
    blockers.push("KRIGING_NOT_ALLOWED_WITH_FEW_POINTS");
  }

  // Qualquer superfície oficial candidata (>=50 pontos pela política RAIZ)
  // precisa de validação explícita do método. Um booleano legado de CV nunca é
  // suficiente porque não preserva RMSE/MAE/ME, estratégia ou variograma.
  if (method && n != null && n >= 50) {
    const validation = input.interpolationValidation ?? null;
    if (!validation || validation.status !== "VALIDATED_FOR_OFFICIAL_SURFACE" || !validation.officialSurfaceAllowed) {
      blockers.push("INTERPOLATION_VALIDATION_REQUIRED");
      if (!validation?.crossValidation) blockers.push("CROSS_VALIDATION_REQUIRED");
    } else if (validation.method !== method) {
      blockers.push("INTERPOLATION_VALIDATION_METHOD_MISMATCH");
    }
  }

  // Toda prescrição oficial continua humana, mesmo depois de o método ter sido validado.
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
