import {
  analyzeNdviTemporalHistory,
  classifyNdviObservationQuality,
  NDVI_QUALITY_LABELS,
  type NdviHistoryPoint,
} from "./ndvi-engine.ts";

export type FieldSatelliteStatusTone = "success" | "review" | "waiting";

export type FieldSatelliteStatus = {
  badge: string;
  tone: FieldSatelliteStatusTone;
  heading: string;
  detail: string;
  href: string;
  latestCapturedAt: string | null;
  latestMeanNdvi: number | null;
};

type Snapshot = NdviHistoryPoint & { id?: string };

function formatDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/**
 * Resumo pequeno para a primeira dobra do Talhão 360. A intenção é tornar a informação satélite
 * visível sem obrigar o usuário a abrir Evidências > Satélite. O resumo só usa medidas já persistidas
 * e o motor temporal determinístico; ele nunca tenta explicar a causa de uma alta/queda de NDVI.
 */
export function computeFieldSatelliteStatus(fieldId: string, snapshots: Snapshot[]): FieldSatelliteStatus {
  const href = `/talhoes/${fieldId}?aba=evidencias&evidencia=satelite`;
  const temporal = analyzeNdviTemporalHistory(snapshots);
  if (!temporal.latestCapturedAt || temporal.latestMeanNdvi == null) {
    return {
      badge: "SEM LEITURA",
      tone: "waiting",
      heading: "Satélite ainda não entrou na decisão deste talhão",
      detail: "Nenhuma aquisição Sentinel-2 está registrada. Abra a camada Satélite para buscar o histórico real quando o provedor estiver configurado.",
      href,
      latestCapturedAt: null,
      latestMeanNdvi: null,
    };
  }

  const latest = [...snapshots]
    .filter((snapshot) => snapshot.capturedAt === temporal.latestCapturedAt)
    .at(-1) ?? { capturedAt: temporal.latestCapturedAt, meanNdvi: temporal.latestMeanNdvi, cloudCoverPct: null };
  const quality = classifyNdviObservationQuality(latest);
  const date = formatDateOnly(temporal.latestCapturedAt);
  const ndvi = temporal.latestMeanNdvi.toFixed(2);

  if (quality === "BAIXA") {
    return {
      badge: "QUALIDADE BAIXA",
      tone: "waiting",
      heading: `Sentinel-2 de ${date} precisa de cautela`,
      detail: `${temporal.note} NDVI médio observado: ${ndvi}.`,
      href,
      latestCapturedAt: temporal.latestCapturedAt,
      latestMeanNdvi: temporal.latestMeanNdvi,
    };
  }

  if (temporal.hasRelevantTemporalChange) {
    const movement = temporal.direction === "QUEDA" ? "queda" : "alta";
    return {
      badge: temporal.direction === "QUEDA" ? "QUEDA TEMPORAL" : "ALTA TEMPORAL",
      tone: "review",
      heading: `Satélite detectou ${movement} a investigar`,
      detail: `${temporal.note} Aquisição atual: ${date} · NDVI médio ${ndvi} · ${NDVI_QUALITY_LABELS[quality].toLowerCase()}.`,
      href,
      latestCapturedAt: temporal.latestCapturedAt,
      latestMeanNdvi: temporal.latestMeanNdvi,
    };
  }

  if (temporal.baselineMedian != null) {
    return {
      badge: "HISTÓRICO ESTÁVEL",
      tone: "success",
      heading: "Satélite sem mudança temporal relevante no critério atual",
      detail: `${temporal.note} Aquisição atual: ${date} · NDVI médio ${ndvi} · ${NDVI_QUALITY_LABELS[quality].toLowerCase()}.`,
      href,
      latestCapturedAt: temporal.latestCapturedAt,
      latestMeanNdvi: temporal.latestMeanNdvi,
    };
  }

  return {
    badge: "HISTÓRICO EM FORMAÇÃO",
    tone: "waiting",
    heading: "Satélite ativo, mas ainda sem baseline suficiente",
    detail: `${temporal.note} Aquisição atual: ${date} · NDVI médio ${ndvi} · ${NDVI_QUALITY_LABELS[quality].toLowerCase()}.`,
    href,
    latestCapturedAt: temporal.latestCapturedAt,
    latestMeanNdvi: temporal.latestMeanNdvi,
  };
}
