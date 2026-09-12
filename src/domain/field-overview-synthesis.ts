import type { FieldOverview } from "@/lib/repositories/field-overview";
import {
  analyzeNdviTemporalHistory,
  classifyNdviObservationQuality,
  NDVI_QUALITY_LABELS,
  type NdviTemporalDirection,
} from "./ndvi-engine.ts";

type SeasonOrder = FieldOverview["orders"][number];
type SeasonAnalysis = FieldOverview["analyses"][number];
type SeasonReport = FieldOverview["reports"][number];
type NdviSnapshot = FieldOverview["ndviSnapshots"][number];

export type FieldOverviewSatelliteStatus = {
  label: string;
  tone: "success" | "review" | "waiting";
  direction: NdviTemporalDirection | "SEM_DADO";
  href: string;
};

/**
 * Síntese estruturada da Visão Geral do Talhão 360°. Cada item é derivado de contagens e estados
 * REAIS já carregados. A camada de satélite só acrescenta sinais operacionais comprováveis:
 * qualidade da observação e mudança do NDVI em relação ao histórico do próprio talhão. Ela nunca
 * transforma NDVI em produtividade, nunca atribui causa agronômica e nunca toma o lugar do fluxo
 * laudo -> interpretação -> revisão -> relatório.
 */
export type FieldOverviewSynthesis = {
  available: string[];
  attention: string[];
  nextAction: { label: string; href: string } | null;
  satelliteStatus: FieldOverviewSatelliteStatus;
};

function formatDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return value;
}

