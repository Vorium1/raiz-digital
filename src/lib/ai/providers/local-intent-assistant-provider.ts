import type { OperationalAssistantProvider, OperationalAssistantRequest, OperationalAssistantResponse, AssistantHandlingResult } from "@/lib/ai/operational-assistant-provider";
import type { AssistantCard, AssistantStructuredResponse } from "@/lib/ai/assistant-response-schema";
import { computeRequiresProfessionalReview } from "@/lib/ai/assistant-response-schema";
import type { AssistantAction } from "@/lib/ai/assistant-actions-schema";
import { listOperationalAlerts } from "@/lib/repositories/alerts";
import { getExecutiveDashboard } from "@/lib/repositories/dashboard";
import { countLabsImportedThisMonth, listLowestConfidenceAnalyses, listAnalysesAwaitingReview, findPropertyByName, compareLatestTwoSeasons } from "@/lib/repositories/assistant-queries";
import { buildPropertyEvidence, type FieldEvidence, type PropertyEvidence, type IntelligenceEvidence, type MapEvidence, type ComparisonEvidence } from "@/lib/ai/assistant-evidence";
import type { AgronomicEvidencePackage } from "@/lib/ai/evidence-package";
import { QUEUE_BUCKET_META } from "@/domain/interpretation-status";

/**
 * Fase 4A, Bloco 3 — provedor local (intent-matching por regex, sem LLM) migrado pro novo
 * `AssistantStructuredResponse` (fato/atenção/padrão/hipótese/dados faltantes/revisão necessária), no
 * lugar do antigo `{answer: string, cards}`.
 *
 * Preserva as 8 intenções originais (nenhuma removida) e a mesma fonte de dado real por trás de cada uma.
 * Fechamento técnico (2º pedido, item 3) acrescentou uma 9ª intenção: dentro da tela de Inteligência, a
 * fila filtrada (mesma regra de bucket da própria tela) passou a ser narrada usando o Evidence Package já
 * resolvido (Bloco 2), que antes existia mas nunca era consumido por nenhuma resposta. Bloco 5 acrescentou
 * mais 3 (regra técnica/confiabilidade/pontos de atenção de uma análise, o que está selecionado no mapa +
 * "mostre só pendentes" como ação real, e o resumo de um comparativo já calculado) -- todas reaproveitando
 * Evidence Packages que o Bloco 2 já montava mas que nenhuma resposta em texto consumia ainda. 12
 * intenções no total, cada uma prova real de que Bloco 1 (contexto) e Bloco 2 (evidência) alimentam
 * Bloco 3, não são camadas desconectadas.
 *
 * `hypotheses` fica sempre vazio aqui, de propósito -- este provedor é determinístico, nunca interpreta,
 * só organiza fato real. `requires_professional_review` é sempre calculado por
 * `computeRequiresProfessionalReview` (nunca decidido "na mão" aqui), então também é sempre `false` nesta
 * etapa -- exatamente o esperado com hipóteses vazias.
 */

// Fase 4F, item 1 -- v3: `missing_information` passou a ser preenchido nas respostas de recusa honesta
// (comparar safra sem segunda safra, propriedade não identificada por nome) e `technical_references` passou
// a ser narrado a partir de `AgronomicEvidencePackage.technicalSources` (antes sempre `[]`).
const PROMPT_VERSION = "local-intent-v3-grounded";

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

/**
 * Bloco 4 -- `actions` é opcional e sempre CRU (`AssistantAction[]`, nunca `ResolvedAssistantAction`): o
 * provedor só sugere a INTENÇÃO tipada aqui; `/api/assistant` (`route.ts`) é quem valida posse/tenant e
 * transforma isso num `href` real antes de qualquer coisa chegar ao client. Cada branch de intenção abaixo
 * só anexa uma ação quando ela corresponde a uma funcionalidade que JÁ EXISTE de verdade na RAIZ (mapa,
 * comparativos, relatório, talhão, fila de inteligência) -- nunca uma ação especulativa.
 */
