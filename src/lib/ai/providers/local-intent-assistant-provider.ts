import type { OperationalAssistantProvider, OperationalAssistantRequest, OperationalAssistantResponse } from "@/lib/ai/operational-assistant-provider";
import type { AssistantCard, AssistantStructuredResponse } from "@/lib/ai/assistant-response-schema";
import { computeRequiresProfessionalReview } from "@/lib/ai/assistant-response-schema";
import { listOperationalAlerts } from "@/lib/repositories/alerts";
import { getExecutiveDashboard } from "@/lib/repositories/dashboard";
import { countLabsImportedThisMonth, listLowestConfidenceAnalyses, listAnalysesAwaitingReview, findPropertyByName, compareLatestTwoSeasons } from "@/lib/repositories/assistant-queries";
import { buildPropertyEvidence, type FieldEvidence, type PropertyEvidence, type IntelligenceEvidence } from "@/lib/ai/assistant-evidence";
import { QUEUE_BUCKET_META } from "@/domain/interpretation-status";

/**
 * Fase 4A, Bloco 3 — provedor local (intent-matching por regex, sem LLM) migrado pro novo
 * `AssistantStructuredResponse` (fato/atenção/padrão/hipótese/dados faltantes/revisão necessária), no
 * lugar do antigo `{answer: string, cards}`.
 *
 * Preserva as 8 intenções originais (nenhuma removida) e a mesma fonte de dado real por trás de cada uma.
 * Fechamento técnico (2º pedido, item 3) acrescentou uma 9ª intenção real: dentro da tela de Inteligência,
 * a fila filtrada (mesma regra de bucket da própria tela) passou a ser narrada usando o Evidence Package
 * já resolvido (Bloco 2), que antes existia mas nunca era consumido por nenhuma resposta -- prova real de
 * que Bloco 1 (contexto) e Bloco 2 (evidência) alimentam Bloco 3, não são três camadas desconectadas.
 *
 * `hypotheses` fica sempre vazio aqui, de propósito -- este provedor é determinístico, nunca interpreta,
 * só organiza fato real. `requires_professional_review` é sempre calculado por
 * `computeRequiresProfessionalReview` (nunca decidido "na mão" aqui), então também é sempre `false` nesta
 * etapa -- exatamente o esperado com hipóteses vazias.
 */

const PROMPT_VERSION = "local-intent-v2-structured";

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

type PartialResponse = Pick<AssistantStructuredResponse, "summary" | "facts" | "attention_points" | "missing_information" | "cards">;

function empty(summary: string, cards: AssistantCard[] = [], missingInformation: string[] = []): PartialResponse {
  return { summary, facts: [], attention_points: [], missing_information: missingInformation, cards };
}

