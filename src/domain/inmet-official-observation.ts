import type { InmetHourlyObservation } from "./official-agroclimate-ingestion.ts";

export const INMET_AUTOMATIC_STATIONS_URL = "https://apitempo.inmet.gov.br/estacoes/T";
export const INMET_API_ORIGIN = "https://apitempo.inmet.gov.br";

type RawRecord = Record<string, unknown>;

export type InmetAutomaticStation = {
  stationCode: string;
  name: string;
  stateCode: string;
  latitude: number;
  longitude: number;
  altitudeM: number | null;
  entity: string;
  stationType: string;
  status: string;
  operationStartedAt: string | null;
  operationEndedAt: string | null;
};

export type InmetStationSelection = {
  station: InmetAutomaticStation;
  distanceKm: number;
  selectionRule: "NEAREST_OPERATIVE_INMET_AUTOMATIC_STATION";
};

function record(value: unknown, label: string): RawRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}_INVALID`);
  }
  return value as RawRecord;
}

function textValue(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || /^(?:null|nan|na|n\/a)$/i.test(text)) return null;
  return text;
}

function numericValue(value: unknown) {
  const text = textValue(value);
  if (text == null || /^(?:9999|-9999|9999\.0|-9999\.0)$/.test(text)) return null;
  const numeric = Number(text.replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}

function requiredText(row: RawRecord, key: string, label: string) {
  const value = textValue(row[key]);
  if (!value) throw new Error(`${label}_${key}_MISSING`);
  return value;
}

function requiredCoordinate(row: RawRecord, key: string, min: number, max: number) {
  const value = numericValue(row[key]);
  if (value == null || value < min || value > max) {
    throw new Error(`INMET_STATION_${key}_INVALID`);
  }
  return value;
}

function optionalDateTime(value: unknown) {
  const text = textValue(value);
  if (!text) return null;
  return Number.isFinite(Date.parse(text)) ? text : null;
}

function normalizeStation(row: RawRecord): InmetAutomaticStation | null {
  const entity = textValue(row.SG_ENTIDADE)?.toUpperCase() ?? "";
  const stationType = textValue(row.TP_ESTACAO)?.toUpperCase() ?? "";
  if (entity !== "INMET" || !stationType.startsWith("AUTOM")) return null;

  const stationCode = requiredText(row, "CD_ESTACAO", "INMET_STATION").toUpperCase();
  if (!/^[A-Z0-9]{3,12}$/.test(stationCode)) throw new Error("INMET_STATION_CODE_INVALID");

  return {
    stationCode,
    name: requiredText(row, "DC_NOME", "INMET_STATION"),
    stateCode: requiredText(row, "SG_ESTADO", "INMET_STATION").toUpperCase(),
    latitude: requiredCoordinate(row, "VL_LATITUDE", -90, 90),
    longitude: requiredCoordinate(row, "VL_LONGITUDE", -180, 180),
    altitudeM: numericValue(row.VL_ALTITUDE),
    entity,
    stationType,
    status: (textValue(row.CD_SITUACAO) ?? "UNKNOWN").toUpperCase(),
    operationStartedAt: optionalDateTime(row.DT_INICIO_OPERACAO),
    operationEndedAt: optionalDateTime(row.DT_FIM_OPERACAO),
  };
}

export function adaptInmetAutomaticStationCatalog(payload: unknown): InmetAutomaticStation[] {
  if (!Array.isArray(payload)) throw new Error("INMET_STATION_CATALOG_INVALID");
  const stations: InmetAutomaticStation[] = [];
  for (const item of payload) {
    const station = normalizeStation(record(item, "INMET_STATION_ROW"));
    if (station) stations.push(station);
  }
  return stations;
}

function radians(value: number) {
  return value * Math.PI / 180;
}

export function greatCircleDistanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const earthRadiusKm = 6371.0088;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isOperative(status: string) {
  return status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() === "OPERANTE";
}

/**
 * Descobre a estação oficial mais próxima, mas NÃO decide que ela representa o talhão.
 * A distância é devolvida explicitamente; a camada agronômica/geográfica posterior
 * precisa validar se a estação é aplicável à região técnica do campo.
 */
export function selectNearestOperativeInmetAutomaticStation(input: {
  stations: InmetAutomaticStation[];
  latitude: number;
  longitude: number;
}): InmetStationSelection {
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    throw new Error("INMET_REFERENCE_LATITUDE_INVALID");
  }
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    throw new Error("INMET_REFERENCE_LONGITUDE_INVALID");
  }
  const operative = input.stations.filter((station) => isOperative(station.status));
  if (!operative.length) throw new Error("INMET_NO_OPERATIVE_AUTOMATIC_STATION");
  const candidates = operative.map((station) => ({
    station,
    distanceKm: greatCircleDistanceKm(
      { latitude: input.latitude, longitude: input.longitude },
      { latitude: station.latitude, longitude: station.longitude },
    ),
  })).sort((a, b) => a.distanceKm - b.distanceKm || a.station.stationCode.localeCompare(b.station.stationCode));
  return {
    station: candidates[0].station,
    distanceKm: candidates[0].distanceKm,
    selectionRule: "NEAREST_OPERATIVE_INMET_AUTOMATIC_STATION",
  };
}

function normalizeInmetHour(raw: unknown) {
  const text = textValue(raw);
  if (!text) throw new Error("INMET_HOUR_MISSING");
  const digits = text.replace(/\D/g, "").padStart(4, "0");
  if (!/^\d{4}$/.test(digits)) throw new Error("INMET_HOUR_INVALID");
  const hour = Number(digits.slice(0, 2));
  const minute = Number(digits.slice(2));
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error("INMET_HOUR_INVALID");
  }
  return { hour, minute };
}

function normalizeInmetDate(raw: unknown) {
  const value = textValue(raw);
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T12:00:00Z`))) {
    throw new Error("INMET_DATE_INVALID");
  }
  return value;
}

