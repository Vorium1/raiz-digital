import { createHash } from "node:crypto";
import { withTenant } from "@/lib/db";
import type { AssistantScreenContext, AssistantScreenState } from "@/lib/ai/assistant-screen";
import { buildAgronomicEvidencePackage, type AgronomicEvidencePackage } from "@/lib/ai/evidence-package";
import { getExecutiveDashboard, getPortfolioFieldSummaries, type ExecutiveDashboard } from "@/lib/repositories/dashboard";
import { listOperationalAlerts } from "@/lib/repositories/alerts";
import { getPropertyExecutiveReportData, getFieldAnalysisReportData } from "@/lib/repositories/reports";
import { getFieldOverview } from "@/lib/repositories/field-overview";
import { compareFields, compareSeasons, comparePoints, compareProperties } from "@/lib/repositories/comparisons";
import { getIntelligenceQueue } from "@/lib/repositories/interpretations";

/**
 * Fase 4A, Bloco 2 — Evidence Package Builders, um por tipo de `ScreenContext`.
 *
 * Regra que atravessa todos (arquitetura, seção 5.3): SEMPRE via `withTenant`; teto explícito de tamanho
 * em toda lista/histórico; dado ausente vira `null`/lista vazia, nunca inferido; nenhum builder produz
 * hipótese — isso é responsabilidade exclusiva da camada de resposta (`assistant-response-schema.ts`,
 * só no futuro Bloco 3+, quando houver LLM real). Nenhum builder abre conexão de banco pro provider: o
 * provider só recebe o objeto já montado.
 *
 * NDVI (Correção 1 da arquitetura): `field_ndvi_snapshots` só agrega vigor por talhão inteiro, sem
 * geometria/raster/polígono de zona -- `FieldEvidence.ndvi.spatialGeometryAvailable` é sempre `false`,
 * de propósito, nunca inferido como `true`.
 */

const HISTORY_LIMIT = 5;
const LIST_LIMIT = 10;

// ---------------------------------------------------------------------------------------------
// dashboard
// ---------------------------------------------------------------------------------------------

export type DashboardEvidence = {
  kind: "dashboard";
  summary: ExecutiveDashboard;
  attentionFields: Array<{ id: string; name: string; clientName: string; propertyName: string; evaluationStatus: string; notInterpretableReason: string | null }>;
  alerts: Array<{ id: string; category: string; criticality: string; title: string; description: string }>;
};

export async function buildDashboardEvidence(tenantId: string, userId: string): Promise<DashboardEvidence> {
  const [summary, fields, alerts] = await Promise.all([
    getExecutiveDashboard(tenantId, {}, userId),
    getPortfolioFieldSummaries(tenantId, {}, userId),
    listOperationalAlerts(tenantId, userId),
  ]);
  const attentionFields = fields
    .filter((f) => f.evaluationStatus === "SEM_ANALISE" || f.evaluationStatus === "NAO_INTERPRETAVEL")
    .slice(0, LIST_LIMIT)
    .map((f) => ({ id: f.id, name: f.name, clientName: f.clientName, propertyName: f.propertyName, evaluationStatus: f.evaluationStatus, notInterpretableReason: f.notInterpretableReason }));
  return {
    kind: "dashboard",
    summary,
    attentionFields,
    alerts: alerts.slice(0, LIST_LIMIT).map((a) => ({ id: a.id, category: a.category, criticality: a.criticality, title: a.title, description: a.description })),
  };
}

// ---------------------------------------------------------------------------------------------
// property / report-property (mesmo dado real, dois contextos de tela diferentes)
// ---------------------------------------------------------------------------------------------

export type PropertyEvidence = {
  kind: "property" | "report-property";
  property: { id: string; name: string; municipality: string; state: string; clientName: string };
  summary: { interpretationsPending: number; criticalFields: number; coveragePct: number };
  fields: Array<{ id: string; name: string; evaluationStatus: string; notInterpretableReason: string | null }>;
  attentionFields: Array<{ id: string; name: string; evaluationStatus: string; notInterpretableReason: string | null }>;
};

