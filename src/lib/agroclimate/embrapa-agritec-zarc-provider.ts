import type { OfficialSourceFetch } from "./official-source-provider.ts";

export const EMBRAPA_AGRITEC_V2_BASE_URL = "https://api.cnptia.embrapa.br/agritec/v2";

export type AgritecMunicipality = {
  ibgeCode: string;
  name: string;
  stateCode: string;
  latitude: number | null;
  longitude: number | null;
  updatedOn: string | null;
};

export type AgritecCulture = {
  id: number;
  name: string;
  fullName: string;
  seasonLabel: string | null;
  cultivation: string | null;
  climate: string | null;
  hasZoning: boolean;
  updatedOn: string | null;
};

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

function optionalString(row: Raw, key: string) {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalFiniteNumber(row: Raw, key: string) {
  if (row[key] == null || row[key] === "") return null;
  const value = Number(row[key]);
  if (!Number.isFinite(value)) throw new Error(`AGRITEC_${key}_INVALID`);
  return value;
}

function requiredBoolean(row: Raw, key: string) {
  if (typeof row[key] !== "boolean") throw new Error(`AGRITEC_${key}_INVALID`);
  return row[key] as boolean;
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

export function adaptAgritecMunicipalitiesPayload(payload: unknown): AgritecMunicipality[] {
  const root = record(payload, "AGRITEC_MUNICIPALITIES_PAYLOAD");
  if (!Array.isArray(root.data)) throw new Error("AGRITEC_MUNICIPALITIES_DATA_ARRAY_MISSING");
  return root.data.map((value) => {
    const row = record(value, "AGRITEC_MUNICIPALITY_ROW");
    const ibgeCode = String(requiredInteger(row, "codigoIBGE"));
    if (!/^\d{7}$/.test(ibgeCode)) throw new Error("AGRITEC_IBGE_CODE_INVALID");
    const stateCode = requiredString(row, "uf").toUpperCase();
    if (!/^[A-Z]{2}$/.test(stateCode)) throw new Error("AGRITEC_UF_INVALID");
    return {
      ibgeCode,
      name: requiredString(row, "nome"),
      stateCode,
      latitude: optionalFiniteNumber(row, "latitude"),
      longitude: optionalFiniteNumber(row, "longitude"),
      updatedOn: optionalString(row, "dataAtualizacao"),
    };
  });
}

export function adaptAgritecCulturesPayload(payload: unknown): AgritecCulture[] {
  const root = record(payload, "AGRITEC_CULTURES_PAYLOAD");
  if (!Array.isArray(root.data)) throw new Error("AGRITEC_CULTURES_DATA_ARRAY_MISSING");
  return root.data.map((value) => {
    const row = record(value, "AGRITEC_CULTURE_ROW");
    const id = requiredInteger(row, "id");
    if (id <= 0) throw new Error("AGRITEC_CULTURE_ID_INVALID");
    return {
      id,
      name: requiredString(row, "nome"),
      fullName: optionalString(row, "nomeCompleto") ?? requiredString(row, "nome"),
      seasonLabel: optionalString(row, "safra"),
      cultivation: optionalString(row, "cultivo"),
      climate: optionalString(row, "clima"),
      hasZoning: requiredBoolean(row, "hasZoneamento"),
      updatedOn: optionalString(row, "dataAtualizacao"),
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
async function fetchAgritecJson(input:{
  accessToken:string;
  sourceUrl:string;
  fetchImpl?:OfficialSourceFetch;
  timeoutMs?:number;
}) {
  const token=input.accessToken.trim();
  if(!token)throw new Error("AGROAPI_ACCESS_TOKEN_REQUIRED");
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),safeTimeoutMs(input.timeoutMs));
  let response;
  try{
    response=await (input.fetchImpl??defaultFetch)(input.sourceUrl,{
      method:"GET",
      headers:{accept:"application/json",authorization:`Bearer ${token}`},
      cache:"no-store",
      signal:controller.signal,
    });
  }catch(error){
    if(controller.signal.aborted)throw new Error("AGRITEC_TIMEOUT");
    throw error;
  }finally{
    clearTimeout(timeout);
  }
  if(!response.ok){
    if(response.status===401||response.status===403)throw new Error("AGRITEC_AUTHORIZATION_FAILED");
    throw new Error(`AGRITEC_HTTP_${response.status}`);
  }
  return response.json();
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


export async function fetchAgritecMunicipalities(input:{
  accessToken:string;
  stateCode:string;
  fetchImpl?:OfficialSourceFetch;
  timeoutMs?:number;
  now?:()=>Date;
}) {
  const stateCode=input.stateCode.trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(stateCode))throw new Error("AGRITEC_UF_INVALID");
  const url=new URL(`${EMBRAPA_AGRITEC_V2_BASE_URL}/municipios`);
  url.searchParams.set("uf",stateCode);
  const sourceUrl=url.toString();
  const payload=await fetchAgritecJson({
    accessToken:input.accessToken,
    sourceUrl,
    fetchImpl:input.fetchImpl,
    timeoutMs:input.timeoutMs,
  });
  const municipalities=adaptAgritecMunicipalitiesPayload(payload)
    .filter((municipality)=>municipality.stateCode===stateCode);
  return {
    municipalities,
    provider:"EMBRAPA_AGRITEC_V2" as const,
    sourceUrl,
    retrievedAt:(input.now??(()=>new Date()))().toISOString(),
  };
}

export async function fetchAgritecMunicipalityCultures(input:{
  accessToken:string;
  ibgeMunicipalityCode:string;
  fetchImpl?:OfficialSourceFetch;
  timeoutMs?:number;
  now?:()=>Date;
}) {
  const ibge=validateIbge(input.ibgeMunicipalityCode);
  const sourceUrl=`${EMBRAPA_AGRITEC_V2_BASE_URL}/municipios/${ibge}/culturas`;
  const payload=await fetchAgritecJson({
    accessToken:input.accessToken,
    sourceUrl,
    fetchImpl:input.fetchImpl,
    timeoutMs:input.timeoutMs,
  });
  return {
    cultures:adaptAgritecCulturesPayload(payload).filter((culture)=>culture.hasZoning),
    provider:"EMBRAPA_AGRITEC_V2" as const,
    sourceUrl,
    retrievedAt:(input.now??(()=>new Date()))().toISOString(),
  };
}
