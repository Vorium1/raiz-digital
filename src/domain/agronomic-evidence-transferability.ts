export type AgronomicEvidenceType =
  | "UNCLASSIFIED"
  | "MECHANISTIC"
  | "CALIBRATED_RESPONSE"
  | "MULTILOCATION_TRIAL"
  | "CONTROLLED_FIELD_TRIAL"
  | "OBSERVATIONAL_FIELD"
  | "REGIONAL_MANUAL"
  | "SYSTEMATIC_REVIEW"
  | "META_ANALYSIS";

export type AgronomicEvidenceStrength =
  | "UNASSESSED"
  | "DIRECT_STRONG"
  | "TRANSFERRED_STRONG"
  | "MODERATE"
  | "EXPERIMENTAL"
  | "OBSERVATIONAL"
  | "CONFLICTING"
  | "INSUFFICIENT";

export type EvidenceApplicability =
  | "DIRECT"
  | "STRONGLY_COMPARABLE"
  | "PARTIALLY_COMPARABLE"
  | "MECHANISTIC_ONLY"
  | "NOT_COMPARABLE"
  | "INSUFFICIENT_CONTEXT";

export type QuantitativeUseStatus =
  | "CONTEXT_ONLY"
  | "REVIEW_ONLY"
  | "HOMOLOGATED_DETERMINISTIC";

export type AgronomicContextValue = string | number | boolean | null | undefined;
export type AgronomicTargetContext = Record<string, AgronomicContextValue>;

export type CategoricalConstraint = {
  kind: "CATEGORICAL";
  allowed: readonly string[];
};

export type NumericRangeConstraint = {
  kind: "NUMERIC_RANGE";
  min?: number | null;
  max?: number | null;
  unit?: string | null;
};

export type BooleanConstraint = {
  kind: "BOOLEAN";
  allowed: readonly boolean[];
};

export type AgronomicContextConstraint =
  | CategoricalConstraint
  | NumericRangeConstraint
  | BooleanConstraint;

export type AgronomicEvidenceProfile = {
  evidenceType: AgronomicEvidenceType;
  evidenceStrength?: AgronomicEvidenceStrength;
  constraints: Readonly<Record<string, AgronomicContextConstraint>>;
  criticalDimensions: readonly string[];
  optionalDimensions?: readonly string[];
  directCalibration?: boolean;
  unresolvedConflict?: boolean;
  requiresLocalCalibration?: boolean;
  requiresAgronomistReview?: boolean;
  quantitativeUseStatus?: QuantitativeUseStatus;
  quantitativeApplicabilityApproved?: boolean;
  homologatedRuleId?: string | null;
};

export type EvidenceTransferReason =
  | "MECHANISTIC_EVIDENCE_NOT_A_DOSE_RULE"
  | "UNRESOLVED_EVIDENCE_CONFLICT"
  | "SOURCE_CRITICAL_CONSTRAINT_MISSING"
  | "TARGET_CRITICAL_CONTEXT_MISSING"
  | "CRITICAL_CONTEXT_MISMATCH"
  | "OPTIONAL_CONTEXT_MISSING"
  | "OPTIONAL_CONTEXT_MISMATCH"
  | "DIRECT_CALIBRATION_CONFIRMED"
  | "ALL_CRITICAL_CONTEXT_MATCHES"
  | "QUANTITATIVE_RULE_NOT_HOMOLOGATED"
  | "QUANTITATIVE_APPLICABILITY_NOT_APPROVED"
  | "QUANTITATIVE_USE_BLOCKED_BY_APPLICABILITY";

export type AgronomicEvidenceTransferDecision = {
  applicability: EvidenceApplicability;
  canSupportContextualAdvice: boolean;
  canSupportQuantitativeRecommendation: boolean;
  reasons: EvidenceTransferReason[];
  missingSourceCriticalDimensions: string[];
  missingTargetCriticalDimensions: string[];
  mismatchedCriticalDimensions: string[];
  missingOptionalDimensions: string[];
  mismatchedOptionalDimensions: string[];
  quantitativeRuleId: string | null;
  policy: {
    geographyAloneDeterminesTransferability: false;
    similarityScoreUsed: false;
    quantitativeDoseRequiresHomologatedRule: true;
    unresolvedConflictBlocksQuantitativeUse: true;
  };
};

function hasValue(value: AgronomicContextValue): value is string | number | boolean {
  return value !== null && value !== undefined && !(typeof value === "string" && value.trim() === "");
}

function normalizeText(value: string) {
  return value.trim().toLocaleUpperCase("pt-BR");
}