export async function buildPropertyEvidence(tenantId: string, userId: string, propertyId: string, kind: "property" | "report-property" = "property"): Promise<PropertyEvidence | null> {
  const data = await getPropertyExecutiveReportData(tenantId, propertyId, userId);
  if (!data) return null;
  const mapField = (f: any) => ({ id: f.id, name: f.name, evaluationStatus: f.evaluationStatus, notInterpretableReason: f.notInterpretableReason ?? null });
  return {
    kind,
    property: { id: data.property.id, name: data.property.name, municipality: data.property.municipality, state: data.property.state, clientName: data.property.clientName },
    summary: { interpretationsPending: data.summary.interpretationsPending, criticalFields: data.summary.criticalFields, coveragePct: data.summary.coveragePct },
    fields: data.fields.slice(0, LIST_LIMIT).map(mapField),
    attentionFields: data.attentionFields.slice(0, LIST_LIMIT).map(mapField),
  };
}

// ---------------------------------------------------------------------------------------------
// field
// ---------------------------------------------------------------------------------------------

export type FieldEvidence = {
  kind: "field";
  field: { id: string; name: string; areaHa: number; propertyId: string; propertyName: string; clientId: string; clientName: string; municipality: string; state: string };
  seasons: Array<{ id: string; seasonLabel: string; currentCrop: string | null; cultivar: string | null; yieldGoal: number | null; yieldGoalUnit: string | null; createdAt: string }>;
  collectionSummary: { plannedPoints: number; collectedPoints: number; orderCount: number };
  analyses: Array<{ id: string; code: string; status: string; confidenceScore: number | null; latestInterpretationStatus: string | null; notInterpretableReason: string | null; createdAt: string }>;
  yieldHistory: Array<{ seasonLabel: string; crop: string | null; yieldValue: number | null; yieldUnit: string | null; createdAt: string }>;
  /** Correção 1 da arquitetura: `spatialGeometryAvailable` é SEMPRE `false` -- nunca inferir uma geometria
   *  que `field_ndvi_snapshots` não tem. Ver `describeNdviFieldCoexistence` em `assistant-response-schema.ts`. */
  ndvi: { latestCapturedAt: string | null; latestMeanNdvi: number | null; zoneBreakdownPct: unknown | null; snapshotCount: number; spatialGeometryAvailable: false };
  gpsQuality: { total: number; confirmedCount: number };
  reports: Array<{ analysisId: string; revision: number; publishedAt: string }>;
};

export async function buildFieldEvidence(tenantId: string, userId: string, fieldId: string): Promise<FieldEvidence | null> {
  const overview = await getFieldOverview(tenantId, fieldId, userId);
  if (!overview) return null;
  const orders = overview.orders as any[];
  const ndviSnapshots = overview.ndviSnapshots as any[];
  const latest = ndviSnapshots[0]; // getFieldOverview já ordena por captured_at DESC
  return {
    kind: "field",
    field: {
      id: overview.field.id, name: overview.field.name, areaHa: overview.field.areaHa,
      propertyId: overview.field.propertyId, propertyName: overview.field.propertyName,
      clientId: overview.field.clientId, clientName: overview.field.clientName,
      municipality: overview.field.municipality, state: overview.field.state,
    },
    seasons: (overview.seasons as any[]).slice(0, HISTORY_LIMIT).map((s) => ({ id: s.id, seasonLabel: s.seasonLabel, currentCrop: s.currentCrop, cultivar: s.cultivar, yieldGoal: s.yieldGoal, yieldGoalUnit: s.yieldGoalUnit, createdAt: s.createdAt })),
    collectionSummary: {
      plannedPoints: orders.reduce((sum, o) => sum + o.plannedPoints, 0),
      collectedPoints: orders.reduce((sum, o) => sum + o.collectedPoints, 0),
      orderCount: orders.length,
    },
    analyses: (overview.analyses as any[]).slice(0, HISTORY_LIMIT).map((a) => ({ id: a.id, code: a.code, status: a.status, confidenceScore: a.confidenceScore, latestInterpretationStatus: a.latestInterpretationStatus, notInterpretableReason: a.notInterpretableReason, createdAt: a.createdAt })),
    yieldHistory: (overview.yieldHistory as any[]).slice(0, HISTORY_LIMIT).map((y) => ({ seasonLabel: y.seasonLabel, crop: y.crop, yieldValue: y.yieldValue, yieldUnit: y.yieldUnit, createdAt: y.createdAt })),
    ndvi: {
      latestCapturedAt: latest?.capturedAt ?? null,
      latestMeanNdvi: latest?.meanNdvi ?? null,
      zoneBreakdownPct: latest?.zoneBreakdownPct ?? null,
      snapshotCount: ndviSnapshots.length,
      spatialGeometryAvailable: false,
    },
    gpsQuality: overview.gpsQuality,
    reports: (overview.reports as any[]).slice(0, HISTORY_LIMIT).map((r) => ({ analysisId: r.analysisId, revision: r.revision, publishedAt: r.publishedAt })),
  };
}

