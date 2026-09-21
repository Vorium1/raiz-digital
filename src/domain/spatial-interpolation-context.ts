import type { SpatialAttributeEvidence } from "./spatial-attribute-evidence.ts";
import {
  evaluateSpatialInterpolationValidation,
  type SpatialCrossValidationEvidence,
  type SpatialInterpolationValidationDecision,
  type SpatialMethod,
  type SpatialVariogramEvidence,
} from "./spatial-prescription-request.ts";

const METHODS = new Set<SpatialMethod>(["KRIGING", "IDW", "THIESSEN", "NEAREST_NEIGHBOR"]);
const CV_STRATEGIES = new Set<SpatialCrossValidationEvidence["strategy"]>(["LOOCV", "KFOLD", "HOLDOUT"]);
const VARIOGRAM_MODELS = new Set<SpatialVariogramEvidence["model"]>([
  "SPHERICAL",
  "EXPONENTIAL",
  "GAUSSIAN",
  "MATERN",
  "OTHER_VALIDATED",
]);

export type SpatialInterpolationValidationContextEntry = {
  parameterCode: string;
  method: SpatialMethod;
  sampleCount: number;
  crossValidation: SpatialCrossValidationEvidence | null;
  variogram: SpatialVariogramEvidence | null;
  professionalMethodReviewApproved: boolean;
  reviewerNote: string;
};

export type StoredSpatialInterpolationValidationEvaluation = {
  parameterCode: string;
  method: SpatialMethod;
  storedSampleCount: number;
  currentSampleCount: number | null;
  currentAttributeStatus: SpatialAttributeEvidence["status"] | null;
  current: boolean;
  officialSurfaceAllowed: boolean;
  automaticVariableRateAllowed: false;
  validation: SpatialInterpolationValidationDecision;
  limitations: string[];
};

export type StoredSpatialInterpolationValidationContextEvaluation = {
  status: "NOT_PROVIDED" | "INVALID_CONTEXT" | "RECORDED";
  automaticVariableRateAllowed: false;
  entries: StoredSpatialInterpolationValidationEvaluation[];
  limitations: string[];
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteOrNull(value: unknown, label: string) {
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} inválido.`);
  return value;
}

function parseCrossValidation(value: unknown): SpatialCrossValidationEvidence | null {
  if (value == null) return null;
  const source = object(value);
  if (!source) throw new Error("Validação cruzada espacial inválida.");
  if (typeof source.strategy !== "string" || !CV_STRATEGIES.has(source.strategy as SpatialCrossValidationEvidence["strategy"])) {
    throw new Error("Estratégia de validação cruzada espacial inválida.");
  }
  if (!Number.isInteger(source.validationCount) || (source.validationCount as number) < 0) {
    throw new Error("Quantidade de observações da validação cruzada inválida.");
  }
  return {
    strategy: source.strategy as SpatialCrossValidationEvidence["strategy"],
    validationCount: source.validationCount as number,
    rmse: finiteOrNull(source.rmse, "RMSE"),
    mae: finiteOrNull(source.mae, "MAE"),
    meanError: finiteOrNull(source.meanError, "Erro médio"),
  };
}

function parseVariogram(value: unknown): SpatialVariogramEvidence | null {
  if (value == null) return null;
  const source = object(value);
  if (!source) throw new Error("Variograma inválido.");
  if (typeof source.model !== "string" || !VARIOGRAM_MODELS.has(source.model as SpatialVariogramEvidence["model"])) {
    throw new Error("Modelo de variograma inválido.");
  }
  const experimentalLagCount = source.experimentalLagCount == null
    ? null
    : Number(source.experimentalLagCount);
  if (
    experimentalLagCount != null
    && (!Number.isInteger(experimentalLagCount) || experimentalLagCount < 0)
  ) {
    throw new Error("Quantidade de lags experimentais inválida.");
  }
  return {
    model: source.model as SpatialVariogramEvidence["model"],
    nugget: finiteOrNull(source.nugget, "Nugget"),
    sill: finiteOrNull(source.sill, "Sill"),
    range: finiteOrNull(source.range, "Range"),
    experimentalLagCount,
  };
}

export function parseSpatialInterpolationValidations(value: unknown): SpatialInterpolationValidationContextEntry[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("Validações espaciais devem ser uma lista.");

  const seen = new Set<string>();
  return value.map((item, index) => {
    const source = object(item);
    if (!source) throw new Error(`Validação espacial #${index + 1} inválida.`);
    const parameterCode = typeof source.parameterCode === "string"
      ? source.parameterCode.trim().toUpperCase()
      : "";
    if (!parameterCode || !/^[A-Z0-9_]+$/.test(parameterCode)) {
      throw new Error(`Parâmetro da validação espacial #${index + 1} inválido.`);
    }
    if (typeof source.method !== "string" || !METHODS.has(source.method as SpatialMethod)) {
      throw new Error(`Método da validação espacial #${index + 1} inválido.`);
    }
    if (!Number.isInteger(source.sampleCount) || (source.sampleCount as number) < 0) {
      throw new Error(`Quantidade de pontos da validação espacial #${index + 1} inválida.`);
    }
    if (typeof source.professionalMethodReviewApproved !== "boolean") {
      throw new Error(`Revisão profissional da validação espacial #${index + 1} precisa ser booleana.`);
    }
    const reviewerNote = source.reviewerNote == null ? "" : String(source.reviewerNote).trim();
    if (reviewerNote.length > 2000) throw new Error("Nota da revisão espacial deve ter no máximo 2.000 caracteres.");

    const key = `${parameterCode}|${source.method}`;
    if (seen.has(key)) throw new Error(`Validação espacial duplicada para ${parameterCode} / ${source.method}.`);
    seen.add(key);

    return {
      parameterCode,
      method: source.method as SpatialMethod,
      sampleCount: source.sampleCount as number,
      crossValidation: parseCrossValidation(source.crossValidation),
      variogram: parseVariogram(source.variogram),
      professionalMethodReviewApproved: source.professionalMethodReviewApproved,
      reviewerNote,
    };
  });
}