function matchesConstraint(value: AgronomicContextValue, constraint: AgronomicContextConstraint): boolean {
  if (!hasValue(value)) return false;

  if (constraint.kind === "CATEGORICAL") {
    if (typeof value !== "string") return false;
    const normalized = normalizeText(value);
    return constraint.allowed.some((allowed) => normalizeText(allowed) === normalized);
  }

  if (constraint.kind === "BOOLEAN") {
    return typeof value === "boolean" && constraint.allowed.includes(value);
  }

  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (constraint.min !== null && constraint.min !== undefined && value < constraint.min) return false;
  if (constraint.max !== null && constraint.max !== undefined && value > constraint.max) return false;
  return true;
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

export function evaluateAgronomicEvidenceTransfer(
  profile: AgronomicEvidenceProfile,
  target: AgronomicTargetContext,
): AgronomicEvidenceTransferDecision {
  const reasons: EvidenceTransferReason[] = [];
  const missingSourceCriticalDimensions: string[] = [];
  const missingTargetCriticalDimensions: string[] = [];
  const mismatchedCriticalDimensions: string[] = [];
  const missingOptionalDimensions: string[] = [];
  const mismatchedOptionalDimensions: string[] = [];

  const criticalDimensions = unique(profile.criticalDimensions);
  const optionalDimensions = unique(profile.optionalDimensions ?? []).filter(
    (dimension) => !criticalDimensions.includes(dimension),
  );

  for (const dimension of criticalDimensions) {
    const constraint = profile.constraints[dimension];
    if (!constraint) {
      missingSourceCriticalDimensions.push(dimension);
      continue;
    }
    const value = target[dimension];
    if (!hasValue(value)) {
      missingTargetCriticalDimensions.push(dimension);
      continue;
    }
    if (!matchesConstraint(value, constraint)) mismatchedCriticalDimensions.push(dimension);
  }

  for (const dimension of optionalDimensions) {
    const constraint = profile.constraints[dimension];
    if (!constraint) continue;
    const value = target[dimension];
    if (!hasValue(value)) {
      missingOptionalDimensions.push(dimension);
      continue;
    }
    if (!matchesConstraint(value, constraint)) mismatchedOptionalDimensions.push(dimension);
  }

  if (profile.evidenceType === "MECHANISTIC") reasons.push("MECHANISTIC_EVIDENCE_NOT_A_DOSE_RULE");
  if (profile.unresolvedConflict || profile.evidenceStrength === "CONFLICTING") reasons.push("UNRESOLVED_EVIDENCE_CONFLICT");
  if (missingSourceCriticalDimensions.length) reasons.push("SOURCE_CRITICAL_CONSTRAINT_MISSING");
  if (missingTargetCriticalDimensions.length) reasons.push("TARGET_CRITICAL_CONTEXT_MISSING");
  if (mismatchedCriticalDimensions.length) reasons.push("CRITICAL_CONTEXT_MISMATCH");
  if (missingOptionalDimensions.length) reasons.push("OPTIONAL_CONTEXT_MISSING");
  if (mismatchedOptionalDimensions.length) reasons.push("OPTIONAL_CONTEXT_MISMATCH");

  let applicability: EvidenceApplicability;
  if (profile.evidenceType === "MECHANISTIC") {
    applicability = "MECHANISTIC_ONLY";
  } else if (mismatchedCriticalDimensions.length) {
    applicability = "NOT_COMPARABLE";
  } else if (missingSourceCriticalDimensions.length || missingTargetCriticalDimensions.length) {
    applicability = "INSUFFICIENT_CONTEXT";
  } else if (missingOptionalDimensions.length || mismatchedOptionalDimensions.length) {
    applicability = "PARTIALLY_COMPARABLE";
  } else if (profile.directCalibration) {
    applicability = "DIRECT";
    reasons.push("DIRECT_CALIBRATION_CONFIRMED");
  } else {
    applicability = "STRONGLY_COMPARABLE";
    reasons.push("ALL_CRITICAL_CONTEXT_MATCHES");
  }

  const quantitativeRuleId = profile.homologatedRuleId?.trim() || null;
  const applicabilityAllowsQuantitativeUse = applicability === "DIRECT" || applicability === "STRONGLY_COMPARABLE";
  const ruleHomologated = profile.quantitativeUseStatus === "HOMOLOGATED_DETERMINISTIC" && Boolean(quantitativeRuleId);
  const quantitativeApplicabilityApproved = profile.quantitativeApplicabilityApproved === true;
  const hasConflict = profile.unresolvedConflict === true || profile.evidenceStrength === "CONFLICTING";

  if (!ruleHomologated) reasons.push("QUANTITATIVE_RULE_NOT_HOMOLOGATED");
  if (!quantitativeApplicabilityApproved) reasons.push("QUANTITATIVE_APPLICABILITY_NOT_APPROVED");
  if (!applicabilityAllowsQuantitativeUse) reasons.push("QUANTITATIVE_USE_BLOCKED_BY_APPLICABILITY");

  const canSupportQuantitativeRecommendation =
    ruleHomologated &&
    quantitativeApplicabilityApproved &&
    applicabilityAllowsQuantitativeUse &&
    !hasConflict &&
    profile.evidenceType !== "MECHANISTIC";

  const canSupportContextualAdvice = applicability !== "NOT_COMPARABLE" && applicability !== "INSUFFICIENT_CONTEXT";

  return {
    applicability,
    canSupportContextualAdvice,
    canSupportQuantitativeRecommendation,
    reasons: unique(reasons),
    missingSourceCriticalDimensions,
    missingTargetCriticalDimensions,
    mismatchedCriticalDimensions,
    missingOptionalDimensions,
    mismatchedOptionalDimensions,
    quantitativeRuleId,
    policy: {
      geographyAloneDeterminesTransferability: false,
      similarityScoreUsed: false,
      quantitativeDoseRequiresHomologatedRule: true,
      unresolvedConflictBlocksQuantitativeUse: true,
    },
  };
}