// ---------------------------------------------------------------------------------------------
// analysis -- reaproveita o Evidence Package já existente (Fase 3), sem mudar nada nele
// ---------------------------------------------------------------------------------------------

export async function buildAnalysisEvidence(tenantId: string, userId: string, analysisId: string): Promise<AgronomicEvidencePackage | null> {
  return buildAgronomicEvidencePackage(tenantId, userId, analysisId);
}

// ---------------------------------------------------------------------------------------------
// report-field
// ---------------------------------------------------------------------------------------------

export type ReportFieldEvidence = {
  kind: "report-field";
  analysis: { id: string; code: string; status: string; fieldName: string; propertyName: string; clientName: string };
  hasPublishedReport: boolean;
  publishedRevision: number | null;
  latestInterpretationRevision: number | null;
  isCurrentRevisionPublished: boolean;
};

export async function buildReportFieldEvidence(tenantId: string, userId: string, analysisId: string): Promise<ReportFieldEvidence | null> {
  const data = await getFieldAnalysisReportData(tenantId, analysisId, userId);
  if (!data) return null;
  return {
    kind: "report-field",
    analysis: { id: data.analysis.id, code: data.analysis.code, status: data.analysis.status, fieldName: data.analysis.fieldName, propertyName: data.analysis.propertyName, clientName: data.analysis.clientName },
    hasPublishedReport: Boolean(data.publishedReport),
    publishedRevision: data.publishedReport?.reportRevision ?? null,
    latestInterpretationRevision: data.interpretation?.revision ?? null,
    isCurrentRevisionPublished: data.isShowingPublishedVersion,
  };
}

// ---------------------------------------------------------------------------------------------
// comparison -- nunca dispara comparação sozinho; só monta evidência quando A e B já estão
// escolhidos no ScreenState (mesma regra de UX já testada em comparison-explorer.tsx)
// ---------------------------------------------------------------------------------------------

export type ComparisonEvidence =
  | { kind: "comparison"; ready: false; mode: "fields" | "seasons" | "points" | "properties" | null }
  | { kind: "comparison"; ready: true; mode: "fields" | "seasons" | "points" | "properties"; labelA: string; labelB: string; rowCount: number };

export async function buildComparisonEvidence(tenantId: string, userId: string, state: AssistantScreenState | undefined): Promise<ComparisonEvidence> {
  const s = state && state.screen === "comparison" ? state : undefined;
  const mode = s?.mode ?? null;
  if (!s?.a || !s?.b || !mode) return { kind: "comparison", ready: false, mode };
  try {
    if (mode === "fields") {
      const r = await compareFields(tenantId, s.a, s.b, userId);
      if (r.labelA === "—" || r.labelB === "—") return { kind: "comparison", ready: false, mode };
      return { kind: "comparison", ready: true, mode, labelA: r.labelA, labelB: r.labelB, rowCount: r.rows.length };
    }
    if (mode === "seasons") {
      const r = await compareSeasons(tenantId, s.a, s.b, userId);
      if (r.labelA === "—" || r.labelB === "—") return { kind: "comparison", ready: false, mode };
      return { kind: "comparison", ready: true, mode, labelA: r.labelA, labelB: r.labelB, rowCount: r.rows.length };
    }
    if (mode === "points") {
      const r = await comparePoints(tenantId, s.a, s.b, userId);
      if (!r.pointA || !r.pointB) return { kind: "comparison", ready: false, mode };
      return { kind: "comparison", ready: true, mode, labelA: r.pointA.code, labelB: r.pointB.code, rowCount: r.rows.length };
    }
    const r = await compareProperties(tenantId, s.a, s.b, userId);
    if (!r.summaryA || !r.summaryB) return { kind: "comparison", ready: false, mode };
    return { kind: "comparison", ready: true, mode, labelA: r.summaryA.name, labelB: r.summaryB.name, rowCount: 0 };
  } catch {
    // IDs inválidos (não-uuid) ou de outro tenant -- nunca vaza detalhe do erro, só "não pronto".
    return { kind: "comparison", ready: false, mode };
  }
}

// ---------------------------------------------------------------------------------------------
// intelligence
// ---------------------------------------------------------------------------------------------

