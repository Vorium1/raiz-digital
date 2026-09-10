import type { FieldOverview } from "@/lib/repositories/field-overview";

type SeasonOrder = FieldOverview["orders"][number];
type SeasonAnalysis = FieldOverview["analyses"][number];
type SeasonReport = FieldOverview["reports"][number];

/**
 * Síntese estruturada da Visão Geral do Talhão 360° (Fase 2, Bloco C): "o que está disponível", "o que
 * exige atenção" e "próxima ação". Cada item é derivado de contagens e estados REAIS já carregados --
 * nenhuma frase genérica de preenchimento, nenhum diagnóstico, responsável ou prazo inventado. A "próxima
 * ação" segue sempre a mesma cadeia determinística do fluxo operacional real (safra -> coleta -> laudo ->
 * revisão -> publicação), nunca uma sugestão da IA.
 */
export type FieldOverviewSynthesis = {
  available: string[];
  attention: string[];
  nextAction: { label: string; href: string } | null;
};

export function computeFieldOverviewSynthesis(input: {
  hasSeason: boolean;
  seasonOrders: SeasonOrder[];
  seasonAnalyses: SeasonAnalysis[];
  seasonReports: SeasonReport[];
  latestNdviCapturedAt: string | null;
  gpsPct: number | null;
}): FieldOverviewSynthesis {
  const { hasSeason, seasonOrders, seasonAnalyses, seasonReports, latestNdviCapturedAt, gpsPct } = input;
  const available: string[] = [];
  const attention: string[] = [];

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

  if (latestNdviCapturedAt) available.push(`Última leitura de satélite (histórico do talhão): ${new Date(latestNdviCapturedAt).toLocaleDateString("pt-BR")}.`);
  else attention.push("Nenhuma leitura de satélite registrada ainda para este talhão.");

  if (gpsPct != null) {
    if (gpsPct < 100) attention.push(`Apenas ${gpsPct}% dos pontos coletados (histórico do talhão) têm GPS confirmado em campo — os demais usam a posição planejada.`);
  }

  // Próxima ação: cadeia real do fluxo operacional, sempre a primeira etapa real ainda não concluída.
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
    }
  }

  return { available, attention, nextAction };
}