type PartialResponse = Pick<AssistantStructuredResponse, "summary" | "facts" | "attention_points" | "missing_information" | "cards"> & { actions?: AssistantAction[]; technical_references?: AssistantStructuredResponse["technical_references"]; handling?: AssistantHandlingResult };

function empty(summary: string, cards: AssistantCard[] = [], missingInformation: string[] = []): PartialResponse {
  return { summary, facts: [], attention_points: [], missing_information: missingInformation, cards };
}

/**
 * Fase 4G, item 2 — classificação PADRÃO de `handling` quando a branch de intenção não declara um valor
 * explícito (só a branch de fallback final -- "não reconheci essa pergunta" -- e o contexto inválido
 * precisam declarar explicitamente, porque são os únicos 2 casos em que a inferência abaixo erraria).
 * Nunca olha o TEXTO de `summary` -- só a FORMA estrutural da resposta: teve algum fato/ponto de
 * atenção/fonte técnica real (mesmo uma contagem "0" é um fato completo) -> `"handled"`; senão, se
 * declarou o que falta -> `"insufficient_evidence"`.
 */
function inferHandling(partial: PartialResponse): AssistantHandlingResult {
  const hasRealContent = partial.facts.length > 0 || partial.attention_points.length > 0 || (partial.technical_references?.length ?? 0) > 0;
  if (hasRealContent) return "handled";
  return partial.missing_information.length > 0 ? "insufficient_evidence" : "handled";
}