export type IntelligenceEvidence = {
  kind: "intelligence";
  items: Array<{ analysisId: string; analysisCode: string; clientName: string; propertyName: string; fieldName: string; seasonLabel: string; status: string; revisionCount: number }>;
  totalCount: number;
};

export async function buildIntelligenceEvidence(tenantId: string, userId: string, state: AssistantScreenState | undefined): Promise<IntelligenceEvidence> {
  const s = state && state.screen === "intelligence" ? state : undefined;
  const rows = await getIntelligenceQueue(tenantId, { clientId: s?.clientId ?? null, propertyId: s?.propertyId ?? null, fieldId: s?.fieldId ?? null, seasonId: s?.seasonId ?? null }, userId);
  return {
    kind: "intelligence",
    items: rows.slice(0, LIST_LIMIT).map((r: any) => ({ analysisId: r.analysisId, analysisCode: r.analysisCode, clientName: r.clientName, propertyName: r.propertyName, fieldName: r.fieldName, seasonLabel: r.seasonLabel, status: r.status, revisionCount: r.revisionCount })),
    totalCount: rows.length,
  };
}

// ---------------------------------------------------------------------------------------------
// map -- não tem entidade única; delega pro talhão selecionado no ScreenState, ou pro dashboard
// ---------------------------------------------------------------------------------------------

export type MapEvidence =
  | { kind: "map"; delegatedTo: "field"; field: FieldEvidence }
  | { kind: "map"; delegatedTo: "dashboard"; dashboard: DashboardEvidence }
  | { kind: "map"; delegatedTo: "none" };

