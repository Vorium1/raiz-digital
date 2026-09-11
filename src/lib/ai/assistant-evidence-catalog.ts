import type { AssistantEvidenceResult, DashboardEvidence, FieldEvidence, PropertyEvidence, ReportFieldEvidence, ComparisonEvidence, IntelligenceEvidence, MapEvidence } from "@/lib/ai/assistant-evidence";
import type { AgronomicEvidencePackage } from "@/lib/ai/evidence-package";
import type { AssistantFact, AssistantAttentionPoint, AssistantPattern, AssistantTechnicalReference, AssistantHypothesis } from "@/lib/ai/assistant-response-schema";

/**
 * Fase 4F, Bloco 3 — Evidence Catalog: camada de GROUNDING EXPLÍCITO entre o Evidence Package (já resolvido
 * e tenant-escopado no servidor, Bloco 2 da Fase 4A) e um provider GENERATIVO (Gemini/Claude/GPT).
 *
 * Princípio obrigatório (pedido do diretor, Fase 4F item 3): **o modelo referencia evidência; o servidor
 * materializa os campos oficiais.** Em vez de o modelo escrever `"P = 6.2 mg/dm³"` livremente (podendo
 * errar o número, a unidade, ou inventar um valor que não existe), o servidor monta ANTES um catálogo
 * limitado e tipado de tudo que é citável nesta requisição, cada item com um `ref` estável
 * (`"fact-1"`, `"attention-2"`, ...). O modelo só pode dizer "quero citar fact-1" — nunca escrever o valor
 * por conta própria. `materializeFromCatalog` (abaixo) resolve os refs pedidos pros objetos OFICIAIS
 * (`AssistantFact`/`AssistantAttentionPoint`/`AssistantPattern`/`AssistantTechnicalReference`) -- um ref
 * que não existe no catálogo nunca vira nada (nem um erro que trava a resposta -- só é ignorado/descartado,
 * exatamente como pedido: "descarte/rejeite").
 *
 * Nenhum dado novo é inventado aqui -- é uma reorganização do MESMO Evidence Package que
 * `local-intent-assistant-provider.ts` já usa, só que com refs estáveis em vez de acesso direto.
 */

export type EvidenceCatalogFact = { ref: string; label: string; value: string; sourcePath: string };
export type EvidenceCatalogAttentionPoint = { ref: string; label: string; reason: string };
export type EvidenceCatalogPattern = { ref: string; description: string; ruleRef: string };
export type EvidenceCatalogTechnicalSource = { ref: string; sourceId: string; title: string; institution: string | null };

export type EvidenceCatalog = {
  facts: EvidenceCatalogFact[];
  attentionPoints: EvidenceCatalogAttentionPoint[];
  patterns: EvidenceCatalogPattern[];
  technicalSources: EvidenceCatalogTechnicalSource[];
  /** Todo id (uuid) que aparece em algum lugar do Evidence Package -- usado pelo grounding gate
   *  (`assistant-grounding-gate.ts`) pra saber se um id citado em texto livre (ex.: `summary`) é real. */
  knownIds: string[];
  /** Todo nome/código de entidade real (talhão, propriedade, cliente, análise, fonte...) presente no
   *  Evidence Package -- mesmo uso do grounding gate, pra texto livre nunca citar uma entidade que não
   *  estava disponível. */
  knownEntityNames: string[];
};

function emptyCatalog(): EvidenceCatalog {
  return { facts: [], attentionPoints: [], patterns: [], technicalSources: [], knownIds: [], knownEntityNames: [] };
}