export function spatialInterpolationValidationsFromAnalysisContext(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const draft = (value as { draft?: unknown }).draft;
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return [];
  return (draft as { spatialInterpolationValidations?: unknown }).spatialInterpolationValidations ?? [];
}

/**
 * Confronta validação armazenada com o suporte REAL atual por parâmetro.
 *
 * Uma validação antiga não é reutilizada se o número de coordenadas comparáveis
 * mudou, se o atributo deixou de ser candidato à interpolação ou se o método
 * não está tecnicamente validado. Nada disso bloqueia o parecer uniforme.
 */
export function evaluateStoredSpatialInterpolationValidations(input: {
  stored: unknown;
  attributes: SpatialAttributeEvidence[];
}): StoredSpatialInterpolationValidationContextEvaluation {
  let parsed: SpatialInterpolationValidationContextEntry[];
  try {
    parsed = parseSpatialInterpolationValidations(input.stored);
  } catch (error) {
    return {
      status: "INVALID_CONTEXT",
      automaticVariableRateAllowed: false,
      entries: [],
      limitations: [error instanceof Error ? error.message : "Contexto espacial inválido."],
    };
  }

  if (parsed.length === 0) {
    return {
      status: "NOT_PROVIDED",
      automaticVariableRateAllowed: false,
      entries: [],
      limitations: [],
    };
  }

  const byParameter = new Map(input.attributes.map((attribute) => [attribute.parameterCode, attribute]));
  const entries = parsed.map((entry): StoredSpatialInterpolationValidationEvaluation => {
    const attribute = byParameter.get(entry.parameterCode) ?? null;
    const currentSampleCount = attribute?.support.distinctReliableCoordinateCount ?? null;
    const limitations: string[] = [];

    if (!attribute) limitations.push("SPATIAL_ATTRIBUTE_EVIDENCE_NOT_AVAILABLE");
    if (attribute && attribute.status !== "INTERPOLATION_CANDIDATE") {
      limitations.push("SPATIAL_ATTRIBUTE_NOT_INTERPOLATION_CANDIDATE");
    }
    if (currentSampleCount != null && currentSampleCount !== entry.sampleCount) {
      limitations.push("SPATIAL_VALIDATION_SAMPLE_COUNT_STALE");
    }

    const validation = evaluateSpatialInterpolationValidation({
      method: entry.method,
      sampleCount: entry.sampleCount,
      crossValidation: entry.crossValidation,
      variogram: entry.variogram,
      professionalMethodReviewApproved: entry.professionalMethodReviewApproved,
    });
    limitations.push(...validation.blockers);

    const current = Boolean(
      attribute
      && attribute.status === "INTERPOLATION_CANDIDATE"
      && currentSampleCount === entry.sampleCount
      && validation.status === "VALIDATED_FOR_OFFICIAL_SURFACE"
      && validation.officialSurfaceAllowed,
    );

    return {
      parameterCode: entry.parameterCode,
      method: entry.method,
      storedSampleCount: entry.sampleCount,
      currentSampleCount,
      currentAttributeStatus: attribute?.status ?? null,
      current,
      officialSurfaceAllowed: current,
      automaticVariableRateAllowed: false,
      validation,
      limitations: [...new Set(limitations)],
    };
  });

  return {
    status: "RECORDED",
    automaticVariableRateAllowed: false,
    entries,
    limitations: [...new Set(entries.flatMap((entry) => entry.limitations))],
  };
}
