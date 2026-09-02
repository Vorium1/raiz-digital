import type { OperationalAssistantProvider, OperationalAssistantRequest, OperationalAssistantResponse, AssistantCard } from "@/lib/ai/operational-assistant-provider";
import { listOperationalAlerts } from "@/lib/repositories/alerts";
import { getExecutiveDashboard } from "@/lib/repositories/dashboard";
import { countLabsImportedThisMonth, listLowestConfidenceAnalyses, listAnalysesAwaitingReview, findPropertyByName, compareLatestTwoSeasons } from "@/lib/repositories/assistant-queries";
import { getPropertyExecutiveReportData } from "@/lib/repositories/reports";

const PROMPT_VERSION = "local-intent-v1";

const SUGGESTED_QUESTIONS = [
  "Quais talhões têm pontos pendentes?",
  "Quantos laudos entraram este mês?",
  "Quais clientes possuem análises aguardando revisão?",
  "Mostre os talhões com menor confiabilidade.",
  "Quais são as principais pendências da minha operação?",
];

function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

async function resolveIntent(request: OperationalAssistantRequest): Promise<{ answer: string; cards: AssistantCard[] }> {
  const q = normalize(request.question);
  const { tenantId, userId } = request;

  if (/atras/.test(q) && /(coleta|propriedade)/.test(q)) {
    const alerts = await listOperationalAlerts(tenantId, userId);
    const overdue = alerts.filter((a) => a.category === "Coleta atrasada");
    if (!overdue.length) return { answer: "Nenhuma coleta está atrasada no momento.", cards: [] };
    return { answer: `${overdue.length} ordem(ns) de coleta atrasada(s):`, cards: overdue.map((a) => ({ title: a.title, description: a.description, href: a.href })) };
  }

  if (/pendente/.test(q) && /ponto/.test(q)) {
    const alerts = await listOperationalAlerts(tenantId, userId);
    const pending = alerts.filter((a) => a.category === "Pontos não coletados");
    if (!pending.length) return { answer: "Todos os pontos planejados já foram coletados.", cards: [] };
    return { answer: `${pending.length} talhão(ões)/ordem(ns) com pontos pendentes:`, cards: pending.map((a) => ({ title: a.title, description: a.description, href: a.href })) };
  }

  if (/laudo/.test(q) && /(mes|mês)/.test(q)) {
    const count = await countLabsImportedThisMonth(tenantId, userId);
    return { answer: `${count} laudo(s) foram importados este mês.`, cards: [{ title: "Ver laboratório", description: "Abrir a tela de importação de laudos", href: "/analises/nova?etapa=laudo" }] };
  }

  if (/revis/.test(q) && /(client|analis)/.test(q)) {
    const rows = await listAnalysesAwaitingReview(tenantId, userId);
    if (!rows.length) return { answer: "Nenhuma análise está aguardando revisão técnica.", cards: [] };
    return { answer: `${rows.length} análise(s) aguardando revisão técnica:`, cards: rows.map((r: any) => ({ title: `${r.code} — ${r.clientName}`, description: r.fieldName, href: `/analises/${r.id}` })) };
  }

  if (/confiabilidade/.test(q) && /(menor|baix)/.test(q)) {
    const rows = await listLowestConfidenceAnalyses(tenantId, 5, userId);
    if (!rows.length) return { answer: "Ainda não há análises com confiabilidade calculada.", cards: [] };
    return { answer: "Talhões com menor confiabilidade técnica:", cards: rows.map((r: any) => ({ title: `${r.fieldName} — ${Math.round(r.confidenceScore)}/100`, description: `${r.clientName} · ${r.code}`, href: `/analises/${r.id}` })) };
  }

  if (/compar/.test(q) && /safra/.test(q)) {
    if (request.screenContext?.type === "field") {
      const comparison = await compareLatestTwoSeasons(tenantId, request.screenContext.id, userId);
      if (!comparison) return { answer: "Este talhão ainda não tem duas safras para comparar.", cards: [] };
      return {
        answer: `Comparando ${comparison.latest.seasonLabel} (${comparison.latest.currentCrop ?? "cultura não informada"}) com ${comparison.previous.seasonLabel} (${comparison.previous.currentCrop ?? "cultura não informada"}).`,
        cards: [{ title: "Ver comparativo completo", description: "Abrir Comparativos com estas safras", href: "/comparativos" }],
      };
    }
    return { answer: "Para comparar safras preciso saber o talhão — abra o talhão desejado e pergunte de novo, ou use a tela de Comparativos.", cards: [{ title: "Abrir Comparativos", description: "Escolher talhão e safras manualmente", href: "/comparativos" }] };
  }

  if (/resum/.test(q) || (/situacao/.test(q) && !/pendenc/.test(q))) {
    let propertyId = request.screenContext?.type === "property" ? request.screenContext.id : null;
    if (!propertyId) {
      const words = q.split(/\s+/).filter((w) => w.length > 3);
      for (const word of words) {
        const match = await findPropertyByName(tenantId, word, userId);
        if (match) { propertyId = match.id; break; }
      }
    }
    if (!propertyId) return { answer: "Não identifiquei a propriedade. Diga o nome dela ou abra a propriedade e pergunte de novo.", cards: [] };
    const data = await getPropertyExecutiveReportData(tenantId, propertyId, userId);
    if (!data) return { answer: "Propriedade não encontrada.", cards: [] };
    const coverage = data.fields.reduce((sum: number, f: any) => sum + f.totalPoints, 0) > 0
      ? Math.round((data.fields.reduce((sum: number, f: any) => sum + f.collectedPoints, 0) / data.fields.reduce((sum: number, f: any) => sum + f.totalPoints, 0)) * 100)
      : null;
    return {
      answer: `${data.property.name}: ${data.fields.length} talhão(ões), ${data.analysesSummary.awaitingReview} análise(s) aguardando revisão, ${data.analysesSummary.inconsistent} inconsistente(s)${coverage != null ? `, ${coverage}% de cobertura de coleta` : ""}.`,
      cards: [{ title: `Ver relatório executivo de ${data.property.name}`, description: "Relatório completo com todos os talhões", href: `/relatorios/propriedade/${propertyId}` }],
    };
  }

  if (/pendenc/.test(q)) {
    const alerts = await listOperationalAlerts(tenantId, userId);
    if (!alerts.length) return { answer: "Nenhuma pendência no momento — operação em dia.", cards: [] };
    const top = alerts.slice(0, 5);
    return { answer: `${alerts.length} pendência(s) no total, ${alerts.filter((a) => a.criticality === "ALTA").length} de criticidade alta:`, cards: top.map((a) => ({ title: a.title, description: `${a.category} · ${a.description}`, href: a.href })) };
  }

  // fallback: painel executivo geral
  const executive = await getExecutiveDashboard(tenantId, {}, userId);
  return {
    answer: `Não reconheci essa pergunta ainda. Posso responder sobre coleta atrasada, pontos pendentes, laudos do mês, revisões pendentes, confiabilidade, comparação de safra e pendências. Hoje sua operação tem ${executive.fields} talhão(ões), ${executive.openOrders} ordem(ns) aberta(s) e ${executive.interpretationsPending} interpretação(ões) pendente(s).`,
    cards: [{ title: "Ver alertas", description: "Central de pendências completa", href: "/alertas" }],
  };
}

export const localIntentAssistantProvider: OperationalAssistantProvider = {
  name: "raiz-local-intent",
  model: "intent-matcher-v1",
  isRealLanguageModel: false,
  async ask(request: OperationalAssistantRequest): Promise<OperationalAssistantResponse> {
    const { answer, cards } = await resolveIntent(request);
    return {
      answer,
      cards,
      suggestedQuestions: SUGGESTED_QUESTIONS,
      provider: "raiz-local-intent",
      model: "intent-matcher-v1",
      isRealLanguageModel: false,
      generatedAt: new Date().toISOString(),
    };
  },
};

export { PROMPT_VERSION as LOCAL_INTENT_PROMPT_VERSION };
