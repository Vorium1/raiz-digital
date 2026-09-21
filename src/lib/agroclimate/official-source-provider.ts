import {
  adaptCptecForecastXml,
  buildCptecSevenDayLatLonUrl,
} from "../../domain/official-agroclimate-ingestion.ts";
import {
  INMET_AUTOMATIC_STATIONS_URL,
  adaptInmetAutomaticStationCatalog,
  adaptInmetHourlyApiRows,
  buildInmetHourlyStationUrl,
  selectNearestOperativeInmetAutomaticStation,
} from "../../domain/inmet-official-observation.ts";

export const MAPA_ZARC_DATASET_ID = "6d3d141c-885e-41a4-ab7f-dc8ff323b96f";
export const MAPA_ZARC_CKAN_PACKAGE_URL =
  `https://dados.agricultura.gov.br/api/3/action/package_show?id=${MAPA_ZARC_DATASET_ID}`;

type FetchResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
  headers?: { get(name: string): string | null };
};

export type OfficialSourceFetch = (
  url: string,
  init?: RequestInit,
) => Promise<FetchResponse>;

function defaultFetch(url: string, init?: RequestInit): Promise<FetchResponse> {
  return fetch(url, init);
}

function safeTimeoutMs(value?: number) {
  const timeout = Math.round(value ?? 12_000);
  if (!Number.isFinite(timeout) || timeout < 1_000 || timeout > 60_000) {
    throw new Error("OFFICIAL_SOURCE_TIMEOUT_INVALID");
  }
  return timeout;
}

async function fetchWithTimeout(
  url: string,
  input: { fetchImpl?: OfficialSourceFetch; timeoutMs?: number; accept: string },
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), safeTimeoutMs(input.timeoutMs));
  try {
    return await (input.fetchImpl ?? defaultFetch)(url, {
      headers: { accept: input.accept },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("OFFICIAL_SOURCE_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchCptecSevenDayMetricEvidence(input: {
  latitude: number;
  longitude: number;
  utcOffset: string;
  technicalRegionCodes: string[];
  fetchImpl?: OfficialSourceFetch;
  now?: () => Date;
  timeoutMs?: number;
}) {
  const sourceUrl = buildCptecSevenDayLatLonUrl(input.latitude, input.longitude);
  const response = await fetchWithTimeout(sourceUrl, {
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs,
    accept: "application/xml,text/xml;q=0.9,*/*;q=0.1",
  });
  if (!response.ok) throw new Error(`CPTEC_HTTP_${response.status}`);
  const xml = await response.text();
  const retrievedAt = (input.now ?? (() => new Date()))().toISOString();
  const adapted = adaptCptecForecastXml({
    xml,
    technicalRegionCodes: input.technicalRegionCodes,
    retrievedAt,
    sourceRecordPrefix: `CPTEC:${input.latitude}:${input.longitude}:${retrievedAt}`,
    utcOffset: input.utcOffset,
    latitude: input.latitude,
    longitude: input.longitude,
  });
  return {
    ...adapted,
    provider: "CPTEC_INPE" as const,
    sourceUrl,
    retrievedAt,
  };
}


export async function fetchNearestInmetAutomaticStation(input: {
  latitude: number;
  longitude: number;
  fetchImpl?: OfficialSourceFetch;
  timeoutMs?: number;
}) {
  const response = await fetchWithTimeout(INMET_AUTOMATIC_STATIONS_URL, {
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs,
    accept: "application/json",
  });
  if (!response.ok) throw new Error(`INMET_STATIONS_HTTP_${response.status}`);
  const stations = adaptInmetAutomaticStationCatalog(await response.json());
  const selected = selectNearestOperativeInmetAutomaticStation({
    stations,
    latitude: input.latitude,
    longitude: input.longitude,
  });
  return {
    ...selected,
    provider: "INMET" as const,
    sourceUrl: INMET_AUTOMATIC_STATIONS_URL,
  };
}

export async function fetchInmetHourlyStationObservations(input: {
  stationCode: string;
  dateFrom: string;
  dateTo: string;
  fetchImpl?: OfficialSourceFetch;
  timeoutMs?: number;
  now?: () => Date;
}) {
  const sourceUrl = buildInmetHourlyStationUrl({
    stationCode: input.stationCode,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });
  const response = await fetchWithTimeout(sourceUrl, {
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs,
    accept: "application/json",
  });
  if (!response.ok) throw new Error(`INMET_OBSERVATIONS_HTTP_${response.status}`);
  const observations = adaptInmetHourlyApiRows(await response.json());
  const stationCodes = [...new Set(observations.map((item) => item.stationCode.trim().toUpperCase()))];
  const requested = input.stationCode.trim().toUpperCase();
  if (stationCodes.some((code) => code !== requested)) {
    throw new Error("INMET_OBSERVATION_STATION_MISMATCH");
  }
  return {
    provider: "INMET" as const,
    sourceUrl,
    retrievedAt: (input.now ?? (() => new Date()))().toISOString(),
    stationCode: requested,
    observations,
    warnings: ["INMET_AUTOMATIC_STATION_DATA_RAW_NOT_QUALITY_CONTROLLED_BY_RAIZ"],
  };
}

type CkanResource = {
  id?: unknown;
  name?: unknown;
  format?: unknown;
  state?: unknown;
  url?: unknown;
  last_modified?: unknown;
  revision_id?: unknown;
  url_type?: unknown;
};

type CkanPackagePayload = {
  success?: unknown;
  result?: {
    id?: unknown;
    metadata_modified?: unknown;
    resources?: unknown;
  };
};

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function assertOfficialMapaUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.hostname !== "dados.agricultura.gov.br") {
    throw new Error("ZARC_RESOURCE_URL_NOT_OFFICIAL_MAPA");
  }
  return url.toString();
}