function pushFact(catalog: EvidenceCatalog, label: string, value: unknown, sourcePath: string) {
  if (value === null || value === undefined || value === "") return;
  catalog.facts.push({ ref: `fact-${catalog.facts.length + 1}`, label, value: String(value), sourcePath });
}
function pushAttention(catalog: EvidenceCatalog, label: string, reason: string) {
  if (!label || !reason) return;
  catalog.attentionPoints.push({ ref: `attention-${catalog.attentionPoints.length + 1}`, label, reason });
}
function pushPattern(catalog: EvidenceCatalog, description: string, ruleRef: string) {
  if (!description || !ruleRef) return;
  catalog.patterns.push({ ref: `pattern-${catalog.patterns.length + 1}`, description, ruleRef });
}
function pushSource(catalog: EvidenceCatalog, sourceId: string, title: string, institution: string | null) {
  if (!title) return;
  catalog.technicalSources.push({ ref: `source-${catalog.technicalSources.length + 1}`, sourceId, title, institution });
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NAME_KEY_RE = /(name|title|code|label)$/i;

/** Varre o Evidence Package inteiro (recursivo) pra extrair TODO id e TODO nome/código de entidade real --
 *  não depende de cada builder de catálogo lembrar de registrar um id/nome específico; qualquer coisa que
 *  já estava na evidência conta como "conhecida" pro grounding gate. */
function collectKnownIdsAndNames(value: unknown, ids: Set<string>, names: Set<string>, parentKey?: string) {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    for (const m of value.matchAll(UUID_RE)) ids.add(m[0].toLowerCase());
    if (parentKey && NAME_KEY_RE.test(parentKey) && value.trim().length > 1) names.add(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectKnownIdsAndNames(item, ids, names, parentKey);
    return;
  }
  if (typeof value === "object") {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) collectKnownIdsAndNames(v, ids, names, key);
  }
}

function buildDashboardCatalog(catalog: EvidenceCatalog, evidence: DashboardEvidence) {
  const s = evidence.summary;
  pushFact(catalog, "Clientes", s.clients, "dashboard.summary.clients");
  pushFact(catalog, "Propriedades", s.properties, "dashboard.summary.properties");
  pushFact(catalog, "Área total (ha)", s.totalAreaHa, "dashboard.summary.totalAreaHa");
  pushFact(catalog, "Talhões", s.fields, "dashboard.summary.fields");
  pushFact(catalog, "Safras em andamento", s.seasonsInProgress, "dashboard.summary.seasonsInProgress");
  pushFact(catalog, "Ordens abertas", s.openOrders, "dashboard.summary.openOrders");
  pushFact(catalog, "Pontos planejados", s.totalPoints, "dashboard.summary.totalPoints");
  pushFact(catalog, "Pontos coletados", s.collectedPoints, "dashboard.summary.collectedPoints");
  pushFact(catalog, "Laudos processados", s.labsProcessed, "dashboard.summary.labsProcessed");
  pushFact(catalog, "Interpretações pendentes", s.interpretationsPending, "dashboard.summary.interpretationsPending");
  pushFact(catalog, "Talhões críticos", s.criticalFields, "dashboard.summary.criticalFields");
  pushFact(catalog, "Cobertura de coleta (%)", s.coveragePct, "dashboard.summary.coveragePct");
  for (const f of evidence.attentionFields) pushAttention(catalog, `${f.name} (${f.clientName} · ${f.propertyName})`, f.notInterpretableReason ?? f.evaluationStatus);
  for (const a of evidence.alerts) pushAttention(catalog, a.title, a.description);
}

function buildPropertyCatalog(catalog: EvidenceCatalog, evidence: PropertyEvidence) {
  pushFact(catalog, "Propriedade", evidence.property.name, "property.name");
  pushFact(catalog, "Município/UF", `${evidence.property.municipality}/${evidence.property.state}`, "property.municipality");
  pushFact(catalog, "Talhões", evidence.fields.length, "property.fields.length");
  pushFact(catalog, "Interpretações aguardando revisão", evidence.summary.interpretationsPending, "property.summary.interpretationsPending");
  pushFact(catalog, "Talhões críticos", evidence.summary.criticalFields, "property.summary.criticalFields");
  pushFact(catalog, "Cobertura de coleta (%)", evidence.summary.coveragePct, "property.summary.coveragePct");
  for (const f of evidence.attentionFields) pushAttention(catalog, f.name, f.notInterpretableReason ?? f.evaluationStatus);
}

