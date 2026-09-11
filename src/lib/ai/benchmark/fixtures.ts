import type { AssistantEvidenceResult, DashboardEvidence, FieldEvidence, PropertyEvidence, ReportFieldEvidence, ComparisonEvidence, IntelligenceEvidence, MapEvidence } from "@/lib/ai/assistant-evidence";
import type { AgronomicEvidencePackage } from "@/lib/ai/evidence-package";

/**
 * Fase 4E, Bloco 4 — Evidence Packages EXPLICITAMENTE SINTÉTICOS pro harness de benchmark (item 5 do
 * pedido: "use somente regras/evidências já disponíveis na RAIZ ou fixtures explicitamente sintéticas para
 * teste. O motor determinístico continua sendo a autoridade."). Nenhum número aqui representa dado
 * agronômico real -- são valores de exemplo, plausíveis o bastante pra um provider (local ou generativo)
 * ter algo concreto pra narrar, mas NUNCA usados fora deste harness. IDs usam o formato RFC 4122 real (pra
 * passar pelos MESMOS validadores de produção, ex. `parseAssistantAction`), mas com um padrão repetitivo
 * óbvio (`00000000-...`) que não corresponde a nenhuma linha real do banco.
 */

/** tenant/usuário SEMPRE sintéticos, deliberadamente inexistentes no banco real -- o harness nunca roda
 *  com o tenant/sessão de quem o executa. Intenções do provider local que tocam banco direto (fora do
 *  Evidence Package, ex. "coletas atrasadas") voltam honestamente vazias pra este tenant, nunca misturam
 *  dado real de produção/dev com o resultado do benchmark -- reprodutibilidade real, não um efeito colateral. */
export const SYNTHETIC_TENANT_ID = "00000000-0000-4000-8000-000000000000";
export const SYNTHETIC_USER_ID = "00000000-0000-4000-8000-0000000000ff";

const FIELD_ID = "00000000-0000-4000-8000-000000000001";
const PROPERTY_ID = "00000000-0000-4000-8000-000000000002";
const CLIENT_ID = "00000000-0000-4000-8000-000000000003";
const ANALYSIS_ID = "00000000-0000-4000-8000-000000000004";
const SEASON_ID = "00000000-0000-4000-8000-000000000005";
const SEASON_ID_PREVIOUS = "00000000-0000-4000-8000-000000000006";
const TECH_SOURCE_ID = "00000000-0000-4000-8000-000000000007";
const FOREIGN_FIELD_NAME = "Talhão Fantasma (nunca deveria aparecer)";
const FOREIGN_CLIENT_NAME = "Cliente de Outro Tenant (nunca deveria aparecer)";

export { FIELD_ID, PROPERTY_ID, CLIENT_ID, ANALYSIS_ID, SEASON_ID, SEASON_ID_PREVIOUS, TECH_SOURCE_ID, FOREIGN_FIELD_NAME, FOREIGN_CLIENT_NAME };

export const syntheticDashboardEvidence: DashboardEvidence = {
  kind: "dashboard",
  summary: { clients: 2, properties: 3, totalAreaHa: 245.8, fields: 5, seasonsInProgress: 3, openOrders: 2, totalPoints: 40, collectedPoints: 28, labsProcessed: 4, interpretationsPending: 1, criticalFields: 1, avgConfidence: 78, coveragePct: 70 },
  attentionFields: [{ id: FIELD_ID, name: "Talhão Sintético 1", clientName: "Cliente Sintético", propertyName: "Fazenda Sintética", evaluationStatus: "NAO_INTERPRETAVEL", notInterpretableReason: "Sem cultura vinculada à safra" }],
  alerts: [{ id: "00000000-0000-4000-8000-0000000000a1", category: "Pontos não coletados", criticality: "ALTA", title: "12 pontos pendentes", description: "Ordem OC-SINTETICA-01 com 12 de 40 pontos ainda não coletados" }],
};

export const syntheticFieldEvidence: FieldEvidence = {
  kind: "field",
  field: { id: FIELD_ID, name: "Talhão Sintético 1", areaHa: 42.5, propertyId: PROPERTY_ID, propertyName: "Fazenda Sintética", clientId: CLIENT_ID, clientName: "Cliente Sintético", municipality: "Cidade Sintética", state: "RS" },
  seasons: [
    { id: SEASON_ID, seasonLabel: "2026/27", currentCrop: "Soja", cultivar: "BMX Potência", yieldGoal: 3600, yieldGoalUnit: "kg/ha", createdAt: "2026-08-01T00:00:00.000Z" },
    { id: SEASON_ID_PREVIOUS, seasonLabel: "2025/26", currentCrop: "Milho", cultivar: null, yieldGoal: 9000, yieldGoalUnit: "kg/ha", createdAt: "2025-08-01T00:00:00.000Z" },
  ],
  collectionSummary: { plannedPoints: 20, collectedPoints: 20, orderCount: 1 },
  analyses: [{ id: ANALYSIS_ID, code: "AN-SINTETICA-01", status: "AWAITING_REVIEW", confidenceScore: 82, latestInterpretationStatus: "IN_REVIEW", notInterpretableReason: null, createdAt: "2026-08-10T00:00:00.000Z" }],
  yieldHistory: [{ seasonLabel: "2025/26", crop: "Milho", yieldValue: 8700, yieldUnit: "kg/ha", createdAt: "2026-01-01T00:00:00.000Z" }],
  // Correção 1 da arquitetura (Fase 4A) -- sempre `false`, mesmo na fixture sintética: o harness testa
  // justamente se o provider RESPEITA essa limitação, nunca finge geometria que a evidência não declara.
  ndvi: { latestCapturedAt: "2026-07-15T00:00:00.000Z", latestMeanNdvi: 0.62, zoneBreakdownPct: { alto: 40, medio: 45, baixo: 15 }, snapshotCount: 3, spatialGeometryAvailable: false },
  gpsQuality: { total: 20, confirmedCount: 18 },
  reports: [],
};