export type MapaZarcResourceMetadata = {
  datasetId: string;
  resourceId: string;
  name: string;
  seasonStartYear: number;
  seasonEndYear: number;
  format: "CSV";
  state: string | null;
  downloadUrl: string;
  lastModified: string | null;
  revisionId: string | null;
  urlType: string | null;
  catalogMetadataModified: string | null;
};

export function selectMapaZarcSeasonResource(
  payload: unknown,
  seasonStartYear: number,
  seasonEndYear: number,
): MapaZarcResourceMetadata {
  if (!Number.isInteger(seasonStartYear) || !Number.isInteger(seasonEndYear)
      || seasonEndYear !== seasonStartYear + 1) {
    throw new Error("ZARC_SEASON_INVALID");
  }
  const body = payload as CkanPackagePayload;
  if (body?.success !== true || body.result?.id !== MAPA_ZARC_DATASET_ID) {
    throw new Error("ZARC_CKAN_PACKAGE_INVALID");
  }
  if (!Array.isArray(body.result.resources)) throw new Error("ZARC_CKAN_RESOURCES_MISSING");

  const expectedName = `Tábua de risco - Safra ${seasonStartYear}/${seasonEndYear}`;
  const candidates = (body.result.resources as CkanResource[]).filter((resource) =>
    stringOrNull(resource.name)?.localeCompare(expectedName, "pt-BR", { sensitivity: "base" }) === 0
    && stringOrNull(resource.format)?.toUpperCase() === "CSV"
    && stringOrNull(resource.id)
    && stringOrNull(resource.url)
  );
  if (candidates.length !== 1) {
    throw new Error(candidates.length ? "ZARC_SEASON_RESOURCE_AMBIGUOUS" : "ZARC_SEASON_RESOURCE_NOT_FOUND");
  }
  const resource = candidates[0];
  const resourceId = stringOrNull(resource.id)!;
  const downloadUrl = assertOfficialMapaUrl(stringOrNull(resource.url)!);
  return {
    datasetId: MAPA_ZARC_DATASET_ID,
    resourceId,
    name: expectedName,
    seasonStartYear,
    seasonEndYear,
    format: "CSV",
    state: stringOrNull(resource.state),
    downloadUrl,
    lastModified: stringOrNull(resource.last_modified),
    revisionId: stringOrNull(resource.revision_id),
    urlType: stringOrNull(resource.url_type),
    catalogMetadataModified: stringOrNull(body.result.metadata_modified),
  };
}

export async function fetchMapaZarcSeasonResource(input: {
  seasonStartYear: number;
  seasonEndYear: number;
  fetchImpl?: OfficialSourceFetch;
  timeoutMs?: number;
}) {
  const response = await fetchWithTimeout(MAPA_ZARC_CKAN_PACKAGE_URL, {
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs,
    accept: "application/json",
  });
  if (!response.ok) throw new Error(`ZARC_CKAN_HTTP_${response.status}`);
  const payload = await response.json();
  return selectMapaZarcSeasonResource(payload, input.seasonStartYear, input.seasonEndYear);
}