function buildFieldCatalog(catalog: EvidenceCatalog, evidence: FieldEvidence) {
  pushFact(catalog, "Talhão", evidence.field.name, "field.name");
  pushFact(catalog, "Propriedade", evidence.field.propertyName, "field.propertyName");
  pushFact(catalog, "Área (ha)", evidence.field.areaHa, "field.areaHa");
  pushFact(catalog, "Pontos planejados", evidence.collectionSummary.plannedPoints, "field.collectionSummary.plannedPoints");
  pushFact(catalog, "Pontos coletados", evidence.collectionSummary.collectedPoints, "field.collectionSummary.collectedPoints");
  if (evidence.seasons[0]) pushFact(catalog, `Safra atual (${evidence.seasons[0].seasonLabel})`, evidence.seasons[0].currentCrop ?? "cultura não informada", "field.seasons.0");
  if (evidence.seasons[1]) pushFact(catalog, `Safra anterior (${evidence.seasons[1].seasonLabel})`, evidence.seasons[1].currentCrop ?? "cultura não informada", "field.seasons.1");
  if (evidence.ndvi.latestMeanNdvi != null) pushFact(catalog, "NDVI médio mais recente", evidence.ndvi.latestMeanNdvi, "field.ndvi.latestMeanNdvi");
  pushFact(catalog, "Geometria espacial de NDVI disponível", evidence.ndvi.spatialGeometryAvailable ? "sim" : "não", "field.ndvi.spatialGeometryAvailable");
  for (const a of evidence.analyses) if (a.notInterpretableReason) pushAttention(catalog, `Análise ${a.code}`, a.notInterpretableReason);
}

function buildAnalysisCatalog(catalog: EvidenceCatalog, evidence: AgronomicEvidencePackage) {
  pushFact(catalog, "Análise", evidence.analysis.code, "analysis.code");
  pushFact(catalog, "Talhão", evidence.field.name, "analysis.field.name");
  pushFact(catalog, "Propriedade", evidence.property.name, "analysis.property.name");
  if (evidence.confidence) pushFact(catalog, "Confiabilidade da interpretação", `${evidence.confidence.score}/100 (${evidence.confidence.level})`, "analysis.confidence");
  const ruleName = evidence.ruleUsed?.cropProfileCode ?? evidence.ruleUsed?.cropProfileName;
  if (ruleName) {
    const ruleRefText = `${ruleName}${evidence.ruleUsed?.version ? ` v${evidence.ruleUsed.version}` : ""}`;
    pushFact(catalog, "Regra técnica usada", ruleRefText, "analysis.ruleUsed");
    pushPattern(catalog, `Interpretação seguiu a regra técnica ${ruleRefText}`, ruleRefText);
  }
  for (const c of evidence.classifications) {
    if (!c.interpretable) pushAttention(catalog, `${c.sampleCode} · ${c.parameterCode}`, c.reason ?? "Não interpretável");
    else pushFact(catalog, `Resultado ${c.parameterCode} (${c.sampleCode})`, c.classification ?? "sem classificação", `analysis.classifications.${c.sampleCode}.${c.parameterCode}`);
  }
  for (const s of evidence.technicalSources) pushSource(catalog, s.id, s.title, s.institution);
}

function buildReportFieldCatalog(catalog: EvidenceCatalog, evidence: ReportFieldEvidence) {
  pushFact(catalog, "Análise", evidence.analysis.code, "reportField.analysis.code");
  pushFact(catalog, "Talhão", evidence.analysis.fieldName, "reportField.analysis.fieldName");
  pushFact(catalog, "Relatório publicado", evidence.hasPublishedReport ? "sim" : "não", "reportField.hasPublishedReport");
  if (evidence.publishedRevision != null) pushFact(catalog, "Revisão publicada", evidence.publishedRevision, "reportField.publishedRevision");
}

