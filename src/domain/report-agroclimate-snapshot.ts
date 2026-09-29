import type { AgroclimateMetricEvidence } from "./agroclimate-metric-evidence.ts";

export type ReportAgroclimateMetric = {
  metric: string;
  label: string;
  value: number;
  unit: string;
  source: string;
  evidenceKind: string;
  sourceRecordId: string;
  issuedAt: string;
  validFrom: string;
  validUntil: string;
};

export type ReportAgroclimateSnapshot = {
  status: "READY" | "PARTIAL" | "UNAVAILABLE";
  collectedAt: string;
  analysisId: string;
  location: {
    state: string;
    municipality: string;
    latitude: number | null;
    longitude: number | null;
    coordinateSource: string;
    timeZone: string | null;
    utcOffset: string | null;
  };
  season: {
    label: string;
    zarcSeason: { startYear: number; endYear: number } | null;
  };
  technicalRegionCodes: string[];
  forecast: {
    status: string;
    role: "SHORT_RANGE_7_DAY";
    sourceUrl: string | null;
    retrievedAt: string | null;
    sourceUpdatedOn: string | null;
    metrics: ReportAgroclimateMetric[];
  };
  observed: {
    status: string;
    role: "REGIONAL_OBSERVED_STATION";
    observedDateUtc: string | null;
    station: {
      code: string;
      name: string;
      stateCode: string;
      distanceKm: number;
      sourceUrl: string;
    } | null;
    metrics: ReportAgroclimateMetric[];
  };
  zarc: {
    status: string;
    role: "PLANTING_RISK_ZONING";
    resource: {
      name: string;
      seasonStartYear: number;
      seasonEndYear: number;
      downloadUrl: string;
      lastModified: string | null;
    } | null;
  };
  warnings: string[];
  automaticDoseAdjustmentAllowed: false;
};

const METRIC_PRESENTATION: Record<string, { label: string; unit: string; priority: number }> = {
  PRECIPITATION_MM: { label: "Precipitação", unit: "mm", priority: 10 },
  DAY_MAX_TEMP_C: { label: "Temperatura máxima", unit: "°C", priority: 20 },
  DAY_MEAN_TEMP_C: { label: "Temperatura média", unit: "°C", priority: 30 },
  DAY_MIN_TEMP_C: { label: "Temperatura mínima", unit: "°C", priority: 40 },
  RELATIVE_HUMIDITY_PCT: { label: "Umidade relativa", unit: "%", priority: 50 },
  WIND_KMH: { label: "Vento", unit: "km/h", priority: 60 },
  WIND_GUST_KMH: { label: "Rajada", unit: "km/h", priority: 70 },
  GLOBAL_SOLAR_RADIATION_MJ_M2_DAY: { label: "Radiação solar global", unit: "MJ/m²/dia", priority: 80 },
  CONTINUOUS_RAIN_HOURS: { label: "Chuva contínua", unit: "h", priority: 90 },
  DEW_POINT_C: { label: "Ponto de orvalho", unit: "°C", priority: 100 },
};

function metricPresentation(metric: string) {
  return METRIC_PRESENTATION[metric] ?? { label: metric, unit: "", priority: 999 };
}

function mapMetrics(values: AgroclimateMetricEvidence[]): ReportAgroclimateMetric[] {
  return values
    .filter((item) => Number.isFinite(item.value))
    .map((item) => {
      const presentation = metricPresentation(item.metric);
      return {
        metric: item.metric,
        label: presentation.label,
        value: item.value,
        unit: presentation.unit,
        source: item.source,
        evidenceKind: item.evidenceKind,
        sourceRecordId: item.sourceRecordId,
        issuedAt: item.issuedAt,
        validFrom: item.validFrom,
        validUntil: item.validUntil,
      };
    })
    .sort((a, b) => {
      const priority = metricPresentation(a.metric).priority - metricPresentation(b.metric).priority;
      return priority || a.metric.localeCompare(b.metric);
    });
}