async function resolveIntent(request: OperationalAssistantRequest): Promise<PartialResponse> {
  const q = normalize(request.question);
  const { tenantId, userId } = request;

  // Dentro da tela de Inteligência, usa o Evidence Package já resolvido (Bloco 2) -- que já aplica a MESMA
  // regra de bucket da própria tela (`interpretationQueueBucket`, ver `assistant-evidence.ts`) -- em vez da
  // fila global sem filtro. Checado antes de qualquer intenção genérica: se o usuário está filtrando a fila
  // (ex.: só "Aguardando revisão"), a resposta precisa refletir exatamente esse recorte, nunca a fila
  // inteira sem filtro.
  if (request.screenContext?.type === "intelligence" && request.evidence?.found && request.evidence.kind === "intelligence" && /(fila|pendenc|quant|situac)/.test(q)) {
    const evidence = request.evidence.evidence as IntelligenceEvidence;
    if (!evidence.totalCount) return { ...empty("Nenhuma análise corresponde aos filtros atuais da fila de Inteligência."), facts: [{ label: "Itens na fila (com os filtros atuais)", value: "0", source: "database" }] };
    return {
      summary: `${evidence.totalCount} item(ns) na fila de Inteligência com os filtros atuais.`,
      facts: [{ label: "Itens na fila (com os filtros atuais)", value: String(evidence.totalCount), source: "database" }],
      attention_points: evidence.items.slice(0, 5).map((i) => ({ label: `${i.clientName} · ${i.fieldName}`, reason: `${QUEUE_BUCKET_META[i.bucket].label} — ${i.analysisCode}` })),
      missing_information: [],
      cards: evidence.items.slice(0, 5).map((i) => ({ title: `${i.analysisCode} — ${i.clientName}`, description: i.fieldName, href: `/analises/${i.analysisId}` })),
    };
  }

  if (/atras/.test(q) && /(coleta|propriedade)/.test(q)) {
    const alerts = await listOperationalAlerts(tenantId, userId);
    const overdue = alerts.filter((a) => a.category === "Coleta atrasada");
    if (!overdue.length) return { ...empty("Nenhuma coleta está atrasada no momento."), facts: [{ label: "Coletas atrasadas", value: "0", source: "database" }] };
    return {
      summary: `${overdue.length} ordem(ns) de coleta atrasada(s).`,
      facts: [{ label: "Coletas atrasadas", value: String(overdue.length), source: "database" }],
      attention_points: overdue.map((a) => ({ label: a.title, reason: a.description })),
      missing_information: [],
      cards: overdue.map((a) => ({ title: a.title, description: a.description, href: a.href })),
    };
  }

  if (/pendente/.test(q) && /ponto/.test(q)) {
    const alerts = await listOperationalAlerts(tenantId, userId);
    const pending = alerts.filter((a) => a.category === "Pontos não coletados");
    if (!pending.length) return { ...empty("Todos os pontos planejados já foram coletados."), facts: [{ label: "Talhões/ordens com pontos pendentes", value: "0", source: "database" }] };
    return {
      summary: `${pending.length} talhão(ões)/ordem(ns) com pontos pendentes.`,
      facts: [{ label: "Talhões/ordens com pontos pendentes", value: String(pending.length), source: "database" }],
      attention_points: pending.map((a) => ({ label: a.title, reason: a.description })),
      missing_information: [],
      cards: pending.map((a) => ({ title: a.title, description: a.description, href: a.href })),
    };
  }

  if (/laudo/.test(q) && /(mes|mês)/.test(q)) {
    const count = await countLabsImportedThisMonth(tenantId, userId);
    return {
      summary: `${count} laudo(s) foram importados este mês.`,
      facts: [{ label: "Laudos importados este mês", value: String(count), source: "database" }],
      attention_points: [],
      missing_information: [],
      cards: [{ title: "Ver laboratório", description: "Abrir a tela de importação de laudos", href: "/analises/nova?etapa=laudo" }],
    };
  }

  if (/revis/.test(q) && /(client|analis)/.test(q)) {
    const rows = await listAnalysesAwaitingReview(tenantId, userId);
    if (!rows.length) return { ...empty("Nenhuma análise está aguardando revisão técnica."), facts: [{ label: "Análises aguardando revisão", value: "0", source: "database" }] };
    return {
      summary: `${rows.length} análise(s) aguardando revisão técnica.`,
      facts: [{ label: "Análises aguardando revisão", value: String(rows.length), source: "database" }],
      attention_points: rows.map((r: any) => ({ label: `${r.code} — ${r.clientName}`, reason: `${r.fieldName}: aguardando revisão profissional.` })),
      missing_information: [],
      cards: rows.map((r: any) => ({ title: `${r.code} — ${r.clientName}`, description: r.fieldName, href: `/analises/${r.id}` })),
    };
  }

  if (/confiabilidade/.test(q) && /(menor|baix)/.test(q)) {
    const rows = await listLowestConfidenceAnalyses(tenantId, 5, userId);
    if (!rows.length) return empty("Ainda não há análises com confiabilidade calculada.");
    return {
      summary: "Talhões com menor confiabilidade técnica.",
      facts: rows.map((r: any) => ({ label: `${r.fieldName} (${r.clientName})`, value: `${Math.round(r.confidenceScore)}/100`, source: "database" as const })),
      attention_points: [],
      missing_information: [],
      cards: rows.map((r: any) => ({ title: `${r.fieldName} — ${Math.round(r.confidenceScore)}/100`, description: `${r.clientName} · ${r.code}`, href: `/analises/${r.id}` })),
    };
  }

  if (/compar/.test(q) && /safra/.test(q)) {
    if (request.screenContext?.type === "field") {
      // Se o Evidence Package do talhão já foi resolvido (Bloco 2), usa as safras já carregadas ali em vez
      // de consultar de novo -- mesma fonte (`crop_seasons` ordenadas por `createdAt DESC`), sem duplicar.
      const fieldEvidence = request.evidence?.found && request.evidence.kind === "field" ? (request.evidence.evidence as FieldEvidence) : null;
      if (fieldEvidence && fieldEvidence.seasons.length >= 2) {
        const [latest, previous] = fieldEvidence.seasons;
        return {
          summary: `Comparando ${latest.seasonLabel} (${latest.currentCrop ?? "cultura não informada"}) com ${previous.seasonLabel} (${previous.currentCrop ?? "cultura não informada"}).`,
          facts: [
            { label: `Safra atual (${latest.seasonLabel})`, value: latest.currentCrop ?? "cultura não informada", source: "database" },
            { label: `Safra anterior (${previous.seasonLabel})`, value: previous.currentCrop ?? "cultura não informada", source: "database" },
          ],
          attention_points: [],
          missing_information: [],
          cards: [{ title: "Ver comparativo completo", description: "Abrir Comparativos com estas safras", href: "/comparativos" }],
        };
      }
      const comparison = await compareLatestTwoSeasons(tenantId, request.screenContext.id, userId);
      if (!comparison) return empty("Este talhão ainda não tem duas safras para comparar.");
      return {
        summary: `Comparando ${comparison.latest.seasonLabel} (${comparison.latest.currentCrop ?? "cultura não informada"}) com ${comparison.previous.seasonLabel} (${comparison.previous.currentCrop ?? "cultura não informada"}).`,
        facts: [
          { label: `Safra atual (${comparison.latest.seasonLabel})`, value: comparison.latest.currentCrop ?? "cultura não informada", source: "database" },
          { label: `Safra anterior (${comparison.previous.seasonLabel})`, value: comparison.previous.currentCrop ?? "cultura não informada", source: "database" },
        ],
        attention_points: [],
        missing_information: [],
        cards: [{ title: "Ver comparativo completo", description: "Abrir Comparativos com estas safras", href: "/comparativos" }],
      };
    }
    return empty("Para comparar safras preciso saber o talhão — abra o talhão desejado e pergunte de novo, ou use a tela de Comparativos.", [{ title: "Abrir Comparativos", description: "Escolher talhão e safras manualmente", href: "/comparativos" }], ["Nenhum talhão identificado no contexto atual."]);
  }

  if (/resum/.test(q) || (/situacao/.test(q) && !/pendenc/.test(q))) {
    // Contexto já traz a propriedade -- usa o Evidence Package já resolvido (Bloco 2), sem nova consulta.
    if ((request.screenContext?.type === "property" || request.screenContext?.type === "report-property") && request.evidence?.found && (request.evidence.kind === "property" || request.evidence.kind === "report-property")) {
      const evidence = request.evidence.evidence as PropertyEvidence;
      return summarizePropertyEvidence(evidence);
    }
    // Fora de uma tela de propriedade: única exceção deste provedor a "só usar evidência já pronta" --
    // resolver uma propriedade a partir do NOME digitado na pergunta livre é uma operação que depende do
    // texto da pergunta, que nenhum Evidence Package pré-construído poderia antecipar. Reaproveita o MESMO
    // builder (`buildPropertyEvidence`) usado em qualquer outro contexto -- nunca uma consulta paralela.
    const words = q.split(/\s+/).filter((w) => w.length > 3);
    for (const word of words) {
      const match = await findPropertyByName(tenantId, word, userId);
      if (match) {
        const evidence = await buildPropertyEvidence(tenantId, userId, match.id, "property");
        if (evidence) return summarizePropertyEvidence(evidence);
      }
    }
    return empty("Não identifiquei a propriedade. Diga o nome dela ou abra a propriedade e pergunte de novo.");
  }

  if (/pendenc/.test(q)) {
    const alerts = await listOperationalAlerts(tenantId, userId);
    if (!alerts.length) return { ...empty("Nenhuma pendência no momento — operação em dia."), facts: [{ label: "Pendências", value: "0", source: "database" }] };
    const top = alerts.slice(0, 5);
    const highCount = alerts.filter((a) => a.criticality === "ALTA").length;
    return {
      summary: `${alerts.length} pendência(s) no total, ${highCount} de criticidade alta.`,
      facts: [
        { label: "Pendências no total", value: String(alerts.length), source: "database" },
        { label: "Pendências de criticidade alta", value: String(highCount), source: "database" },
      ],
      attention_points: top.map((a) => ({ label: a.title, reason: `${a.category} · ${a.description}` })),
      missing_information: [],
      cards: top.map((a) => ({ title: a.title, description: `${a.category} · ${a.description}`, href: a.href })),
    };
  }

  // fallback: painel executivo geral
  const executive = await getExecutiveDashboard(tenantId, {}, userId);
  return {
    summary: `Não reconheci essa pergunta ainda. Posso responder sobre coleta atrasada, pontos pendentes, laudos do mês, revisões pendentes, confiabilidade, comparação de safra e pendências.`,
    facts: [
      { label: "Talhões na operação", value: String(executive.fields), source: "database" },
      { label: "Ordens abertas", value: String(executive.openOrders), source: "database" },
      { label: "Interpretações pendentes", value: String(executive.interpretationsPending), source: "database" },
    ],
    attention_points: [],
    missing_information: ["A pergunta não bate com nenhuma das intenções reconhecidas hoje."],
    cards: [{ title: "Ver alertas", description: "Central de pendências completa", href: "/alertas" }],
  };
}

