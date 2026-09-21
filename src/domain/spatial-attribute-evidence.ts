import { spatialInterpolationClassForCount, type SampleDistribution } from "./spatial-prescription-request.ts";

export type SpatialAttributeEvidenceInput = {
  parameterCode: string;
  observationCount: number;
  distinctReliableCoordinateCount: number;
  units: string[];
  methods: string[];
  depthKnownCount: number;
  depthBands: string[];
  sampleDistribution: SampleDistribution;
};

export type SpatialAttributeEvidence = {
  parameterCode: string;
  status: "POINTS_ONLY" | "NOT_COMPARABLE" | "EXPLORATORY_ONLY" | "INTERPOLATION_CANDIDATE";
  automaticInterpolationAllowed: false;
  automaticVariableRateAllowed: false;
  interpolationClass: "NONE" | "EXPLORATORY_ONLY" | "CANDIDATE_REVIEW" | "CANDIDATE_WITH_CROSS_VALIDATION";
  support: {
    observationCount: number;
    distinctReliableCoordinateCount: number;
    units: string[];
    methods: string[];
    depthKnownCount: number;
    depthBands: string[];
    sampleDistribution: SampleDistribution;
  };
  limitations: string[];
};

function normalizedUnique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/**
 * Readiness espacial por parâmetro.
 *
 * Não escolhe interpolador e não calcula superfície. Só confirma se os dados
 * daquele atributo são comparáveis e qual classe de suporte amostral existe.
 */
export function evaluateSpatialAttributeEvidence(
  input: SpatialAttributeEvidenceInput,
): SpatialAttributeEvidence {
  const observationCount = Math.max(0, Math.trunc(input.observationCount));
  const distinctReliableCoordinateCount = Math.max(0, Math.trunc(input.distinctReliableCoordinateCount));
  const depthKnownCount = Math.max(0, Math.trunc(input.depthKnownCount));
  const units = normalizedUnique(input.units);
  const methods = normalizedUnique(input.methods);
  const depthBands = normalizedUnique(input.depthBands);
  const limitations: string[] = [];

  if (distinctReliableCoordinateCount < observationCount) limitations.push("DUPLICATE_OR_UNRELIABLE_SPATIAL_SUPPORT");
  if (units.length !== 1) limitations.push("SPATIAL_ATTRIBUTE_UNIT_CONFLICT");
  if (methods.length !== 1 || methods.some((method) => method.toUpperCase() === "NÃO INFORMADO")) {
    limitations.push("SPATIAL_ATTRIBUTE_METHOD_CONFLICT");
  }
  if (depthKnownCount !== observationCount) limitations.push("SPATIAL_ATTRIBUTE_DEPTH_INCOMPLETE");
  if (depthBands.length !== 1) limitations.push("SPATIAL_ATTRIBUTE_DEPTH_CONFLICT");
  if (distinctReliableCoordinateCount >= 3 && input.sampleDistribution === "COLLINEAR") {
    limitations.push("SPATIAL_ATTRIBUTE_COLLINEAR");
  }
  if (distinctReliableCoordinateCount >= 3 && input.sampleDistribution === "UNKNOWN") {
    limitations.push("SPATIAL_ATTRIBUTE_DISTRIBUTION_UNKNOWN");
  }

  const interpolationClass = spatialInterpolationClassForCount(distinctReliableCoordinateCount);
  const support = {
    observationCount,
    distinctReliableCoordinateCount,
    units,
    methods,
    depthKnownCount,
    depthBands,
    sampleDistribution: input.sampleDistribution,
  };

  if (distinctReliableCoordinateCount < 3) {
    return {
      parameterCode: input.parameterCode,
      status: "POINTS_ONLY",
      automaticInterpolationAllowed: false,
      automaticVariableRateAllowed: false,
      interpolationClass,
      support,
      limitations: [...limitations, "INSUFFICIENT_POINTS_FOR_2D_SURFACE"],
    };
  }

  const comparabilityBlockers = new Set([
    "SPATIAL_ATTRIBUTE_UNIT_CONFLICT",
    "SPATIAL_ATTRIBUTE_METHOD_CONFLICT",
    "SPATIAL_ATTRIBUTE_DEPTH_INCOMPLETE",
    "SPATIAL_ATTRIBUTE_DEPTH_CONFLICT",
    "SPATIAL_ATTRIBUTE_COLLINEAR",
    "SPATIAL_ATTRIBUTE_DISTRIBUTION_UNKNOWN",
  ]);
  if (limitations.some((item) => comparabilityBlockers.has(item))) {
    return {
      parameterCode: input.parameterCode,
      status: "NOT_COMPARABLE",
      automaticInterpolationAllowed: false,
      automaticVariableRateAllowed: false,
      interpolationClass,
      support,
      limitations,
    };
  }

  if (interpolationClass === "EXPLORATORY_ONLY") {
    return {
      parameterCode: input.parameterCode,
      status: "EXPLORATORY_ONLY",
      automaticInterpolationAllowed: false,
      automaticVariableRateAllowed: false,
      interpolationClass,
      support,
      limitations: [...limitations, "EXPLORATORY_ONLY_WITH_FEW_POINTS"],
    };
  }

  return {
    parameterCode: input.parameterCode,
    status: "INTERPOLATION_CANDIDATE",
    automaticInterpolationAllowed: false,
    automaticVariableRateAllowed: false,
    interpolationClass,
    support,
    limitations: [
      ...limitations,
      "SPATIAL_METHOD_SELECTION_REQUIRED",
      "PROFESSIONAL_SPATIAL_REVIEW_REQUIRED",
    ],
  };
}
