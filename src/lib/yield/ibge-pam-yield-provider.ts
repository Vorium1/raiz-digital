import type { MunicipalYieldObservation } from "@/domain/yield-outlook";

const IBGE_LOCALIDADES = "https://servicodados.ibge.gov.br/api/v1/localidades";
const SIDRA_VALUES = "https://apisidra.ibge.gov.br/values";
const SOYBEAN_PRODUCT_CODE = "40124";
const AVERAGE_YIELD_VARIABLE = "112";
const PAM_TABLE = "5457";

function normalizeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}

export async function resolveIbgeMunicipalityCode(municipality: string, state: string) {
  const uf = state.trim().toUpperCase();
  const response = await fetch(`${IBGE_LOCALIDADES}/estados/${encodeURIComponent(uf)}/municipios`, {
    headers: { accept: "application/json" },
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  if (!response.ok) throw new Error(`IBGE_LOCALIDADES_HTTP_${response.status}`);
  const rows = await response.json() as Array<{ id?: number; nome?: string }>;
  const target = normalizeName(municipality);
  const match = rows.find((row) => typeof row.nome === "string" && normalizeName(row.nome) === target);
  if (!match?.id) return null;
  return String(match.id);
}

function parseYear(row: Record<string, unknown>) {
  for (const [key, value] of Object.entries(row)) {
    if (!/^D\d+[CN]$/.test(key)) continue;
    const text = String(value ?? "").trim();
    if (/^(19|20)\d{2}$/.test(text)) return Number(text);
  }
  return null;
}

export async function fetchMunicipalSoybeanYield(input: {
  municipality: string;
  state: string;
  years?: number;
}): Promise<{ municipalityCode: string; sourceUrl: string; observations: MunicipalYieldObservation[] }> {
  const municipalityCode = await resolveIbgeMunicipalityCode(input.municipality, input.state);
  if (!municipalityCode) throw new Error("IBGE_MUNICIPALITY_NOT_FOUND");
  const years = Math.min(20, Math.max(3, Math.round(input.years ?? 10)));
  const sourceUrl = `${SIDRA_VALUES}/t/${PAM_TABLE}/n6/${municipalityCode}/v/${AVERAGE_YIELD_VARIABLE}/p/last%20${years}/c782/${SOYBEAN_PRODUCT_CODE}?formato=json`;
  const response = await fetch(sourceUrl, {
    headers: { accept: "application/json" },
    next: { revalidate: 60 * 60 * 24 * 7 },
  });
  if (!response.ok) throw new Error(`IBGE_SIDRA_HTTP_${response.status}`);
  const rows = await response.json() as Array<Record<string, unknown>>;
  const observations = rows.flatMap((row) => {
    const value = Number(String(row.V ?? "").replace(",", "."));
    const year = parseYear(row);
    if (!year || !Number.isFinite(value) || value <= 0) return [];
    return [{ year, yieldKgHa: value }];
  });

  const deduped = Array.from(new Map(observations.map((item) => [item.year, item])).values())
    .sort((a, b) => a.year - b.year);
  return { municipalityCode, sourceUrl, observations: deduped };
}
