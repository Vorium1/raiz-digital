import type {
  AgroclimateMetric,
  AgroclimateMetricSnapshot,
} from "./crop-climate-metric-engine.ts";

export type AgroclimateEvidenceKind =
  | "OBSERVED_STATION"
  | "FORECAST_MODEL"
  | "FIELD_SENSOR"
  | "REMOTE_SENSING"
  | "DERIVED";

export type AgroclimateEvidenceSource =
  | "INMET"
  | "CPTEC_INPE"
  | "MAPA_ZARC"
  | "EMBRAPA"
  | "FIELD_DEVICE"
  | "OTHER_OFFICIAL";

export type AgroclimateMetricEvidence = {
  metric: AgroclimateMetric;
  value: number;
  evidenceKind: AgroclimateEvidenceKind;
  source: AgroclimateEvidenceSource;
  sourceRecordId: string;
  issuedAt: string;
  validFrom: string;
  validUntil: string;
  technicalRegionCodes: string[];
  latitude?: number | null;
  longitude?: number | null;
  spatialResolutionKm?: number | null;
  derivationRuleId?: string | null;
};

export type AgroclimateEvidenceResolution = {
  snapshot: AgroclimateMetricSnapshot;
  provenance: Partial<Record<AgroclimateMetric, AgroclimateMetricEvidence>>;
  blockers: Array<{
    metric: AgroclimateMetric;
    code: "AMBIGUOUS_METRIC_EVIDENCE" | "NO_APPLICABLE_EVIDENCE";
    detail: string;
  }>;
  rejected: Array<{
    metric: AgroclimateMetric;
    sourceRecordId: string;
    reason: string;
  }>;
};

function normalized(value: string) {
  return value.trim().toUpperCase();
}

function parseDate(value: string, label: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`${label} inválida: ${value}`);
  return time;
}

function validateEvidence(item: AgroclimateMetricEvidence) {
  if (!Number.isFinite(item.value)) {
    throw new Error(`Valor de ${item.metric} precisa ser finito.`);
  }
  if (!item.sourceRecordId.trim()) {
    throw new Error(`sourceRecordId é obrigatório para ${item.metric}.`);
  }
  const from = parseDate(item.validFrom, "validFrom");
  const until = parseDate(item.validUntil, "validUntil");
  parseDate(item.issuedAt, "issuedAt");
  if (until < from) throw new Error(`Janela de validade invertida para ${item.metric}.`);

  if (item.evidenceKind === "DERIVED" && !item.derivationRuleId?.trim()) {
    throw new Error(`Evidência derivada de ${item.metric} exige derivationRuleId.`);
  }
  if (item.evidenceKind !== "DERIVED" && item.derivationRuleId?.trim()) {
    throw new Error(`derivationRuleId só é permitido para evidência DERIVED (${item.metric}).`);
  }

  const hasLat = item.latitude != null;
  const hasLon = item.longitude != null;
  if (hasLat !== hasLon) throw new Error(`Latitude e longitude devem ser informadas juntas (${item.metric}).`);
  if (hasLat && (!Number.isFinite(item.latitude) || item.latitude! < -90 || item.latitude! > 90)) {
    throw new Error(`Latitude inválida para ${item.metric}.`);
  }
  if (hasLon && (!Number.isFinite(item.longitude) || item.longitude! < -180 || item.longitude! > 180)) {
    throw new Error(`Longitude inválida para ${item.metric}.`);
  }
  if (
    item.spatialResolutionKm != null
    && (!Number.isFinite(item.spatialResolutionKm) || item.spatialResolutionKm <= 0)
  ) {
    throw new Error(`Resolução espacial inválida para ${item.metric}.`);
  }
}

function regionApplies(item: AgroclimateMetricEvidence, requested: Set<string>) {
  if (!item.technicalRegionCodes.length) return false;
  return item.technicalRegionCodes
    .map(normalized)
    .some((code) => requested.has(code));
}

function validAt(item: AgroclimateMetricEvidence, targetTime: number) {
  const from = parseDate(item.validFrom, "validFrom");
  const until = parseDate(item.validUntil, "validUntil");
  return from <= targetTime && targetTime <= until;
}

/**
 * Resolve evidências meteorológicas em snapshot consumível pelo motor.
 *
 * Não existe precedência escondida entre estação, modelo, sensor ou satélite.
 * Se duas evidências aplicáveis trouxerem valores diferentes para a mesma
 * métrica, a métrica é bloqueada até uma política/provedor homologado resolver
 * explicitamente a divergência.
 */
export function resolveAgroclimateMetricEvidence(input: {
  evidence: AgroclimateMetricEvidence[];
  technicalRegionCodes: string[];
  targetDateTime: string;
  requiredMetrics?: AgroclimateMetric[];
}): AgroclimateEvidenceResolution {
  const targetTime = parseDate(input.targetDateTime, "targetDateTime");
  const requestedRegions = new Set(
    input.technicalRegionCodes.map(normalized).filter(Boolean),
  );
  if (!requestedRegions.size) {
    throw new Error("Ao menos uma região técnica resolvida é obrigatória.");
  }

  for (const item of input.evidence) validateEvidence(item);

  const applicable = input.evidence.filter((item) =>
    regionApplies(item, requestedRegions) && validAt(item, targetTime)
  );

  const byMetric = new Map<AgroclimateMetric, AgroclimateMetricEvidence[]>();
  for (const item of applicable) {
    const group = byMetric.get(item.metric) ?? [];
    group.push(item);
    byMetric.set(item.metric, group);
  }

  const snapshot: AgroclimateMetricSnapshot = {};
  const provenance: AgroclimateEvidenceResolution["provenance"] = {};
  const blockers: AgroclimateEvidenceResolution["blockers"] = [];
  const rejected: AgroclimateEvidenceResolution["rejected"] = [];

  for (const [metric, items] of byMetric) {
    const distinctValues = [...new Set(items.map((item) => item.value))];
    if (distinctValues.length > 1) {
      blockers.push({
        metric,
        code: "AMBIGUOUS_METRIC_EVIDENCE",
        detail: `${items.length} evidências aplicáveis divergem para ${metric}; nenhuma fonte foi priorizada automaticamente.`,
      });
      for (const item of items) {
        rejected.push({
          metric,
          sourceRecordId: item.sourceRecordId,
          reason: "CONFLICTING_APPLICABLE_VALUE",
        });
      }
      continue;
    }

    const selected = items
      .slice()
      .sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt))[0];
    snapshot[metric] = selected.value;
    provenance[metric] = selected;
  }

  for (const metric of input.requiredMetrics ?? []) {
    if (snapshot[metric] != null) continue;
    if (blockers.some((item) => item.metric === metric)) continue;
    blockers.push({
      metric,
      code: "NO_APPLICABLE_EVIDENCE",
      detail: `Não existe evidência válida para ${metric} na região e data solicitadas.`,
    });
  }

  for (const item of input.evidence) {
    if (applicable.includes(item)) continue;
    rejected.push({
      metric: item.metric,
      sourceRecordId: item.sourceRecordId,
      reason: regionApplies(item, requestedRegions)
        ? "OUTSIDE_VALIDITY_WINDOW"
        : "OUTSIDE_TECHNICAL_REGION",
    });
  }

  return { snapshot, provenance, blockers, rejected };
}