export function buildReportAgroclimateSnapshot(input: {
  collectedAt: string;
  analysisId: string;
  location: {
    state: string;
    municipality: string;
    latitude: number | null;
    longitude: number | null;
    coordinateSource: string;
    timeZone: string | null;
    utcOffset: string | null;
  };
  season: {
    label: string;
    zarcSeason: { startYear: number; endYear: number } | null;
  };
  technicalRegionCodes: string[];
  enrichment: {
    status: "READY" | "PARTIAL" | "UNAVAILABLE";
    metricEvidence: AgroclimateMetricEvidence[];
    cptec: {
      status: string;
      sourceUrl: string | null;
      retrievedAt: string | null;
      sourceUpdatedOn: string | null;
    };
    zarc: {
      status: string;
      resource: {
        name: string;
        seasonStartYear: number;
        seasonEndYear: number;
        downloadUrl: string;
        lastModified: string | null;
      } | null;
    };
    warnings: string[];
  };
  inmetObservation: {
    status: string;
    observedDateUtc: string | null;
    station: {
      code: string;
      name: string;
      stateCode: string;
      distanceKm: number;
      sourceUrl: string;
    } | null;
    metricEvidence: AgroclimateMetricEvidence[];
    warnings: string[];
  };
  warnings: string[];
}): ReportAgroclimateSnapshot {
  const inmetUsable = input.inmetObservation.status === "READY" || input.inmetObservation.status === "PARTIAL";
  const forecastUsable = input.enrichment.status === "READY" || input.enrichment.status === "PARTIAL";
  const status: ReportAgroclimateSnapshot["status"] =
    input.enrichment.status === "READY" && input.inmetObservation.status === "READY"
      ? "READY"
      : forecastUsable || inmetUsable || input.enrichment.zarc.status === "READY"
        ? "PARTIAL"
        : "UNAVAILABLE";

  return {
    status,
    collectedAt: input.collectedAt,
    analysisId: input.analysisId,
    location: input.location,
    season: input.season,
    technicalRegionCodes: [...new Set(input.technicalRegionCodes)],
    forecast: {
      status: input.enrichment.cptec.status,
      role: "SHORT_RANGE_7_DAY",
      sourceUrl: input.enrichment.cptec.sourceUrl,
      retrievedAt: input.enrichment.cptec.retrievedAt,
      sourceUpdatedOn: input.enrichment.cptec.sourceUpdatedOn,
      metrics: mapMetrics(input.enrichment.metricEvidence),
    },
    observed: {
      status: input.inmetObservation.status,
      role: "REGIONAL_OBSERVED_STATION",
      observedDateUtc: input.inmetObservation.observedDateUtc,
      station: input.inmetObservation.station
        ? {
            code: input.inmetObservation.station.code,
            name: input.inmetObservation.station.name,
            stateCode: input.inmetObservation.station.stateCode,
            distanceKm: input.inmetObservation.station.distanceKm,
            sourceUrl: input.inmetObservation.station.sourceUrl,
          }
        : null,
      metrics: mapMetrics(input.inmetObservation.metricEvidence),
    },
    zarc: {
      status: input.enrichment.zarc.status,
      role: "PLANTING_RISK_ZONING",
      resource: input.enrichment.zarc.resource
        ? {
            name: input.enrichment.zarc.resource.name,
            seasonStartYear: input.enrichment.zarc.resource.seasonStartYear,
            seasonEndYear: input.enrichment.zarc.resource.seasonEndYear,
            downloadUrl: input.enrichment.zarc.resource.downloadUrl,
            lastModified: input.enrichment.zarc.resource.lastModified,
          }
        : null,
    },
    warnings: [...new Set([
      ...input.warnings,
      ...input.enrichment.warnings,
      ...input.inmetObservation.warnings,
    ])],
    automaticDoseAdjustmentAllowed: false,
  };
}
