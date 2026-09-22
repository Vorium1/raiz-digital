export type TechnicalRegionApplicabilityRef = {
  code: string;
  specificityScore: number;
};

export type InmetStationApplicability =
  | {
      status: "APPLICABLE_REGIONAL_OBSERVATION";
      applicable: true;
      sharedTechnicalRegionCodes: string[];
      fieldRequiredSpecificityScore: number;
      matchedSpecificityScore: number;
      distanceKm: number;
      maxDistanceKm: number | null;
      warnings: string[];
    }
  | {
      status:
        | "FIELD_TECHNICAL_REGION_UNRESOLVED"
        | "STATION_TECHNICAL_REGION_UNRESOLVED"
        | "TECHNICAL_REGION_MISMATCH"
        | "FIELD_SPECIFIC_REGION_NOT_SHARED"
        | "DISTANCE_POLICY_EXCEEDED";
      applicable: false;
      sharedTechnicalRegionCodes: string[];
      fieldRequiredSpecificityScore: number | null;
      matchedSpecificityScore: number | null;
      distanceKm: number;
      maxDistanceKm: number | null;
      warnings: string[];
    };

function normalizeRegionRefs(values: TechnicalRegionApplicabilityRef[]) {
  const byCode = new Map<string, number>();
  for (const value of values) {
    const code = value.code.trim().toUpperCase();
    if (!code) continue;
    if (!Number.isFinite(value.specificityScore) || value.specificityScore < 0) {
      throw new Error("INMET_TECHNICAL_REGION_SPECIFICITY_INVALID");
    }
    byCode.set(code, Math.max(byCode.get(code) ?? -Infinity, value.specificityScore));
  }
  return byCode;
}

function validateDistance(distanceKm: number, maxDistanceKm?: number | null) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) throw new Error("INMET_STATION_DISTANCE_INVALID");
  if (maxDistanceKm != null && (!Number.isFinite(maxDistanceKm) || maxDistanceKm <= 0)) {
    throw new Error("INMET_MAX_DISTANCE_POLICY_INVALID");
  }
}

/**
 * Decide se uma estação INMET pode ser tratada como observação REGIONAL aplicável
 * ao talhão. Nunca promove a estação a "sensor do campo".
 *
 * Regras:
 * - a região técnica do campo precisa estar resolvida;
 * - a região técnica da estação é resolvida pelas coordenadas reais da estação;
 * - o código compartilhado precisa atingir a especificidade máxima disponível
 *   para o campo. Compartilhar apenas "BR-RS" não basta quando o campo já possui
 *   uma sub-região técnica/polígono mais específico;
 * - distância é sempre registrada. Ela só bloqueia por quilômetros quando existe
 *   uma política explícita/homologada fornecida pelo chamador.
 */
export function assessInmetStationApplicability(input: {
  fieldRegions: TechnicalRegionApplicabilityRef[];
  stationRegions: TechnicalRegionApplicabilityRef[];
  distanceKm: number;
  maxDistanceKm?: number | null;
}): InmetStationApplicability {
  validateDistance(input.distanceKm, input.maxDistanceKm);
  const field = normalizeRegionRefs(input.fieldRegions);
  const station = normalizeRegionRefs(input.stationRegions);
  const maxDistanceKm = input.maxDistanceKm ?? null;

  if (!field.size) {
    return {
      status: "FIELD_TECHNICAL_REGION_UNRESOLVED",
      applicable: false,
      sharedTechnicalRegionCodes: [],
      fieldRequiredSpecificityScore: null,
      matchedSpecificityScore: null,
      distanceKm: input.distanceKm,
      maxDistanceKm,
      warnings: [],
    };
  }
  const fieldRequiredSpecificityScore = Math.max(...field.values());

  if (!station.size) {
    return {
      status: "STATION_TECHNICAL_REGION_UNRESOLVED",
      applicable: false,
      sharedTechnicalRegionCodes: [],
      fieldRequiredSpecificityScore,
      matchedSpecificityScore: null,
      distanceKm: input.distanceKm,
      maxDistanceKm,
      warnings: [],
    };
  }

  const shared = [...field.keys()].filter((code) => station.has(code));
  if (!shared.length) {
    return {
      status: "TECHNICAL_REGION_MISMATCH",
      applicable: false,
      sharedTechnicalRegionCodes: [],
      fieldRequiredSpecificityScore,
      matchedSpecificityScore: null,
      distanceKm: input.distanceKm,
      maxDistanceKm,
      warnings: [],
    };
  }

  const matchedSpecificityScore = Math.max(
    ...shared.map((code) => Math.min(field.get(code)!, station.get(code)!)),
  );
  const sharedTechnicalRegionCodes = shared
    .filter((code) => Math.min(field.get(code)!, station.get(code)!) === matchedSpecificityScore)
    .sort();

  if (matchedSpecificityScore < fieldRequiredSpecificityScore) {
    return {
      status: "FIELD_SPECIFIC_REGION_NOT_SHARED",
      applicable: false,
      sharedTechnicalRegionCodes,
      fieldRequiredSpecificityScore,
      matchedSpecificityScore,
      distanceKm: input.distanceKm,
      maxDistanceKm,
      warnings: ["BROAD_REGION_MATCH_REJECTED_WHEN_FIELD_HAS_MORE_SPECIFIC_REGION"],
    };
  }

  if (maxDistanceKm != null && input.distanceKm > maxDistanceKm) {
    return {
      status: "DISTANCE_POLICY_EXCEEDED",
      applicable: false,
      sharedTechnicalRegionCodes,
      fieldRequiredSpecificityScore,
      matchedSpecificityScore,
      distanceKm: input.distanceKm,
      maxDistanceKm,
      warnings: [],
    };
  }

  return {
    status: "APPLICABLE_REGIONAL_OBSERVATION",
    applicable: true,
    sharedTechnicalRegionCodes,
    fieldRequiredSpecificityScore,
    matchedSpecificityScore,
    distanceKm: input.distanceKm,
    maxDistanceKm,
    warnings: maxDistanceKm == null
      ? ["INMET_DISTANCE_RECORDED_WITHOUT_HOMOLOGATED_MAX_DISTANCE_POLICY"]
      : [],
  };
}

export function previousCompleteUtcDate(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error("INMET_REFERENCE_TIME_INVALID");
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