function summarizePropertyEvidence(evidence: PropertyEvidence): PartialResponse {
  return {
    summary: `${evidence.property.name}: ${evidence.fields.length} talhão(ões), ${evidence.summary.interpretationsPending} interpretação(ões) aguardando revisão, ${evidence.summary.criticalFields} talhão(ões) crítico(s), ${evidence.summary.coveragePct}% de cobertura de coleta.`,
    facts: [
      { label: "Talhões", value: String(evidence.fields.length), source: "database" },
      { label: "Interpretações aguardando revisão", value: String(evidence.summary.interpretationsPending), source: "database" },
      { label: "Talhões críticos", value: String(evidence.summary.criticalFields), source: "database" },
      { label: "Cobertura de coleta", value: `${evidence.summary.coveragePct}%`, source: "database" },
    ],
    attention_points: evidence.attentionFields.map((f) => ({ label: f.name, reason: f.notInterpretableReason ?? f.evaluationStatus })),
    missing_information: [],
    cards: [{ title: `Ver relatório executivo de ${evidence.property.name}`, description: "Relatório completo com todos os talhões", href: `/relatorios/propriedade/${evidence.property.id}` }],
  };
}

/**
 * Fechamento técnico (2º pedido, item 2) -- contexto explicitamente informado pelo client mas inválido/
 * malformado (`evidence.kind === "invalid"`, montado em `/api/assistant` a partir de
 * `parseAssistantScreenContext`) NUNCA responde como se fosse a operação inteira (dashboard). Checado
 * ANTES de qualquer casamento de intenção -- mesmo uma pergunta que bateria no repertório global (ex.:
 * "pendências") não deve silenciosamente ignorar que a tela de origem estava com um contexto quebrado.
 */