async function resolveIntent(request: OperationalAssistantRequest): Promise<PartialResponse> {
  const q = normalize(request.question);
  const { tenantId, userId } = request;

  // Dentro da tela de Inteligência, usa o Evidence Package já resolvido (Bloco 2) -- que já aplica a MESMA
  // regra de bucket da própria tela (`interpretationQueueBucket`, ver `assistant-evidence.ts`) -- em vez da
  // fila global sem filtro. Checado antes de qualquer intenção genérica: se o usuário está filtrando a fila
  // (ex.: só "Aguardando revisão"), a resposta precisa refletir exatamente esse recorte, nunca a fila
  // inteira sem filtro.
  if (request.screenContext?.type === "intelligence" && request.evidence?.found && request.evidence.kind === "intelligence" && /(fila|pendenc|quant|situac|revis)/.test(q)) {
    const evidence = request.evidence.evidence as IntelligenceEvidence;
    // Pré-ajuste 2: pelo menos um id do filtro (client/propriedade/talhão/safra) veio preenchido mas fora
    // do formato de uuid -- nunca responde com a fila inteira sem filtro (seria mostrar mais do que o
    // usuário pediu), admite honestamente que o filtro não pôde ser aplicado.
    if (!evidence.ready) return empty("O filtro atual da fila de Inteligência não pôde ser aplicado (um dos ids informados não é válido).", [], ["Um ou mais filtros de cliente/propriedade/talhão/safra vieram com formato inválido -- corrija o filtro na tela de Inteligência e pergunte de novo."]);
    if (!evidence.totalCount) return { ...empty("Nenhuma análise corresponde aos filtros atuais da fila de Inteligência."), facts: [{ label: "Itens na fila (com os filtros atuais)", value: "0", source: "database" }] };
    const s = request.screenState?.screen === "intelligence" ? request.screenState : undefined;
    const hasFilter = Boolean(s?.clientId || s?.propertyId || s?.fieldId || s?.seasonId || s?.interpretationState || s?.reviewState);
    return {
      summary: `${evidence.totalCount} item(ns) na fila de Inteligência com os filtros atuais.`,
      facts: [{ label: "Itens na fila (com os filtros atuais)", value: String(evidence.totalCount), source: "database" }],
      attention_points: evidence.items.slice(0, 5).map((i) => ({ label: `${i.clientName} · ${i.fieldName}`, reason: `${QUEUE_BUCKET_META[i.bucket].label} — ${i.analysisCode}` })),
      missing_information: [],
      cards: evidence.items.slice(0, 5).map((i) => ({ title: `${i.analysisCode} — ${i.clientName}`, description: i.fieldName, href: `/analises/${i.analysisId}` })),
      // Só sugere a ação "ver com este filtro" quando um filtro real está aplicado -- sem isso, seria um
      // link pra exatamente a mesma tela sem filtro nenhum, uma ação sem propósito real.
      actions: hasFilter ? [{ kind: "filter_intelligence", clientId: s?.clientId, propertyId: s?.propertyId, fieldId: s?.fieldId, seasonId: s?.seasonId, interpretationState: s?.interpretationState as "BLOQUEADA" | "INTERPRETAVEL" | undefined, reviewState: s?.reviewState as "AGUARDANDO_REVISAO" | "REVISAO_EM_ANDAMENTO" | "APROVADA" | undefined }] : undefined,
    };
  }

  // Bloco 5 -- dentro de uma análise, narra regra técnica usada e confiabilidade (ambas já presentes em
  // `AgronomicEvidencePackage.ruleUsed`/`.confidence`, Fase 3, nunca consumidas por nenhuma resposta em
  // texto antes) e pontos de atenção reais (parâmetros não interpretáveis, com o motivo real do motor).
  if (request.screenContext?.type === "analysis" && request.evidence?.found && request.evidence.kind === "analysis" && /(regra|confiabilidade|ponto.*atenc|atenc.*ponto|fonte|public)/.test(q)) {
    const evidence = request.evidence.evidence as AgronomicEvidencePackage;
    const facts: PartialResponse["facts"] = [];
    if (evidence.confidence) facts.push({ label: "Confiabilidade da interpretação", value: `${evidence.confidence.score}/100 (${evidence.confidence.level})`, source: "database" });
    const ruleName = evidence.ruleUsed?.cropProfileCode ?? evidence.ruleUsed?.cropProfileName;
    if (ruleName) facts.push({ label: "Regra técnica usada", value: `${ruleName}${evidence.ruleUsed?.version ? ` v${evidence.ruleUsed.version}` : ""}`, source: "database" });
    const attentionPoints = evidence.classifications.filter((c) => !c.interpretable).map((c) => ({ label: `${c.sampleCode} · ${c.parameterCode}`, reason: c.reason ?? "Não interpretável" }));
    // Fase 4F, item 1 -- Evidence Package de análise já carrega `technicalSources` reais (`AgronomicEvidencePackage`,
    // Fase 3) desde antes da Fase 4, mas nenhuma resposta em texto nunca os narrava -- `technical_references`
    // ficava sempre `[]` mesmo quando havia fonte real disponível. Nunca inventa: só as fontes que já estão
    // no Evidence Package, exatamente como vieram (título/instituição reais).
    const technicalReferences: PartialResponse["technical_references"] = evidence.technicalSources.map((s) => ({ title: s.title, institution: s.institution }));
    if (!facts.length && !attentionPoints.length && !technicalReferences.length) {
      return empty("Ainda não há regra técnica, confiabilidade, pontos de atenção ou fontes técnicas registradas para esta análise.", [], ["Esta análise ainda não tem regra técnica, confiabilidade, pontos de atenção ou fontes técnicas calculadas/registradas."]);
    }
    return {
      summary: evidence.confidence ? `Confiabilidade desta interpretação: ${evidence.confidence.score}/100 (${evidence.confidence.level}).` : "Esta análise ainda não tem confiabilidade calculada.",
      facts,
      attention_points: attentionPoints,
      technical_references: technicalReferences,
      missing_information: [],
      cards: [],
    };
  }

  // Bloco 5 -- dentro do mapa, narra o talhão selecionado (quando há um) ou admite honestamente que nada
  // está selecionado. "Mostre apenas os pontos pendentes" vira uma ação real (`show_on_map`, status
  // "pending"), nunca só texto -- é exatamente pra isso que o Bloco 4 existe.
  if (request.screenContext?.type === "map" && request.evidence?.found && request.evidence.kind === "map") {
    const mapEvidence = request.evidence.evidence as MapEvidence;
    const s = request.screenState?.screen === "map" ? request.screenState : undefined;
    if (/(pendente|pending)/.test(q) && mapEvidence.delegatedTo === "field" && s?.collectionOrderId) {
      const pending = mapEvidence.field.collectionSummary.plannedPoints - mapEvidence.field.collectionSummary.collectedPoints;
      return {
        summary: `Filtrando o mapa pra mostrar só os pontos pendentes (${pending} de ${mapEvidence.field.collectionSummary.plannedPoints}).`,
        facts: [{ label: "Pontos pendentes", value: String(pending), source: "database" }],
        attention_points: [],
        missing_information: [],
        cards: [],
        actions: [{ kind: "show_on_map", collectionOrderId: s.collectionOrderId, status: "pending" }],
      };
    }
    if (/(vendo|mostra|mapa)/.test(q)) {
      if (mapEvidence.delegatedTo === "field") {
        const f = mapEvidence.field;
        return {
          summary: `Você está vendo o talhão ${f.field.name} (${f.field.propertyName}).`,
          facts: [
            { label: "Área", value: `${f.field.areaHa} ha`, source: "database" },
            { label: "Pontos coletados", value: `${f.collectionSummary.collectedPoints} de ${f.collectionSummary.plannedPoints}`, source: "database" },
          ],
          attention_points: [],
          missing_information: [],
          cards: [],
        };
      }
      return empty("Nenhum talhão selecionado no mapa no momento -- o mapa está mostrando a visão geral da operação.", [], ["Nenhuma ordem de coleta selecionada no mapa."]);
    }
  }

  // Bloco 5 -- dentro de um comparativo, narra o que já foi calculado (`ComparisonEvidence`, Bloco 2, nunca
  // narrado antes). Checado ANTES do `/resum/` genérico (que faria busca de propriedade por nome e erraria
  // aqui).
  if (request.screenContext?.type === "comparison" && request.evidence?.found && request.evidence.kind === "comparison" && /(resum|diferenc|compar)/.test(q)) {
    const evidence = request.evidence.evidence as ComparisonEvidence;
    if (!evidence.ready) return empty("Ainda não há dois itens selecionados para comparar -- escolha A e B na tela de Comparativos.", [], ["Comparativo sem os dois lados (A/B) selecionados ainda."]);
    return {
      summary: `Comparando ${evidence.labelA} com ${evidence.labelB}: ${evidence.rowCount} parâmetro(s) com diferença calculada.`,
      facts: [
        { label: "Lado A", value: evidence.labelA, source: "database" },
        { label: "Lado B", value: evidence.labelB, source: "database" },
        { label: "Parâmetros comparados", value: String(evidence.rowCount), source: "database" },
      ],
      attention_points: [],
      missing_information: [],
      cards: [],
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
          actions: [{ kind: "open_comparison", mode: "seasons", a: latest.id, b: previous.id }],
        };
      }
      const comparison = await compareLatestTwoSeasons(tenantId, request.screenContext.id, userId);
      // Fase 4F, item 1 -- isto é uma resposta de DADO INSUFICIENTE (a pergunta não pôde ser respondida por
      // falta de uma segunda safra), não uma resposta factual completa -- precisa aparecer em
      // `missing_information` (seção visual própria do painel, Bloco 5), não só implícita no `summary`.
      if (!comparison) return empty("Este talhão ainda não tem duas safras para comparar.", [], ["Não há uma segunda safra registrada para este talhão -- cadastre mais uma safra pra poder comparar."]);
      return {
        summary: `Comparando ${comparison.latest.seasonLabel} (${comparison.latest.currentCrop ?? "cultura não informada"}) com ${comparison.previous.seasonLabel} (${comparison.previous.currentCrop ?? "cultura não informada"}).`,
        facts: [
          { label: `Safra atual (${comparison.latest.seasonLabel})`, value: comparison.latest.currentCrop ?? "cultura não informada", source: "database" },
          { label: `Safra anterior (${comparison.previous.seasonLabel})`, value: comparison.previous.currentCrop ?? "cultura não informada", source: "database" },
        ],
        attention_points: [],
        missing_information: [],
        cards: [{ title: "Ver comparativo completo", description: "Abrir Comparativos com estas safras", href: "/comparativos" }],
        actions: [{ kind: "open_comparison", mode: "seasons", a: comparison.latest.id, b: comparison.previous.id }],
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
    // Fase 4F, item 1 -- mesmo princípio: dado insuficiente pra responder, precisa aparecer em
    // `missing_information`, não só no `summary`.
    return empty("Não identifiquei a propriedade. Diga o nome dela ou abra a propriedade e pergunte de novo.", [], ["Nenhuma propriedade foi identificada a partir do nome citado na pergunta -- diga o nome exato ou abra a propriedade e pergunte de novo."]);
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

  // fallback: painel executivo geral -- ÚNICO branch que declara `handling: "unsupported"` explicitamente.
  // Tem `facts` (contexto geral, pra nunca devolver uma tela vazia), então a inferência padrão erraria
  // pra "handled" -- esta é EXATAMENTE a pergunta que o diretor pediu pra nunca detectar por texto
  // (`summary.includes("não entendi")`); o sinal estruturado é este campo, não o texto do resumo.
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
    handling: "unsupported",
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
    actions: [{ kind: "open_report", reportType: "property", id: evidence.property.id }],
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
  handling: "insufficient_evidence",
};

export const localIntentAssistantProvider: OperationalAssistantProvider = {
  name: "raiz-local-intent",
  model: "intent-matcher-v2",
  isRealLanguageModel: false,
  async ask(request: OperationalAssistantRequest): Promise<OperationalAssistantResponse> {
    const partial = isInvalidContext(request) ? INVALID_CONTEXT_RESPONSE : await resolveIntent(request);
    const actions = [...(partial.actions ?? [])];
    // Afordance genérica de contexto: sempre que a tela é uma análise e a evidência real resolveu, oferece
    // "ver talhão" -- independe de qual intenção respondeu a pergunta (não é algo específico de uma
    // pergunta, é sempre relevante enquanto o usuário está olhando pra uma análise específica).
    if (request.screenContext?.type === "analysis" && request.evidence?.found && request.evidence.kind === "analysis") {
      const evidence = request.evidence.evidence as AgronomicEvidencePackage;
      actions.push({ kind: "open_field", fieldId: evidence.field.id });
    }
    const structured: AssistantStructuredResponse = {
      summary: partial.summary,
      facts: partial.facts,
      attention_points: partial.attention_points,
      patterns: [],
      hypotheses: [],
      missing_information: partial.missing_information,
      technical_references: partial.technical_references ?? [],
      suggested_actions: actions,
      requires_professional_review: false,
      cards: partial.cards,
    };
    structured.requires_professional_review = computeRequiresProfessionalReview(structured);
    let handling: AssistantHandlingResult = partial.handling ?? inferHandling(partial);
    // Fase 4G, item 5/13 -- contexto de tela reconhecido (ex.: "field", "analysis") mas a ENTIDADE
    // específica não existe/não pertence a este tenant (`evidence.found === false`) -- mesmo quando
    // nenhuma intenção de texto bateu e a resposta caiu no fallback genérico (painel executivo, que é
    // seguro -- nunca vaza dado da entidade que não resolveu, só estatística agregada do próprio tenant),
    // isto NUNCA é `"unsupported"` (a pergunta em si não foi entendida) -- é `"insufficient_evidence"`
    // (sabemos do que a pergunta trata, só não existe pra este tenant). Só sobrescreve DE
    // `"unsupported"` PRA `"insufficient_evidence"` -- nunca esconde um `"unsupported"` real quando o
    // contexto resolveu normalmente, nunca muda o TEXTO da resposta (só a classificação estrutural que o
    // router usa pra decidir se escalona pro generativo).
    if (handling === "unsupported" && request.evidence?.found === false && request.evidence.kind !== "invalid") {
      handling = "insufficient_evidence";
    }
    return {
      ...structured,
      suggestedQuestions: SUGGESTED_QUESTIONS,
      provider: "raiz-local-intent",
      model: "intent-matcher-v2",
      isRealLanguageModel: false,
      generatedAt: new Date().toISOString(),
      handling,
    };
  },
};

export { PROMPT_VERSION as LOCAL_INTENT_PROMPT_VERSION };
