import type { TimelineCategory, TimelineEvent } from "./field-timeline";

export type TimelineFilters = {
  category?: TimelineCategory | "ALL";
  seasonId?: string;
  fromDate?: string;
  toDate?: string;
  timeZone?: string;
};

function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Calendar day shown to the reader, preserving dates that have no recorded time. */
export function timelineCalendarDay(value: string, timeZone = "UTC") {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return validCalendarDate(value) ? value : null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(parsed);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Pure read-only filtering: no inferred season memberships or reconstructed events. */
export function selectTimelineEvents(events: readonly TimelineEvent[], filters: TimelineFilters = {}) {
  const { fromDate, toDate, timeZone = "UTC" } = filters;
  if ((fromDate && !validCalendarDate(fromDate)) || (toDate && !validCalendarDate(toDate))) {
    throw new Error("Informe datas válidas para filtrar o histórico.");
  }
  if (fromDate && toDate && fromDate > toDate) throw new Error("A data inicial deve ser anterior ou igual à data final.");
  // Validate the zone even when the event list is empty.
  new Intl.DateTimeFormat("en", { timeZone });
  const seen = new Set<string>();
  return events.filter((event) => {
    const day = timelineCalendarDay(event.occurredAt, timeZone);
    if (!day || seen.has(event.id)) return false;
    seen.add(event.id);
    if (filters.category && filters.category !== "ALL" && event.category !== filters.category) return false;
    // A null season is a known missing relationship. It remains field history;
    // never assign it to a season by name, chronology, or spatial proximity.
    if (filters.seasonId && event.seasonId != null && event.seasonId !== filters.seasonId) return false;
    return (!fromDate || day >= fromDate) && (!toDate || day <= toDate);
  }).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || a.id.localeCompare(b.id));
}
