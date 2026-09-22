import type { AgroclimateMetricEvidence } from "../../domain/agroclimate-metric-evidence.ts";
import type { MapaZarcResourceMetadata } from "./official-source-provider.ts";
import {
  fetchCptecSevenDayMetricEvidence,
  fetchMapaZarcSeasonResource,
} from "./official-source-provider.ts";

export type OfficialAgroclimateEnrichmentStatus = "READY" | "PARTIAL" | "UNAVAILABLE";

export type OfficialAgroclimateEnrichment = {
  status: OfficialAgroclimateEnrichmentStatus;
  metricEvidence: AgroclimateMetricEvidence[];
  cptec: {
    status: "READY" | "SKIPPED" | "UNAVAILABLE";
    forecastScope: "SHORT_RANGE_7_DAY";
    sourceUrl: string | null;
    retrievedAt: string | null;
    sourceUpdatedOn: string | null;
    warnings: string[];
    errorCode: string | null;
  };
  zarc: {
    status: "READY" | "SKIPPED" | "UNAVAILABLE";
    role: "PLANTING_RISK_ZONING";
    resource: MapaZarcResourceMetadata | null;
    errorCode: string | null;
  };
  warnings: string[];
};

type CptecFetcher = typeof fetchCptecSevenDayMetricEvidence;
type ZarcFetcher = typeof fetchMapaZarcSeasonResource;

function errorCode(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 180);
  return "OFFICIAL_SOURCE_UNAVAILABLE";
}

function validCoordinatePair(latitude: number | null | undefined, longitude: number | null | undefined) {
  if (latitude == null && longitude == null) return false;
  if (latitude == null || longitude == null) throw new Error("AGROCLIMATE_COORDINATES_INCOMPLETE");
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error("AGROCLIMATE_LATITUDE_INVALID");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("AGROCLIMATE_LONGITUDE_INVALID");
  }
  return true;
}

function normalizedRegions(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean))];
}

function overallStatus(input: {
  cptec: OfficialAgroclimateEnrichment["cptec"]["status"];
  zarc: OfficialAgroclimateEnrichment["zarc"]["status"];
}) {
  const requested = [input.cptec, input.zarc].filter((status) => status !== "SKIPPED");
  if (!requested.length) return "UNAVAILABLE" as const;
  if (requested.every((status) => status === "READY")) return "READY" as const;
  if (requested.some((status) => status === "READY")) return "PARTIAL" as const;
  return "UNAVAILABLE" as const;
}

/**
 * Coleta contexto agroclimático oficial como ENRIQUECIMENTO OPCIONAL.
 *
 * Invariantes:
 * - nenhuma falha de rede desta função invalida análise de solo/prescrição já calculável;
 * - CPTEC é curto prazo (7 dias), nunca previsão sazonal;
 * - ZARC é zoneamento/janela de plantio, nunca observação/previsão meteorológica;
 * - erros viram estado/proveniência; só entradas estruturalmente inválidas lançam exceção;
 * - sem coordenadas, CPTEC é simplesmente SKIPPED;
 * - sem safra ZARC, ZARC é simplesmente SKIPPED.
 */
export async function collectOfficialAgroclimateEnrichment(input: {
  latitude?: number | null;
  longitude?: number | null;
  utcOffset?: string | null;
  technicalRegionCodes?: string[];
  zarcSeason?: { startYear: number; endYear: number } | null;
  cptecFetcher?: CptecFetcher;
  zarcFetcher?: ZarcFetcher;
}): Promise<OfficialAgroclimateEnrichment> {
  const hasCoordinates = validCoordinatePair(input.latitude, input.longitude);
  const regions = normalizedRegions(input.technicalRegionCodes ?? []);

  let cptec: OfficialAgroclimateEnrichment["cptec"] = {
    status: "SKIPPED",
    forecastScope: "SHORT_RANGE_7_DAY",
    sourceUrl: null,
    retrievedAt: null,
    sourceUpdatedOn: null,
    warnings: [],
    errorCode: null,
  };
  let metricEvidence: AgroclimateMetricEvidence[] = [];

  if (hasCoordinates) {
    if (!input.utcOffset?.trim()) {
      cptec = {
        ...cptec,
        status: "UNAVAILABLE",
        errorCode: "CPTEC_UTC_OFFSET_REQUIRED",
      };
    } else if (!regions.length) {
      cptec = {
        ...cptec,
        status: "UNAVAILABLE",
        errorCode: "CPTEC_TECHNICAL_REGION_REQUIRED",
      };
    } else {
      try {
        const result = await (input.cptecFetcher ?? fetchCptecSevenDayMetricEvidence)({
          latitude: input.latitude!,
          longitude: input.longitude!,
          utcOffset: input.utcOffset,
          technicalRegionCodes: regions,
        });
        metricEvidence = result.evidence;
        cptec = {
          status: "READY",
          forecastScope: "SHORT_RANGE_7_DAY",
          sourceUrl: result.sourceUrl,
          retrievedAt: result.retrievedAt,
          sourceUpdatedOn: result.sourceUpdatedOn,
          warnings: result.warnings,
          errorCode: null,
        };
      } catch (error) {
        cptec = {
          ...cptec,
          status: "UNAVAILABLE",
          errorCode: errorCode(error),
        };
      }
    }
  }

  let zarc: OfficialAgroclimateEnrichment["zarc"] = {
    status: "SKIPPED",
    role: "PLANTING_RISK_ZONING",
    resource: null,
    errorCode: null,
  };

  if (input.zarcSeason) {
    try {
      const resource = await (input.zarcFetcher ?? fetchMapaZarcSeasonResource)({
        seasonStartYear: input.zarcSeason.startYear,
        seasonEndYear: input.zarcSeason.endYear,
      });
      zarc = {
        status: "READY",
        role: "PLANTING_RISK_ZONING",
        resource,
        errorCode: null,
      };
    } catch (error) {
      zarc = {
        ...zarc,
        status: "UNAVAILABLE",
        errorCode: errorCode(error),
      };
    }
  }

  const warnings = [
    ...cptec.warnings,
    ...(cptec.status === "UNAVAILABLE" ? ["CPTEC_OPTIONAL_ENRICHMENT_UNAVAILABLE"] : []),
    ...(zarc.status === "UNAVAILABLE" ? ["ZARC_OPTIONAL_ENRICHMENT_UNAVAILABLE"] : []),
    ...(cptec.status === "SKIPPED" && zarc.status === "SKIPPED"
      ? ["NO_OFFICIAL_AGROCLIMATE_SOURCE_REQUESTED_OR_LOCATION_NOT_AVAILABLE"]
      : []),
  ];

  return {
    status: overallStatus({ cptec: cptec.status, zarc: zarc.status }),
    metricEvidence,
    cptec,
    zarc,
    warnings: [...new Set(warnings)],
  };
}
