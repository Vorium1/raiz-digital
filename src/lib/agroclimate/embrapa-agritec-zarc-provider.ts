import type { OfficialSourceFetch } from "./official-source-provider.ts";

export const EMBRAPA_AGRITEC_V2_BASE_URL = "https://api.cnptia.embrapa.br/agritec/v2";

export type AgritecZarcWindow = {
  municipalityName: string;
  stateCode: string;
  cropName: string;
  cycleLabel: string;
  soilLabel: string;
  startDay: number;
  startMonth: number;
  endDay: number;
  endMonth: number;
  seasonStartYear: number;
  seasonEndYear: number;
  riskPct: 20 | 30 | 40;
  ordinance: string;
  source: "EMBRAPA_AGRITEC_V2_ZARC";
};

type Raw = Record<string, unknown>;

function record(value: unknown, label: string): Raw {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}_INVALID`);
  return value as Raw;
}

function requiredString(row: Raw, key: string) {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`AGRITEC_${key}_MISSING`);
  return value.trim();
}

function requiredInteger(row: Raw, key: string) {
  const value = Number(row[key]);
  if (!Number.isInteger(value)) throw new Error(`AGRITEC_${key}_INVALID`);
  return value;
}

function validDateParts(day: number, month: number, label: string) {
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new Error(`AGRITEC_${label}_INVALID`);
  const sampleYear = 2024;
  const date = new Date(Date.UTC(sampleYear, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`AGRITEC_${label}_INVALID`);
  }
}

function risk(value: unknown): 20 | 30 | 40 {
  const parsed = Number(value);
  if (parsed !== 20 && parsed !== 30 && parsed !== 40) {
    throw new Error(`AGRITEC_ZARC_RISK_UNSUPPORTED:${String(value)}`);
  }
  return parsed;
}

export function adaptAgritecZarcPayload(payload: unknown): AgritecZarcWindow[] {
  const root = record(payload, "AGRITEC_PAYLOAD");
  if (!Array.isArray(root.data)) throw new Error("AGRITEC_DATA_ARRAY_MISSING");
  return root.data.map((value) => {
    const row = record(value, "AGRITEC_ZARC_ROW");
    const startDay = requiredInteger(row, "diaIni");
    const startMonth = requiredInteger(row, "mesIni");
    const endDay = requiredInteger(row, "diaFim");
    const endMonth = requiredInteger(row, "mesFim");
    const seasonStartYear = requiredInteger(row, "safraIni");
    const seasonEndYear = requiredInteger(row, "safraFim");
    validDateParts(startDay, startMonth, "START_DATE");
    validDateParts(endDay, endMonth, "END_DATE");
    if (seasonEndYear !== seasonStartYear + 1) throw new Error("AGRITEC_ZARC_SEASON_INVALID");
    const stateCode = requiredString(row, "uf").toUpperCase();
    if (!/^[A-Z]{2}$/.test(stateCode)) throw new Error("AGRITEC_UF_INVALID");
    return {
      municipalityName: requiredString(row, "municipio"),
      stateCode,
      cropName: requiredString(row, "cultura"),
      cycleLabel: requiredString(row, "ciclo"),
      soilLabel: requiredString(row, "solo"),
      startDay,
      startMonth,
      endDay,
      endMonth,
      seasonStartYear,
      seasonEndYear,
      riskPct: risk(row.risco),
      ordinance: requiredString(row, "portaria"),
      source: "EMBRAPA_AGRITEC_V2_ZARC" as const,
    };
  });
}

function validateIbge(value: string) {
  const normalized = value.trim();
  if (!/^\d{7}$/.test(normalized)) throw new Error("AGRITEC_IBGE_CODE_INVALID");
  return normalized;
}

function validateCultureId(value: number) {
  if (!Number.isInteger(value) || value <= 0) throw new Error("AGRITEC_CULTURE_ID_INVALID");
  return value;
}

function safeTimeoutMs(value?: number) {
  const timeout = Math.round(value ?? 12_000);
  if (!Number.isFinite(timeout) || timeout < 1_000 || timeout > 60_000) {
    throw new Error("AGRITEC_TIMEOUT_INVALID");
  }
  return timeout;
}

function defaultFetch(url: string, init?: RequestInit) {
  return fetch(url, init) as ReturnType<OfficialSourceFetch>;
}

/**
 * Provider opcional para o ZARC via Agritec v2.
 *
 * O idCultura é o identificador da própria API Agritec e NÃO é presumido como
 * equivalente ao Cod_Cultura do CSV MAPA. A resolução desse id deve vir da
 * própria Agritec ou de mapeamento explicitamente homologado.
 */
export async function fetchAgritecZarcWindows(input: {
  accessToken: string;
  agritecCultureId: number;
  ibgeMunicipalityCode: string;
  fetchImpl?: OfficialSourceFetch;
  timeoutMs?: number;
  now?: () => Date;
}): Promise<{
  windows: AgritecZarcWindow[];
  provider: "EMBRAPA_AGRITEC_V2";
  sourceUrl: string;
  retrievedAt: string;
}> {
  const token = input.accessToken.trim();
  if (!token) throw new Error("AGROAPI_ACCESS_TOKEN_REQUIRED");
  const cultureId = validateCultureId(input.agritecCultureId);
  const ibge = validateIbge(input.ibgeMunicipalityCode);
  const url = new URL(`${EMBRAPA_AGRITEC_V2_BASE_URL}/zoneamento`);
  url.searchParams.set("idCultura", String(cultureId));
  url.searchParams.set("codigoIBGE", ibge);
  url.searchParams.set("risco", "todos");
  const sourceUrl = url.toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), safeTimeoutMs(input.timeoutMs));
  let response;
  try {
    response = await (input.fetchImpl ?? defaultFetch)(sourceUrl, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("AGRITEC_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("AGRITEC_AUTHORIZATION_FAILED");
    throw new Error(`AGRITEC_HTTP_${response.status}`);
  }
  return {
    windows: adaptAgritecZarcPayload(await response.json()),
    provider: "EMBRAPA_AGRITEC_V2",
    sourceUrl,
    retrievedAt: (input.now ?? (() => new Date()))().toISOString(),
  };
}