function buildComparisonCatalog(catalog: EvidenceCatalog, evidence: ComparisonEvidence) {
  if (!evidence.ready) return;
  pushFact(catalog, "Lado A", evidence.labelA, "comparison.labelA");
  pushFact(catalog, "Lado B", evidence.labelB, "comparison.labelB");
  pushFact(catalog, "Parâmetros comparados", evidence.rowCount, "comparison.rowCount");
}

function buildIntelligenceCatalog(catalog: EvidenceCatalog, evidence: IntelligenceEvidence) {
  if (!evidence.ready) return;
  pushFact(catalog, "Itens na fila (com os filtros atuais)", evidence.totalCount, "intelligence.totalCount");
  for (const item of evidence.items) pushAttention(catalog, `${item.clientName} · ${item.fieldName}`, `${item.status} — ${item.analysisCode}`);
}

function buildMapCatalog(catalog: EvidenceCatalog, evidence: MapEvidence) {
  if (evidence.delegatedTo === "field") buildFieldCatalog(catalog, evidence.field);
  else if (evidence.delegatedTo === "dashboard") buildDashboardCatalog(catalog, evidence.dashboard);
}

/**
 * Ponto único de entrada -- dado o `AssistantEvidenceResult` JÁ resolvido pelo servidor (nunca acesso a
 * banco aqui), monta o catálogo citável. `found:false`/`kind:"invalid"` produzem um catálogo vazio (nunca
 * inventa entrada pra evidência que não existe).
 */