/**
 * Adapta a resposta horária do INMET preservando a semântica oficial:
 * DT_MEDICAO + HR_MEDICAO são UTC; valores ausentes/sentinelas permanecem null.
 * Nenhum preenchimento, interpolação ou clamp é feito aqui.
 */
export function adaptInmetHourlyApiRows(payload: unknown): InmetHourlyObservation[] {
  if (!Array.isArray(payload)) throw new Error("INMET_HOURLY_PAYLOAD_INVALID");
  return payload.map((item) => {
    const row = record(item, "INMET_HOURLY_ROW");
    const stationCode = requiredText(row, "CD_ESTACAO", "INMET_HOURLY").toUpperCase();
    const date = normalizeInmetDate(row.DT_MEDICAO);
    const { hour, minute } = normalizeInmetHour(row.HR_MEDICAO);
    return {
      stationCode,
      observedAtUtc: `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
      temperatureC: numericValue(row.TEM_INS),
      precipitationMm: numericValue(row.CHUVA),
      windGustMps: numericValue(row.VEN_RAJ),
      globalRadiationKjM2: numericValue(row.RAD_GLO),
    };
  });
}

export function buildInmetHourlyStationUrl(input: {
  dateFrom: string;
  dateTo: string;
  stationCode: string;
}) {
  for (const [label, value] of [["dateFrom", input.dateFrom], ["dateTo", input.dateTo]] as const) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T12:00:00Z`))) {
      throw new Error(`INMET_${label.toUpperCase()}_INVALID`);
    }
  }
  if (Date.parse(`${input.dateTo}T12:00:00Z`) < Date.parse(`${input.dateFrom}T12:00:00Z`)) {
    throw new Error("INMET_DATE_RANGE_INVALID");
  }
  const stationCode = input.stationCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,12}$/.test(stationCode)) throw new Error("INMET_STATION_CODE_INVALID");
  return `${INMET_API_ORIGIN}/estacao/${input.dateFrom}/${input.dateTo}/${stationCode}`;
}
