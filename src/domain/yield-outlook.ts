export type YieldHistoryObservation = {
  seasonLabel: string;
  crop: string;
  cultivar?: string | null;
  yieldValue: number;
  yieldUnit: string;
};

export type NdviObservation = {
  capturedAt: string;
  meanNdvi: number;
};

export type MunicipalYieldObservation = {
  year: number;
  yieldKgHa: number;
};

export type YieldOutlookBlocker =
  | "CURRENT_CROP_NOT_CONFIRMED"
  | "FIELD_HISTORY_INSUFFICIENT"
  | "NDVI_SERIES_INSUFFICIENT"
  | "CULTIVAR_NOT_INFORMED"
  | "FORECAST_MODEL_NOT_CALIBRATED";

export function toKgHa(value: number, unit: string) {
  const normalized = unit.trim().toLowerCase();
  if (!Number.isFinite(value) || value <= 0) return null;
  if (normalized === "kg/ha") return value;
  if (normalized === "t/ha" || normalized === "ton/ha") return value * 1000;
  if (normalized === "sc/ha") return value * 60;
  return null;
}

export function kgHaToScHa(value: number) {
  return value / 60;
}

export function percentile(values: number[], fraction: number) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  const clamped = Math.min(1, Math.max(0, fraction));
  const index = (valid.length - 1) * clamped;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return valid[lower];
  const weight = index - lower;
  return valid[lower] * (1 - weight) + valid[upper] * weight;
}

export function buildRegionalYieldScenario(observations: MunicipalYieldObservation[]) {
  const clean = observations
    .filter((item) => Number.isFinite(item.year) && Number.isFinite(item.yieldKgHa) && item.yieldKgHa > 0)
    .sort((a, b) => a.year - b.year);
  const values = clean.map((item) => item.yieldKgHa);
  const latest = clean.at(-1) ?? null;
  const medianKgHa = percentile(values, 0.5);
  const p25KgHa = percentile(values, 0.25);
  const p75KgHa = percentile(values, 0.75);
  return {
    observations: clean,
    sampleYears: clean.length,
    latest,
    medianKgHa,
    p25KgHa,
    p75KgHa,
    goodYearScenarioKgHa: p75KgHa,
  };
}

export function evaluateYieldForecastReadiness(input: {
  cropCurrent: string | null;
  cultivar: string | null;
  yieldHistory: YieldHistoryObservation[];
  ndviSeries: NdviObservation[];
}) {
  const blockers: YieldOutlookBlocker[] = [];
  const crop = (input.cropCurrent ?? "").trim().toUpperCase();
  if (crop !== "SOJA") blockers.push("CURRENT_CROP_NOT_CONFIRMED");

  const soybeanHistory = input.yieldHistory.filter((item) => {
    const itemCrop = item.crop.trim().toUpperCase();
    return itemCrop === "SOJA" && toKgHa(item.yieldValue, item.yieldUnit) != null;
  });
  if (soybeanHistory.length < 3) blockers.push("FIELD_HISTORY_INSUFFICIENT");
  if (input.ndviSeries.filter((item) => Number.isFinite(item.meanNdvi)).length < 3) blockers.push("NDVI_SERIES_INSUFFICIENT");
  if (!(input.cultivar ?? "").trim()) blockers.push("CULTIVAR_NOT_INFORMED");

  // O RAIZ ainda não possui coeficientes locais treinados/validados para converter estas evidências
  // em produtividade futura. Este bloqueio é proposital: evita transformar correlação remota em previsão.
  blockers.push("FORECAST_MODEL_NOT_CALIBRATED");

  return {
    ready: blockers.length === 0,
    blockers,
    soybeanHistoryCount: soybeanHistory.length,
    ndviObservationCount: input.ndviSeries.length,
  };
}

export const YIELD_OUTLOOK_BLOCKER_LABELS: Record<YieldOutlookBlocker, string> = {
  CURRENT_CROP_NOT_CONFIRMED: "A cultura em campo ainda não foi confirmada como soja.",
  FIELD_HISTORY_INSUFFICIENT: "São necessárias pelo menos 3 safras reais de soja deste talhão para calibração local.",
  NDVI_SERIES_INSUFFICIENT: "São necessárias pelo menos 3 leituras NDVI válidas ao longo da safra corrente.",
  CULTIVAR_NOT_INFORMED: "A cultivar da safra corrente ainda não foi informada.",
  FORECAST_MODEL_NOT_CALIBRATED: "O modelo preditivo local ainda não foi calibrado; a RAIZ não converte NDVI em sacas por hectare por aproximação.",
};