function signedNdvi(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function computeFieldOverviewSynthesis(input: {
  fieldId: string;
  hasSeason: boolean;
  seasonOrders: SeasonOrder[];
  seasonAnalyses: SeasonAnalysis[];
  seasonReports: SeasonReport[];
  ndviSnapshots: NdviSnapshot[];
  gpsPct: number | null;
}): FieldOverviewSynthesis {
  const { fieldId, hasSeason, seasonOrders, seasonAnalyses, seasonReports, ndviSnapshots, gpsPct } = input;
  const available: string[] = [];
  const attention: string[] = [];
  const satelliteHref = `/talhoes/${fieldId}?aba=evidencias&evidencia=satelite`;

  const totalPlanned = seasonOrders.reduce((sum, o) => sum + o.plannedPoints, 0);
  const totalCollected = seasonOrders.reduce((sum, o) => sum + o.collectedPoints, 0);

  if (seasonOrders.length > 0) {
    available.push(`${totalCollected} de ${totalPlanned} pontos de coleta desta safra já coletados, em ${seasonOrders.length} ${seasonOrders.length === 1 ? "ordem" : "ordens"}.`);
    if (totalCollected < totalPlanned) attention.push(`${totalPlanned - totalCollected} pontos planejados ainda não foram coletados em campo.`);
  } else if (hasSeason) {
    attention.push("Nenhuma ordem de coleta criada ainda para esta safra.");
  }

  if (seasonAnalyses.length > 0) {
    available.push(`${seasonAnalyses.length} ${seasonAnalyses.length === 1 ? "análise registrada" : "análises registradas"} nesta safra.`);
    const notInterpretableReasons = new Set(seasonAnalyses.map((a) => a.notInterpretableReason).filter((reason): reason is string => Boolean(reason)));
    for (const reason of notInterpretableReasons) attention.push(reason);
    const pendingReview = seasonAnalyses.filter((a) => a.latestInterpretationStatus === "IN_REVIEW").length;
    if (pendingReview > 0) attention.push(`${pendingReview} ${pendingReview === 1 ? "interpretação aguardando" : "interpretações aguardando"} revisão profissional.`);
  } else if (totalCollected > 0) {
    attention.push("Pontos coletados, mas nenhuma análise/laudo laboratorial lançado ainda.");
  }

  if (seasonReports.length > 0) available.push(`${seasonReports.length} ${seasonReports.length === 1 ? "relatório publicado" : "relatórios publicados"} nesta safra.`);

  const temporal = analyzeNdviTemporalHistory(ndviSnapshots.map((snapshot) => ({
    capturedAt: snapshot.capturedAt,
    meanNdvi: snapshot.meanNdvi,
    cloudCoverPct: snapshot.cloudCoverPct,
    pixelCount: snapshot.pixelCount,
  })));
  const latestNdvi = ndviSnapshots[0] ?? null;

  let satelliteStatus: FieldOverviewSatelliteStatus;
  if (!latestNdvi) {
    satelliteStatus = { label: "Sem leitura", tone: "waiting", direction: "SEM_DADO", href: satelliteHref };
    attention.push("Nenhuma leitura de satélite registrada ainda para este talhão.");
  } else {
    const latestQuality = classifyNdviObservationQuality(latestNdvi);
    available.push(
      `${ndviSnapshots.length} ${ndviSnapshots.length === 1 ? "aquisição Sentinel-2 registrada" : "aquisições Sentinel-2 registradas"}; ` +
      `última em ${formatDateOnly(latestNdvi.capturedAt)}, NDVI médio ${latestNdvi.meanNdvi.toFixed(2)} (${NDVI_QUALITY_LABELS[latestQuality].toLowerCase()}).`,
    );

    if (latestQuality === "BAIXA") {
      const masked = latestNdvi.cloudCoverPct == null ? "uma fração relevante" : `${Math.round(latestNdvi.cloudCoverPct)}%`;
      attention.push(`A última aquisição Sentinel-2 tem ${masked} da área sem pixel válido; prefira uma aquisição de melhor qualidade antes de interpretar o padrão espacial.`);
    }

    if (temporal.hasRelevantTemporalChange && temporal.deltaFromBaseline != null) {
      const relation = temporal.deltaFromBaseline < 0 ? "abaixo" : "acima";
      attention.push(
        `Sinal temporal de satélite: a leitura atual está ${Math.abs(temporal.deltaFromBaseline).toFixed(2)} ponto de NDVI ${relation} da mediana das ${temporal.baselineCount} aquisições anteriores. ` +
        "Isso prioriza investigação; não identifica causa, deficiência ou produtividade.",
      );
    }

    if (temporal.hasRelevantTemporalChange) {
      satelliteStatus = {
        label: temporal.direction === "QUEDA" ? `Queda ${signedNdvi(temporal.deltaFromBaseline ?? temporal.deltaFromPrevious ?? 0)}` : `Alta ${signedNdvi(temporal.deltaFromBaseline ?? temporal.deltaFromPrevious ?? 0)}`,
        tone: "review",
        direction: temporal.direction,
        href: satelliteHref,
      };
    } else if (latestQuality === "BAIXA") {
      satelliteStatus = { label: "Qualidade baixa", tone: "waiting", direction: temporal.direction, href: satelliteHref };
    } else if (temporal.baselineMedian != null) {
      satelliteStatus = { label: "Histórico estável", tone: "success", direction: temporal.direction, href: satelliteHref };
    } else {
      satelliteStatus = { label: "Histórico em formação", tone: "waiting", direction: temporal.direction, href: satelliteHref };
    }
  }

  if (gpsPct != null && gpsPct < 100) {
    attention.push(`Apenas ${gpsPct}% dos pontos coletados (histórico do talhão) têm GPS confirmado em campo — os demais usam a posição planejada.`);
  }

  // Próxima ação principal: cadeia real do fluxo operacional. Satélite só vira próxima ação quando o
  // fluxo agronômico principal não tem pendência, para nunca competir com coleta/laudo/revisão.
  let nextAction: FieldOverviewSynthesis["nextAction"] = null;
  if (!hasSeason) {
    nextAction = { label: "Cadastrar uma safra para este talhão", href: "/clientes" };
  } else if (seasonOrders.length === 0) {
    nextAction = { label: "Criar uma ordem de coleta", href: "/coletas" };
  } else if (totalCollected < totalPlanned) {
    nextAction = { label: "Concluir a coleta em campo", href: "/coletas" };
  } else if (seasonAnalyses.length === 0) {
    nextAction = { label: "Lançar o resultado laboratorial (laudo)", href: "/laboratorio" };
  } else {
    const inReview = seasonAnalyses.find((a) => a.latestInterpretationStatus === "IN_REVIEW");
    const notInterpretable = seasonAnalyses.find((a) => a.latestInterpretationStatus === "CALCULATED" && a.notInterpretableReason);
    const calculatedNoReview = seasonAnalyses.find((a) => !a.latestInterpretationStatus);
    if (inReview) nextAction = { label: "Revisar e aprovar a interpretação pendente", href: `/analises/${inReview.id}` };
    else if (calculatedNoReview) nextAction = { label: "Rodar o motor determinístico desta análise", href: `/analises/${calculatedNoReview.id}` };
    else if (notInterpretable) nextAction = { label: "Resolver a pendência que impede a interpretação", href: `/analises/${notInterpretable.id}` };
    else {
      const approvedWithoutReport = seasonAnalyses.find((a) => a.latestInterpretationStatus === "APPROVED" && !seasonReports.some((r) => r.analysisId === a.id));
      if (approvedWithoutReport) nextAction = { label: "Publicar o relatório da interpretação aprovada", href: `/analises/${approvedWithoutReport.id}` };
      else if (!latestNdvi) nextAction = { label: "Buscar histórico Sentinel-2 deste talhão", href: satelliteHref };
      else if (temporal.hasRelevantTemporalChange) nextAction = { label: "Revisar o sinal temporal no Satélite", href: satelliteHref };
    }
  }

  return { available, attention, nextAction, satelliteStatus };
}