function isInvalidContext(request: OperationalAssistantRequest): boolean {
  return request.evidence?.found === false && request.evidence.kind === "invalid";
}

const INVALID_CONTEXT_RESPONSE: PartialResponse = {
  summary: "Não consegui identificar o contexto atual. Reabra a tela ou selecione novamente o item.",
  facts: [],
  attention_points: [],
  missing_information: ["O contexto de tela enviado não pôde ser identificado ou já não é válido."],
  cards: [],
};

export const localIntentAssistantProvider: OperationalAssistantProvider = {
  name: "raiz-local-intent",
  model: "intent-matcher-v2",
  isRealLanguageModel: false,
  async ask(request: OperationalAssistantRequest): Promise<OperationalAssistantResponse> {
    const partial = isInvalidContext(request) ? INVALID_CONTEXT_RESPONSE : await resolveIntent(request);
    const structured: AssistantStructuredResponse = {
      summary: partial.summary,
      facts: partial.facts,
      attention_points: partial.attention_points,
      patterns: [],
      hypotheses: [],
      missing_information: partial.missing_information,
      technical_references: [],
      suggested_actions: [],
      requires_professional_review: false,
      cards: partial.cards,
    };
    structured.requires_professional_review = computeRequiresProfessionalReview(structured);
    return {
      ...structured,
      suggestedQuestions: SUGGESTED_QUESTIONS,
      provider: "raiz-local-intent",
      model: "intent-matcher-v2",
      isRealLanguageModel: false,
      generatedAt: new Date().toISOString(),
    };
  },
};

export { PROMPT_VERSION as LOCAL_INTENT_PROMPT_VERSION };