export function buildEvidenceCatalog(evidence: AssistantEvidenceResult | undefined): EvidenceCatalog {
  const catalog = emptyCatalog();
  if (!evidence || !evidence.found) return catalog;
  switch (evidence.kind) {
    case "dashboard": buildDashboardCatalog(catalog, evidence.evidence); break;
    case "property": case "report-property": buildPropertyCatalog(catalog, evidence.evidence); break;
    case "field": buildFieldCatalog(catalog, evidence.evidence); break;
    case "analysis": buildAnalysisCatalog(catalog, evidence.evidence); break;
    case "report-field": buildReportFieldCatalog(catalog, evidence.evidence); break;
    case "comparison": buildComparisonCatalog(catalog, evidence.evidence); break;
    case "intelligence": buildIntelligenceCatalog(catalog, evidence.evidence); break;
    case "map": buildMapCatalog(catalog, evidence.evidence); break;
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  collectKnownIdsAndNames(evidence.evidence, ids, names);
  catalog.knownIds = Array.from(ids);
  catalog.knownEntityNames = Array.from(names);
  return catalog;
}

/**
 * Fase 4F — texto plano de TODO o conteúdo do catálogo (labels+valores+razões+descrições+títulos+nomes
 * conhecidos), pra checagem de rastreabilidade (grounding) baseada em token. Fonte única entre o gate de
 * produção (`assistant-grounding-gate.ts`) e os critérios do benchmark (`benchmark/criteria.ts`) -- ambos
 * precisam comparar contra o MESMO texto que `materializeFromCatalog`/`resolveHypothesesFromCatalog`
 * realmente produzem (rótulos em português, ex. "Pontos planejados: 40"), não contra o JSON bruto da
 * evidência (chaves em inglês, ex. `"plannedPoints":40`) -- os dois têm o MESMO dado, mas texto diferente.
 */
export function catalogText(catalog: EvidenceCatalog): string {
  return [
    ...catalog.facts.map((f) => `${f.label} ${f.value}`),
    ...catalog.attentionPoints.map((a) => `${a.label} ${a.reason}`),
    ...catalog.patterns.map((p) => `${p.description} ${p.ruleRef}`),
    ...catalog.technicalSources.map((s) => `${s.title} ${s.institution ?? ""}`),
    ...catalog.knownEntityNames,
  ].join(" \n ");
}

/** Serializa o catálogo pro prompt do modelo -- só o que é permitido citar, nunca o Evidence Package bruto. */
export function serializeCatalogForPrompt(catalog: EvidenceCatalog): string {
  return JSON.stringify({
    facts: catalog.facts.map((f) => ({ ref: f.ref, label: f.label, value: f.value })),
    attentionPoints: catalog.attentionPoints.map((a) => ({ ref: a.ref, label: a.label, reason: a.reason })),
    patterns: catalog.patterns.map((p) => ({ ref: p.ref, description: p.description, ruleRef: p.ruleRef })),
    technicalSources: catalog.technicalSources.map((s) => ({ ref: s.ref, title: s.title, institution: s.institution })),
  });
}

/**
 * Materializa os campos OFICIAIS (`AssistantFact[]`/etc.) a partir de refs pedidos pelo modelo. Um ref que
 * não existe no catálogo é simplesmente ignorado -- nunca vira um item na resposta, nunca lança erro (o
 * pedido explícito era "descarte/rejeite", não travar a resposta inteira por um ref ruim isolado).
 */
export function materializeFromCatalog(catalog: EvidenceCatalog, refs: { factRefs?: string[]; attentionRefs?: string[]; patternRefs?: string[]; technicalSourceRefs?: string[] }): { facts: AssistantFact[]; attention_points: AssistantAttentionPoint[]; patterns: AssistantPattern[]; technical_references: AssistantTechnicalReference[] } {
  const factRefs = new Set(refs.factRefs ?? []);
  const attentionRefs = new Set(refs.attentionRefs ?? []);
  const patternRefs = new Set(refs.patternRefs ?? []);
  const technicalSourceRefs = new Set(refs.technicalSourceRefs ?? []);
  return {
    facts: catalog.facts.filter((f) => factRefs.has(f.ref)).map((f) => ({ label: f.label, value: f.value, source: "database" as const })),
    attention_points: catalog.attentionPoints.filter((a) => attentionRefs.has(a.ref)).map((a) => ({ label: a.label, reason: a.reason })),
    patterns: catalog.patterns.filter((p) => patternRefs.has(p.ref)).map((p) => ({ description: p.description, ruleRef: p.ruleRef })),
    technical_references: catalog.technicalSources.filter((s) => technicalSourceRefs.has(s.ref)).map((s) => ({ title: s.title, institution: s.institution })),
  };
}

/**
 * Fase 4F, item 5 — hipóteses: `supportingEvidenceRefs` (o que o modelo pediu) é resolvido contra QUALQUER
 * categoria do catálogo (fato, ponto de atenção, padrão ou fonte -- uma hipótese pode se apoiar em
 * qualquer um desses). Uma hipótese que não resolve NENHUM ref válido é DESCARTADA inteira (nunca uma
 * hipótese "vazia" ou com `supportingEvidence: []` chega ao client) -- exatamente como pedido: "ser
 * descartada, ou falhar a resposta de forma fechada". Escolhido descartar só a hipótese problemática (não
 * a resposta inteira) porque as outras hipóteses/fatos da mesma resposta continuam válidos e úteis.
 */
export function resolveHypothesesFromCatalog(catalog: EvidenceCatalog, rawHypotheses: Array<{ statement: string; supportingEvidenceRefs?: string[]; missingToConfirm?: string[] }>): AssistantHypothesis[] {
  const byRef = new Map<string, string>();
  for (const f of catalog.facts) byRef.set(f.ref, `${f.label}: ${f.value}`);
  for (const a of catalog.attentionPoints) byRef.set(a.ref, `${a.label} — ${a.reason}`);
  for (const p of catalog.patterns) byRef.set(p.ref, p.description);
  for (const s of catalog.technicalSources) byRef.set(s.ref, s.title);

  const resolved: AssistantHypothesis[] = [];
  for (const raw of rawHypotheses) {
    if (!raw.statement) continue;
    const supportingEvidence = (raw.supportingEvidenceRefs ?? []).map((ref) => byRef.get(ref)).filter((v): v is string => Boolean(v));
    if (!supportingEvidence.length) continue; // sem nenhum ref válido -- hipótese descartada
    resolved.push({ statement: raw.statement, supportingEvidence, missingToConfirm: raw.missingToConfirm ?? [] });
  }
  return resolved;
}
