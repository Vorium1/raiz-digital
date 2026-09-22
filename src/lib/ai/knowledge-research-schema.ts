import type {
  AgronomicEvidenceStrength,
  AgronomicEvidenceType,
  QuantitativeUseStatus,
} from "@/domain/agronomic-evidence-transferability";

/**
 * Formato obrigatório do resultado de uma pesquisa periódica da base de
 * conhecimento. Cada item vira uma linha em `technical_sources`, sempre
 * como DRAFT -- nunca citável por um laudo até um curador da plataforma
 * homologar (mesma trava que já existe pra qualquer fonte técnica).
 *
 * Os metadados novos são opcionais para manter compatibilidade com pesquisas
 * antigas. Ausência de metadado nunca promove a fonte: no banco o default é
 * UNCLASSIFIED/UNASSESSED/CONTEXT_ONLY e exige revisão/calibração.
 */
export type KnowledgeResearchSource = {
  title: string;
  institution: string | null;
  editionYear: number | null;
  subject: string;
  content: string;
  regionCode: string | null;
  evidenceType?: AgronomicEvidenceType;
  evidenceStrength?: AgronomicEvidenceStrength;
  contextProfile?: Record<string, unknown>;
  criticalDimensions?: string[];
  requiresLocalCalibration?: boolean;
  requiresAgronomistReview?: boolean;
  quantitativeUseStatus?: QuantitativeUseStatus;
  quantitativeApplicabilityApproved?: boolean;
  homologatedRuleId?: string | null;
  sourceLocator?: string | null;
  sourceUrl?: string | null;
  doi?: string | null;
  studyDesign?: string | null;
  peerReviewed?: boolean | null;
};

const EVIDENCE_TYPES = new Set<AgronomicEvidenceType>([
  "UNCLASSIFIED",
  "MECHANISTIC",
  "CALIBRATED_RESPONSE",
  "MULTILOCATION_TRIAL",
  "CONTROLLED_FIELD_TRIAL",
  "OBSERVATIONAL_FIELD",
  "REGIONAL_MANUAL",
  "SYSTEMATIC_REVIEW",
  "META_ANALYSIS",
]);

const EVIDENCE_STRENGTHS = new Set<AgronomicEvidenceStrength>([
  "UNASSESSED",
  "DIRECT_STRONG",
  "TRANSFERRED_STRONG",
  "MODERATE",
  "EXPERIMENTAL",
  "OBSERVATIONAL",
  "CONFLICTING",
  "INSUFFICIENT",
]);

const QUANTITATIVE_USE_STATUSES = new Set<QuantitativeUseStatus>([
  "CONTEXT_ONLY",
  "REVIEW_ONLY",
  "HOMOLOGATED_DETERMINISTIC",
]);

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalStringArray(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const normalized = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (normalized.some((item) => !item)) return null;
  return [...new Set(normalized)];
}

export function validateKnowledgeResearchSources(value: unknown): KnowledgeResearchSource[] | null {
  if (!Array.isArray(value)) return null;
  const sources: KnowledgeResearchSource[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    if (!isString(candidate.title)) return null;
    if (!isString(candidate.subject)) return null;
    if (!isString(candidate.content)) return null;

    const institution = typeof candidate.institution === "string" && candidate.institution.trim() ? candidate.institution : null;
    const editionYear = typeof candidate.editionYear === "number" && Number.isFinite(candidate.editionYear) ? candidate.editionYear : null;
    const regionCode = typeof candidate.regionCode === "string" && candidate.regionCode.trim() ? candidate.regionCode : null;

    const source: KnowledgeResearchSource = {
      title: candidate.title,
      institution,
      editionYear,
      subject: candidate.subject,
      content: candidate.content,
      regionCode,
    };

    if (candidate.evidenceType !== undefined) {
      if (typeof candidate.evidenceType !== "string" || !EVIDENCE_TYPES.has(candidate.evidenceType as AgronomicEvidenceType)) return null;
      source.evidenceType = candidate.evidenceType as AgronomicEvidenceType;
    }
    if (candidate.evidenceStrength !== undefined) {
      if (typeof candidate.evidenceStrength !== "string" || !EVIDENCE_STRENGTHS.has(candidate.evidenceStrength as AgronomicEvidenceStrength)) return null;
      source.evidenceStrength = candidate.evidenceStrength as AgronomicEvidenceStrength;
    }
    if (candidate.contextProfile !== undefined) {
      if (!isPlainObject(candidate.contextProfile)) return null;
      source.contextProfile = candidate.contextProfile;
    }
    const criticalDimensions = optionalStringArray(candidate.criticalDimensions);
    if (criticalDimensions === null) return null;
    if (criticalDimensions !== undefined) source.criticalDimensions = criticalDimensions;

    for (const [inputKey, outputKey] of [
      ["requiresLocalCalibration", "requiresLocalCalibration"],
      ["requiresAgronomistReview", "requiresAgronomistReview"],
      ["quantitativeApplicabilityApproved", "quantitativeApplicabilityApproved"],
    ] as const) {
      const field = candidate[inputKey];
      if (field !== undefined) {
        if (typeof field !== "boolean") return null;
        source[outputKey] = field;
      }
    }

    if (candidate.quantitativeUseStatus !== undefined) {
      if (typeof candidate.quantitativeUseStatus !== "string" || !QUANTITATIVE_USE_STATUSES.has(candidate.quantitativeUseStatus as QuantitativeUseStatus)) return null;
      source.quantitativeUseStatus = candidate.quantitativeUseStatus as QuantitativeUseStatus;
    }

    for (const key of ["homologatedRuleId", "sourceLocator", "sourceUrl", "doi", "studyDesign"] as const) {
      const normalized = nullableString(candidate[key]);
      if (normalized !== undefined) source[key] = normalized;
    }

    if (candidate.peerReviewed !== undefined) {
      if (candidate.peerReviewed !== null && typeof candidate.peerReviewed !== "boolean") return null;
      source.peerReviewed = candidate.peerReviewed as boolean | null;
    }

    // A etapa de pesquisa só propõe evidência. Homologação quantitativa é uma
    // mutação de curadoria separada e nunca pode vir do payload gerado por IA.
    if (source.quantitativeUseStatus === "HOMOLOGATED_DETERMINISTIC") return null;
    if (source.quantitativeApplicabilityApproved === true) return null;
    if (source.homologatedRuleId) return null;

    sources.push(source);
  }
  return sources;
}
