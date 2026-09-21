import {
  aggregateInmetAutomaticStationDay,
  deriveInmetContinuousRainHours,
} from "../../domain/official-agroclimate-ingestion.ts";
import {
  assessInmetStationApplicability,
  previousCompleteUtcDate,
  type InmetStationApplicability,
  type TechnicalRegionApplicabilityRef,
} from "../../domain/inmet-station-applicability.ts";
import {
  fetchInmetHourlyStationObservations,
  fetchNearestInmetAutomaticStation,
} from "./official-source-provider.ts";

type NearestFetcher = typeof fetchNearestInmetAutomaticStation;
type ObservationFetcher = typeof fetchInmetHourlyStationObservations;

export type InmetRegionalObservation = {
  status: "READY" | "PARTIAL" | "SKIPPED" | "NOT_APPLICABLE" | "UNAVAILABLE";
  role: "REGIONAL_OBSERVED_STATION";
  observedDateUtc: string | null;
  observationWindowFromUtc: string | null;
  observationWindowToUtc: string | null;
  station: {
    code: string;
    name: string;
    stateCode: string;
    latitude: number;
    longitude: number;
    altitudeM: number | null;
    distanceKm: number;
    sourceUrl: string;
  } | null;
  applicability: InmetStationApplicability | null;
  metricEvidence: ReturnType<typeof aggregateInmetAutomaticStationDay>["evidence"];
  warnings: string[];
  errorCode: string | null;
};

function errorCode(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 180);
  return "INMET_REGIONAL_OBSERVATION_UNAVAILABLE";
}

function utcDateMinusDays(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - days);
  return parsed.toISOString().slice(0, 10);
}

function validCoordinatePair(latitude: number | null | undefined, longitude: number | null | undefined) {
  if (latitude == null && longitude == null) return false;
  if (latitude == null || longitude == null) throw new Error("INMET_FIELD_COORDINATES_INCOMPLETE");
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error("INMET_FIELD_LATITUDE_INVALID");
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("INMET_FIELD_LONGITUDE_INVALID");
  return true;
}

/**
 * Coleta a última observação diária COMPLETA do INMET aplicável à região técnica
 * do talhão. A estação continua sendo observação regional; nunca é promovida a
 * sensor do campo.
 *
 * A função é deliberadamente não bloqueante para o laudo:
 * falha de rede/estação/região vira estado UNAVAILABLE/NOT_APPLICABLE.
 */
