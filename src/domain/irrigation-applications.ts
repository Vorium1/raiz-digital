/** User-declared operations, not a recommendation or a measured water balance. */
export type IrrigationApplication = {
  id: string;
  date: string | null;
  time: string | null;
  utcOffset: string | null;
  system: string | null;
  depthMm: number | null;
  volumeM3: number | null;
  irrigatedAreaHa: number | null;
  efficiencyPercent: number | null;
  efficiencySource: string | null;
  phenologicalStage: string | null;
  waterAvailabilityNotes: string | null;
  waterQualityNotes: string | null;
  evidenceSource: string | null;
};

// Payload/UX limit, never a scientific sampling or agronomic threshold.
export const MAX_IRRIGATION_APPLICATIONS = 100;
const textKeys = ["date", "time", "utcOffset", "system", "efficiencySource", "phenologicalStage",
  "waterAvailabilityNotes", "waterQualityNotes", "evidenceSource"] as const;
const numberKeys = ["depthMm", "volumeM3", "irrigatedAreaHa", "efficiencyPercent"] as const;

export function parseIrrigationApplications(value: unknown): IrrigationApplication[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_IRRIGATION_APPLICATIONS) {
    throw new Error(`Informe uma lista de até ${MAX_IRRIGATION_APPLICATIONS} aplicações de irrigação.`);
  }
  const ids = new Set<string>();
  return value.map((item, index) => {
    const fail = (message: string): never => { throw new Error(`Aplicação ${index + 1}: ${message}`); };
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail("registro inválido.");
    if (typeof item.id !== "string" || !/^[\w-]{1,80}$/.test(item.id) || ids.has(item.id)) return fail("identificador inválido ou repetido.");
    ids.add(item.id);
    const result = { id: item.id } as IrrigationApplication;
    for (const key of textKeys) {
      const raw = item[key];
      if (raw != null && (typeof raw !== "string" || raw.length > 1000)) return fail(`${key}: texto inválido ou longo demais.`);
      result[key] = typeof raw === "string" && raw.trim() ? raw.trim() : null;
    }
    for (const key of numberKeys) {
      const raw = item[key];
      if (raw != null && (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0)) return fail(`${key}: informe um número maior que zero.`);
      result[key] = raw ?? null;
    }
    if (result.efficiencyPercent != null && result.efficiencyPercent > 100) return fail("eficiência deve ser no máximo 100%.");
    if (result.date && (!/^\d{4}-\d{2}-\d{2}$/.test(result.date)
      || !Number.isFinite(Date.parse(`${result.date}T00:00:00Z`))
      || new Date(`${result.date}T00:00:00Z`).toISOString().slice(0, 10) !== result.date)) return fail("data inválida.");
    if (result.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(result.time)) return fail("horário inválido.");
    if (result.utcOffset && !/^[+-](?:0\d|1[0-3]):[0-5]\d$|^[+-]14:00$/.test(result.utcOffset)) return fail("deslocamento UTC inválido (ex.: -03:00).");
    return result;
  });
}

export function irrigationApplicationsFromContext(context: unknown): unknown {
  if (!context || typeof context !== "object" || Array.isArray(context)) return undefined;
  const draft = (context as { draft?: unknown }).draft;
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return undefined;
  return (draft as { irrigationApplications?: unknown }).irrigationApplications;
}

export function evaluateIrrigationApplications(value: unknown) {
  const policy = {
    missingDataBlocksOfficialReport: false,
    automaticNutrientDoseChangeAllowed: false,
    waterBalanceAvailable: false,
    evidenceType: "USER_DECLARED_OPERATION" as const,
  };
  let applications: IrrigationApplication[];
  try { applications = parseIrrigationApplications(value); }
  catch (error) {
    // Invalid optional persisted data limits only this layer, never the soil report.
    return { status: "INVALID_OPTIONAL_EVIDENCE" as const, applications: [], policy,
      limitations: [error instanceof Error ? error.message : "Registro de irrigação inválido."] };
  }
  return {
    status: applications.length ? "AVAILABLE" as const : "NOT_PROVIDED" as const,
    applications: applications.map((application) => {
      // Dimensional identity: 1 ha = 10,000 m²; 1 mm on 1 ha = 10 m³.
      // Use the explicitly irrigated area, never substitute the full field area.
      const derived = application.volumeM3 != null && application.irrigatedAreaHa != null
        ? application.volumeM3 / application.irrigatedAreaHa / 10 : null;
      const depthFromVolumeMm = derived != null && Number.isFinite(derived) ? derived : null;
      const instantUtc = application.date && application.time && application.utcOffset
        ? new Date(`${application.date}T${application.time}:00${application.utcOffset}`).toISOString() : null;
      return { ...application, depthFromVolumeMm, instantUtc,
        depthConversionFormula: depthFromVolumeMm == null ? null : "volumeM3 / (10 * irrigatedAreaHa)",
        limitations: [
          ...(!instantUtc ? ["APPLICATION_INSTANT_INCOMPLETE"] : []),
          ...(application.depthMm != null && depthFromVolumeMm != null ? ["DECLARED_AND_CONVERTED_DEPTHS_PRESERVED_SEPARATELY"] : []),
          ...(application.efficiencyPercent != null && !application.efficiencySource ? ["EFFICIENCY_SOURCE_NOT_PROVIDED"] : []),
          ...(derived != null && !Number.isFinite(derived) ? ["DEPTH_CONVERSION_NOT_FINITE"] : []),
        ],
      };
    }),
    policy,
    limitations: ["NO_WATER_BALANCE_WITHOUT_ALIGNED_RAIN_ET_SOIL_STORAGE_AND_LOSSES"],
  };
}
