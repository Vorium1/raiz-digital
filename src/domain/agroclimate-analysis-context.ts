export type SupportedAgroclimateCivilTime = {
  stateCode: "RS" | "SC";
  timeZone: "America/Sao_Paulo";
  utcOffset: string;
};

const INITIAL_STATE_TIME_ZONES = {
  RS: "America/Sao_Paulo",
  SC: "America/Sao_Paulo",
} as const;

function normalizeState(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

function offsetForTimeZone(timeZone: string, at: Date) {
  if (!Number.isFinite(at.getTime())) throw new Error("AGROCLIMATE_REFERENCE_DATE_INVALID");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const localAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  const offsetMinutes = Math.round((localAsUtc - at.getTime()) / 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

/**
 * Resolução deliberadamente estreita no primeiro escopo operacional.
 * RS/SC são seguros via America/Sao_Paulo. Outros estados NÃO herdam o fuso
 * por analogia; entram quando houver resolução geográfica/fuso homologada.
 */
export function resolveInitialAgroclimateCivilTime(
  stateCode: string | null | undefined,
  at = new Date(),
): SupportedAgroclimateCivilTime | null {
  const state = normalizeState(stateCode);
  if (state !== "RS" && state !== "SC") return null;
  const timeZone = INITIAL_STATE_TIME_ZONES[state];
  return {
    stateCode: state,
    timeZone,
    utcOffset: offsetForTimeZone(timeZone, at),
  };
}

/**
 * Extrai safra ZARC somente de uma expressão explícita YYYY/YYYY ou YYYY-YYYY.
 * Não infere safra a partir de ano isolado, mês, cultura ou data atual.
 */
export function parseExplicitZarcSeasonLabel(
  label: string | null | undefined,
): { startYear: number; endYear: number } | null {
  if (!label?.trim()) return null;
  const matches = [...label.matchAll(/(?:^|\D)(20\d{2})\s*[\/-]\s*(20\d{2})(?=\D|$)/g)]
    .map((match) => ({ startYear: Number(match[1]), endYear: Number(match[2]) }))
    .filter((season) => season.endYear === season.startYear + 1);
  if (matches.length !== 1) return null;
  return matches[0];
}