export async function collectInmetRegionalObservation(input: {
  fieldLatitude?: number | null;
  fieldLongitude?: number | null;
  fieldRegions: TechnicalRegionApplicabilityRef[];
  resolveStationRegions: (input: {
    stateCode: string;
    latitude: number;
    longitude: number;
  }) => Promise<TechnicalRegionApplicabilityRef[]>;
  maxDistanceKm?: number | null;
  nearestFetcher?: NearestFetcher;
  observationFetcher?: ObservationFetcher;
  now?: () => Date;
}): Promise<InmetRegionalObservation> {
  const hasCoordinates = validCoordinatePair(input.fieldLatitude, input.fieldLongitude);
  if (!hasCoordinates) {
    return {
      status: "SKIPPED",
      role: "REGIONAL_OBSERVED_STATION",
      observedDateUtc: null,
      observationWindowFromUtc: null,
      observationWindowToUtc: null,
      station: null,
      applicability: null,
      metricEvidence: [],
      warnings: ["INMET_SKIPPED_FIELD_COORDINATES_UNAVAILABLE"],
      errorCode: null,
    };
  }

  let nearest: Awaited<ReturnType<NearestFetcher>>;
  try {
    nearest = await (input.nearestFetcher ?? fetchNearestInmetAutomaticStation)({
      latitude: input.fieldLatitude!,
      longitude: input.fieldLongitude!,
    });
  } catch (error) {
    return {
      status: "UNAVAILABLE",
      role: "REGIONAL_OBSERVED_STATION",
      observedDateUtc: null,
      observationWindowFromUtc: null,
      observationWindowToUtc: null,
      station: null,
      applicability: null,
      metricEvidence: [],
      warnings: ["INMET_STATION_DISCOVERY_UNAVAILABLE"],
      errorCode: errorCode(error),
    };
  }

  const station = {
    code: nearest.station.stationCode,
    name: nearest.station.name,
    stateCode: nearest.station.stateCode,
    latitude: nearest.station.latitude,
    longitude: nearest.station.longitude,
    altitudeM: nearest.station.altitudeM,
    distanceKm: nearest.distanceKm,
    sourceUrl: nearest.sourceUrl,
  };

  let stationRegions: TechnicalRegionApplicabilityRef[];
  try {
    stationRegions = await input.resolveStationRegions({
      stateCode: station.stateCode,
      latitude: station.latitude,
      longitude: station.longitude,
    });
  } catch (error) {
    return {
      status: "UNAVAILABLE",
      role: "REGIONAL_OBSERVED_STATION",
      observedDateUtc: null,
      observationWindowFromUtc: null,
      observationWindowToUtc: null,
      station,
      applicability: null,
      metricEvidence: [],
      warnings: ["INMET_STATION_TECHNICAL_REGION_RESOLUTION_UNAVAILABLE"],
      errorCode: errorCode(error),
    };
  }

  const applicability = assessInmetStationApplicability({
    fieldRegions: input.fieldRegions,
    stationRegions,
    distanceKm: station.distanceKm,
    maxDistanceKm: input.maxDistanceKm,
  });
  if (!applicability.applicable) {
    return {
      status: "NOT_APPLICABLE",
      role: "REGIONAL_OBSERVED_STATION",
      observedDateUtc: null,
      observationWindowFromUtc: null,
      observationWindowToUtc: null,
      station,
      applicability,
      metricEvidence: [],
      warnings: applicability.warnings,
      errorCode: null,
    };
  }

  const now = (input.now ?? (() => new Date()))();
  const observedDateUtc = previousCompleteUtcDate(now);
  const observationWindowFromUtc = utcDateMinusDays(observedDateUtc, 2);
  const observationWindowToUtc = observedDateUtc;

  try {
    const fetched = await (input.observationFetcher ?? fetchInmetHourlyStationObservations)({
      stationCode: station.code,
      dateFrom: observationWindowFromUtc,
      dateTo: observationWindowToUtc,
      now: () => now,
    });
    const aggregate = aggregateInmetAutomaticStationDay({
      observations: fetched.observations,
      targetDateUtc: observedDateUtc,
      technicalRegionCodes: applicability.sharedTechnicalRegionCodes,
      retrievedAt: fetched.retrievedAt,
      latitude: station.latitude,
      longitude: station.longitude,
    });
    const rainDuration = deriveInmetContinuousRainHours({
      observations: fetched.observations,
      technicalRegionCodes: applicability.sharedTechnicalRegionCodes,
      retrievedAt: fetched.retrievedAt,
      latitude: station.latitude,
      longitude: station.longitude,
      expectedHourlySlots: 72,
    });
    const metricEvidence = [
      ...aggregate.evidence,
      ...(rainDuration.evidence ? [rainDuration.evidence] : []),
    ];
    return {
      status: aggregate.evidence.length ? "READY" : "PARTIAL",
      role: "REGIONAL_OBSERVED_STATION",
      observedDateUtc,
      observationWindowFromUtc,
      observationWindowToUtc,
      station,
      applicability,
      metricEvidence,
      warnings: [...new Set([
        ...applicability.warnings,
        ...fetched.warnings,
        ...aggregate.warnings,
        ...rainDuration.warnings,
      ])],
      errorCode: null,
    };
  } catch (error) {
    return {
      status: "UNAVAILABLE",
      role: "REGIONAL_OBSERVED_STATION",
      observedDateUtc,
      observationWindowFromUtc,
      observationWindowToUtc,
      station,
      applicability,
      metricEvidence: [],
      warnings: [...new Set([...applicability.warnings, "INMET_OBSERVATION_FETCH_UNAVAILABLE"])],
      errorCode: errorCode(error),
    };
  }
}