async function resolveFieldIdForCollectionOrder(tenantId: string, userId: string, collectionOrderId: string): Promise<string | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(collectionOrderId)) return null;
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT cs.field_id::text AS "fieldId" FROM collection_orders co
       JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
       WHERE co.tenant_id = $1::uuid AND co.id = $2::uuid`,
      [tenantId, collectionOrderId],
    );
    return result.rows[0]?.fieldId ?? null;
  });
}

export async function buildMapEvidence(tenantId: string, userId: string, state: AssistantScreenState | undefined): Promise<MapEvidence> {
  const s = state && state.screen === "map" ? state : undefined;
  if (s?.collectionOrderId) {
    const fieldId = await resolveFieldIdForCollectionOrder(tenantId, userId, s.collectionOrderId);
    if (fieldId) {
      const field = await buildFieldEvidence(tenantId, userId, fieldId);
      if (field) return { kind: "map", delegatedTo: "field", field };
    }
  }
  const dashboard = await buildDashboardEvidence(tenantId, userId);
  return { kind: "map", delegatedTo: "dashboard", dashboard };
}

// ---------------------------------------------------------------------------------------------
// dispatcher único -- decide qual builder rodar a partir do ScreenContext, SEMPRE tenant-scoped
// ---------------------------------------------------------------------------------------------

export type AssistantEvidenceResult =
  | { found: true; kind: "dashboard"; evidence: DashboardEvidence; entityIds: Record<string, string> }
  | { found: true; kind: "property" | "report-property"; evidence: PropertyEvidence; entityIds: Record<string, string> }
  | { found: false; kind: "property" | "report-property"; entityIds: Record<string, string> }
  | { found: true; kind: "field"; evidence: FieldEvidence; entityIds: Record<string, string> }
  | { found: false; kind: "field"; entityIds: Record<string, string> }
  | { found: true; kind: "analysis"; evidence: AgronomicEvidencePackage; entityIds: Record<string, string> }
  | { found: false; kind: "analysis"; entityIds: Record<string, string> }
  | { found: true; kind: "report-field"; evidence: ReportFieldEvidence; entityIds: Record<string, string> }
  | { found: false; kind: "report-field"; entityIds: Record<string, string> }
  | { found: true; kind: "comparison"; evidence: ComparisonEvidence; entityIds: Record<string, string> }
  | { found: true; kind: "intelligence"; evidence: IntelligenceEvidence; entityIds: Record<string, string> }
  | { found: true; kind: "map"; evidence: MapEvidence; entityIds: Record<string, string> };

/**
 * Único ponto de entrada: dado o `ScreenContext` (já validado pelo endpoint, seção 4 da arquitetura) e o
 * `ScreenState` (nunca tratado como autorização -- cada builder revalida tenant/existência por conta
 * própria), monta o Evidence Package certo. Nunca dá ao chamador uma conexão de banco -- só o objeto já
 * resolvido.
 */
export async function buildAssistantEvidence(tenantId: string, userId: string, screenContext: AssistantScreenContext, screenState: AssistantScreenState | undefined): Promise<AssistantEvidenceResult> {
  switch (screenContext.type) {
    case "dashboard": {
      const evidence = await buildDashboardEvidence(tenantId, userId);
      return { found: true, kind: "dashboard", evidence, entityIds: {} };
    }
    case "property": {
      const evidence = await buildPropertyEvidence(tenantId, userId, screenContext.id, "property");
      if (!evidence) return { found: false, kind: "property", entityIds: { propertyId: screenContext.id } };
      return { found: true, kind: "property", evidence, entityIds: { propertyId: screenContext.id } };
    }
    case "report-property": {
      const evidence = await buildPropertyEvidence(tenantId, userId, screenContext.id, "report-property");
      if (!evidence) return { found: false, kind: "report-property", entityIds: { propertyId: screenContext.id } };
      return { found: true, kind: "report-property", evidence, entityIds: { propertyId: screenContext.id } };
    }
    case "field": {
      const evidence = await buildFieldEvidence(tenantId, userId, screenContext.id);
      if (!evidence) return { found: false, kind: "field", entityIds: { fieldId: screenContext.id } };
      return { found: true, kind: "field", evidence, entityIds: { fieldId: screenContext.id } };
    }
    case "analysis": {
      const evidence = await buildAnalysisEvidence(tenantId, userId, screenContext.id);
      if (!evidence) return { found: false, kind: "analysis", entityIds: { analysisId: screenContext.id } };
      return { found: true, kind: "analysis", evidence, entityIds: { analysisId: screenContext.id } };
    }
    case "report-field": {
      const evidence = await buildReportFieldEvidence(tenantId, userId, screenContext.id);
      if (!evidence) return { found: false, kind: "report-field", entityIds: { analysisId: screenContext.id } };
      return { found: true, kind: "report-field", evidence, entityIds: { analysisId: screenContext.id } };
    }
    case "comparison": {
      const evidence = await buildComparisonEvidence(tenantId, userId, screenState);
      const entityIds: Record<string, string> = {};
      if (screenState?.screen === "comparison") {
        if (screenState.a) entityIds.a = screenState.a;
        if (screenState.b) entityIds.b = screenState.b;
      }
      return { found: true, kind: "comparison", evidence, entityIds };
    }
    case "intelligence": {
      const evidence = await buildIntelligenceEvidence(tenantId, userId, screenState);
      return { found: true, kind: "intelligence", evidence, entityIds: {} };
    }
    case "map": {
      const evidence = await buildMapEvidence(tenantId, userId, screenState);
      const entityIds: Record<string, string> = {};
      if (evidence.delegatedTo === "field") entityIds.fieldId = evidence.field.field.id;
      return { found: true, kind: "map", evidence, entityIds };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// evidenceManifest (Correção 3 da arquitetura) -- auditoria sem migration, sem copiar histórico inteiro
// ---------------------------------------------------------------------------------------------

export type EvidenceManifest = {
  screenContext: AssistantScreenContext;
  entityIds: Record<string, string>;
  builtAt: string;
  ruleRefs: string[];
  technicalSourceIds: string[];
  evidenceHash: string;
  factsSnapshot: Array<{ label: string; value: string }>;
};

const MANIFEST_FACTS_LIMIT = 20;

/**
 * Monta o manifesto de auditoria a partir do Evidence Package já resolvido -- nunca copia o pacote
 * inteiro nem histórico bruto pra dentro de `ai_generations`, só o hash (prova de integridade) e um
 * recorte explicitamente limitado dos fatos que a resposta final efetivamente citou.
 */
export function buildEvidenceManifest(input: { screenContext: AssistantScreenContext; entityIds: Record<string, string>; evidence: unknown; factsUsed: Array<{ label: string; value: string }>; ruleRefs?: string[]; technicalSourceIds?: string[] }): EvidenceManifest {
  const evidenceHash = createHash("sha256").update(JSON.stringify(input.evidence)).digest("hex");
  return {
    screenContext: input.screenContext,
    entityIds: input.entityIds,
    builtAt: new Date().toISOString(),
    ruleRefs: input.ruleRefs ?? [],
    technicalSourceIds: input.technicalSourceIds ?? [],
    evidenceHash,
    factsSnapshot: input.factsUsed.slice(0, MANIFEST_FACTS_LIMIT),
  };
}