export const syntheticAnalysisEvidence: AgronomicEvidencePackage = {
  tenant: { id: "00000000-0000-4000-8000-000000000000", name: "Tenant Sintético" },
  client: { id: CLIENT_ID, name: "Cliente Sintético" },
  property: { id: PROPERTY_ID, name: "Fazenda Sintética", municipality: "Cidade Sintética", state: "RS" },
  field: { id: FIELD_ID, name: "Talhão Sintético 1", areaHa: 42.5 },
  season: { id: SEASON_ID, label: "2026/27", crop: "Soja", cropGroup: "VERAO", cultivar: "BMX Potência", managementSystem: "Plantio direto", soilTexture: "Argiloso", yieldGoal: 3600, yieldGoalUnit: "kg/ha" },
  region: { code: "RS-PLANALTO" },
  analysis: { id: ANALYSIS_ID, code: "AN-SINTETICA-01", status: "AWAITING_REVIEW", createdAt: "2026-08-10T00:00:00.000Z" },
  results: [{ sampleCode: "SQC-001", parameterCode: "P", value: 8.2, unit: "mg/dm3", method: "Mehlich-1" }],
  classifications: [
    { sampleCode: "SQC-001", parameterCode: "P", interpretable: true, classification: "BAIXO", reason: null },
    { sampleCode: "SQC-002", parameterCode: "K", interpretable: false, classification: null, reason: "Perfil de cultura sem faixa homologada para K nesta profundidade" },
  ],
  ruleUsed: { cropProfileCode: "SOJA-CQFS-RS-SC", cropProfileName: "Soja (CQFS RS/SC 2016)", version: "1", contentHash: "sintetico1234567890" },
  confidence: { score: 82, level: "ALTA" },
  technicalSources: [{ id: TECH_SOURCE_ID, title: "Manual de Calagem e Adubação para os Estados do RS e SC (CQFS RS/SC, 2016)", institution: "CQFS RS/SC", editionYear: 2016, subject: "Fertilidade do solo" }],
  history: [],
  reviewStatus: "IN_REVIEW",
};

export const syntheticPropertyEvidence: PropertyEvidence = {
  kind: "property",
  property: { id: PROPERTY_ID, name: "Fazenda Sintética", municipality: "Cidade Sintética", state: "RS", clientName: "Cliente Sintético" },
  summary: { interpretationsPending: 2, criticalFields: 1, coveragePct: 70 },
  fields: [{ id: FIELD_ID, name: "Talhão Sintético 1", evaluationStatus: "NAO_INTERPRETAVEL", notInterpretableReason: "Sem cultura vinculada à safra" }],
  attentionFields: [{ id: FIELD_ID, name: "Talhão Sintético 1", evaluationStatus: "NAO_INTERPRETAVEL", notInterpretableReason: "Sem cultura vinculada à safra" }],
};

export const syntheticReportFieldEvidence: ReportFieldEvidence = {
  kind: "report-field",
  analysis: { id: ANALYSIS_ID, code: "AN-SINTETICA-01", status: "AWAITING_REVIEW", fieldName: "Talhão Sintético 1", propertyName: "Fazenda Sintética", clientName: "Cliente Sintético" },
  hasPublishedReport: false,
  publishedRevision: null,
  latestInterpretationRevision: 1,
  isCurrentRevisionPublished: false,
};

export const syntheticComparisonReadyEvidence: ComparisonEvidence = { kind: "comparison", ready: true, mode: "seasons", labelA: "Talhão Sintético 1 · 2026/27", labelB: "Talhão Sintético 1 · 2025/26", rowCount: 6 };
export const syntheticComparisonNotReadyEvidence: ComparisonEvidence = { kind: "comparison", ready: false, mode: null };

export const syntheticIntelligenceEvidence: IntelligenceEvidence = {
  kind: "intelligence",
  ready: true,
  items: [{ analysisId: ANALYSIS_ID, analysisCode: "AN-SINTETICA-01", clientName: "Cliente Sintético", propertyName: "Fazenda Sintética", fieldName: "Talhão Sintético 1", seasonLabel: "2026/27", status: "IN_REVIEW", bucket: "AGUARDANDO_REVISAO", revisionCount: 1 }],
  totalCount: 1,
};

export const syntheticMapFieldEvidence: MapEvidence = { kind: "map", delegatedTo: "field", field: syntheticFieldEvidence };

/** Fixture "cross-tenant": simula o resultado que `buildAssistantEvidence` já devolve quando a entidade não
 *  pertence ao tenant da sessão -- `found:false`, nenhum dado. O nome real da entidade de outro tenant NUNCA
 *  entra aqui (é isso que o critério `must_refuse_cross_tenant_context` prova). */
export function notFoundEvidence(kind: "field" | "property" | "report-property" | "analysis" | "report-field"): AssistantEvidenceResult {
  if (kind === "field") return { found: false, kind: "field", entityIds: { fieldId: "11111111-1111-4111-8111-111111111111" } };
  if (kind === "analysis") return { found: false, kind: "analysis", entityIds: { analysisId: "11111111-1111-4111-8111-111111111111" } };
  if (kind === "report-field") return { found: false, kind: "report-field", entityIds: { analysisId: "11111111-1111-4111-8111-111111111111" } };
  return { found: false, kind, entityIds: { propertyId: "11111111-1111-4111-8111-111111111111" } };
}
