import { createHash } from "node:crypto";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { saveReportSnapshot, readRawStoredFile } from "@/lib/storage";
import { getExecutiveDashboard, getPortfolioFieldSummaries } from "@/lib/repositories/dashboard";
import { getTenantBranding, type TenantBranding } from "@/lib/repositories/tenant-branding";

/** Schema do JSON gravado no publish -- versão 2 (fechamento técnico Fase 3, item 2). Snapshots
 * publicados ANTES desta mudança (se algum dia existirem em outro ambiente) não têm `reportSnapshotVersion`
 * nem `publishedContext`/`brandingSnapshot` -- tratados como versão 1 implícita em `getPublishedReportSnapshot`/
 * na tela, que marca esses campos como não capturados em vez de usar dado atual disfarçado de imutável. */
export const REPORT_SNAPSHOT_VERSION = 2;

export type PublishedReportContext = {
  id: string; code: string; status: string; confidenceScore: number | null; confidenceLevel: string | null;
  createdAt: string; updatedAt: string;
  clientName: string; propertyName: string; municipality: string; state: string;
  fieldId: string; fieldName: string; areaHa: number;
  seasonLabel: string; currentCrop: string | null; cultivar: string | null; managementSystem: string | null;
  soilTexture: string | null; yieldGoal: number | null; yieldGoalUnit: string | null; laboratoryName: string | null;
};

export type ReportSnapshotV2 = {
  reportSnapshotVersion: 2;
  interpretationId: string;
  revision: number;
  publishedContext: PublishedReportContext;
  structuredOutput: unknown;
  brandingSnapshot: TenantBranding;
  publishedAt: string;
  publishedBy: string;
};

export class ReportError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "ReportError";
  }
}

/** Relatório de análise por talhão: fecha o elo interpretação -> relatório da rastreabilidade. */
export async function getFieldAnalysisReportData(tenantId: string, analysisId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const analysisResult = await client.query(
      `SELECT a.id::text, a.code, a.status::text, a.confidence_score::float8 AS "confidenceScore", a.confidence_level AS "confidenceLevel",
              a.created_at::text AS "createdAt", a.updated_at::text AS "updatedAt", a.collection_order_id::text AS "collectionOrderId",
              c.name AS "clientName", p.name AS "propertyName", p.municipality, p.state,
              f.id::text AS "fieldId", f.name AS "fieldName", f.area_ha::float8 AS "areaHa", ST_AsGeoJSON(f.boundary)::json AS "fieldBoundary",
              cs.season_label AS "seasonLabel", cs.current_crop AS "currentCrop", cs.cultivar, cs.management_system AS "managementSystem",
              cs.soil_texture AS "soilTexture", cs.yield_goal::float8 AS "yieldGoal", cs.yield_goal_unit AS "yieldGoalUnit",
              l.name AS "laboratoryName"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       LEFT JOIN laboratories l ON l.id = a.laboratory_id
       WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid`,
      [tenantId, analysisId],
    );
    const analysis = analysisResult.rows[0];
    if (!analysis) return null;

    const pointsResult = await client.query(
      `SELECT sp.id::text, sp.code, ST_Y(sp.position)::float8 AS latitude, ST_X(sp.position)::float8 AS longitude,
              sp.depth_from_cm::float8 AS "depthFromCm", sp.depth_to_cm::float8 AS "depthToCm", sp.collected_at::text AS "collectedAt"
       FROM sample_points sp WHERE sp.tenant_id = $1::uuid AND sp.collection_order_id = $2::uuid ORDER BY sp.sequence NULLS LAST, sp.code`,
      [tenantId, analysis.collectionOrderId],
    );

    const resultsResult = await client.query(
      `SELECT ls.laboratory_code AS "sampleCode", lr.parameter_code AS "parameterCode", lr.numeric_value::float8 AS value,
              lr.unit, lr.analytical_method AS method
       FROM lab_samples ls JOIN lab_results lr ON lr.tenant_id = ls.tenant_id AND lr.lab_sample_id = ls.id
       WHERE ls.tenant_id = $1::uuid AND ls.analysis_id = $2::uuid ORDER BY ls.laboratory_code, lr.parameter_code`,
      [tenantId, analysisId],
    );

    const interpretationResult = await client.query(
      `SELECT i.id::text, i.revision, i.status, i.structured_output AS "structuredOutput", i.not_interpretable_reason AS "notInterpretableReason",
              i.created_at::text AS "createdAt", i.reviewed_at::text AS "reviewedAt", i.approved_at::text AS "approvedAt",
              reviewer.name AS "reviewedByName", approver.name AS "approvedByName", cp.name AS "cropProfileName"
       FROM interpretations i
       LEFT JOIN users reviewer ON reviewer.id = i.reviewed_by
       LEFT JOIN users approver ON approver.id = i.approved_by
       LEFT JOIN crop_profiles cp ON cp.id = i.crop_profile_id
       WHERE i.tenant_id = $1::uuid AND i.analysis_id = $2::uuid
       ORDER BY i.revision DESC LIMIT 1`,
      [tenantId, analysisId],
    );

    // Fase 3, Bloco F: a tela que gera este relatório sempre lê a interpretação MAIS RECENTE ao vivo
    // (linha acima), mas o registro imutável publicado (`reports`, com hash) pode ser de uma revisão
    // ANTERIOR -- reabrir esta URL depois de recalcular mostra o dado novo, não o publicado. A tela avisa
    // quando divergirem, e o fechamento técnico da Fase 3 passou a servir de volta o snapshot real
    // (ver `getPublishedReportSnapshot` abaixo) quando `STORAGE_PROVIDER=local` -- a alternância "Versão
    // atual / Versão publicada" lê o arquivo gravado no publish, não reconstrói a partir do dado atual.
    const publishedResult = await client.query(
      `SELECT r.id::text, r.revision AS "reportRevision", r.storage_key AS "storageKey", r.published_at::text AS "publishedAt", r.sha256 AS "contentHash",
              i.id::text AS "interpretationId", i.revision AS "interpretationRevision", publisher.name AS "publishedByName"
       FROM reports r
       JOIN interpretations i ON i.tenant_id = r.tenant_id AND i.id = r.interpretation_id
       LEFT JOIN users publisher ON publisher.id = r.published_by
       WHERE r.tenant_id = $1::uuid AND i.analysis_id = $2::uuid
       ORDER BY r.published_at DESC LIMIT 1`,
      [tenantId, analysisId],
    );
    const publishedReport = publishedResult.rows[0] ?? null;
    const latestInterpretation = interpretationResult.rows[0] ?? null;

    return {
      analysis,
      points: pointsResult.rows,
      results: resultsResult.rows,
      interpretation: latestInterpretation,
      publishedReport,
      isShowingPublishedVersion: Boolean(publishedReport && latestInterpretation && publishedReport.interpretationId === latestInterpretation.id),
    };
  });
}

export async function getCollectionReportData(tenantId: string, collectionOrderId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const orderResult = await client.query(
      `SELECT co.id::text, co.code, co.status, co.grid_area_ha::float8 AS "gridAreaHa", co.depth_from_cm::float8 AS "depthFromCm",
              co.depth_to_cm::float8 AS "depthToCm", co.planned_at::text AS "plannedAt", co.created_at::text AS "createdAt",
              assignee.name AS "assignedToName",
              c.name AS "clientName", p.name AS "propertyName", f.name AS "fieldName", f.area_ha::float8 AS "areaHa",
              ST_AsGeoJSON(f.boundary)::json AS "fieldBoundary", cs.season_label AS "seasonLabel", cs.current_crop AS "currentCrop"
       FROM collection_orders co
       JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       LEFT JOIN users assignee ON assignee.id = co.assigned_to
       WHERE co.tenant_id = $1::uuid AND co.id = $2::uuid`,
      [tenantId, collectionOrderId],
    );
    const order = orderResult.rows[0];
    if (!order) return null;

    const pointsResult = await client.query(
      `SELECT sp.id::text, sp.code, ST_Y(sp.position)::float8 AS latitude, ST_X(sp.position)::float8 AS longitude,
              sp.depth_from_cm::float8 AS "depthFromCm", sp.depth_to_cm::float8 AS "depthToCm", sp.collected_at::text AS "collectedAt",
              sp.gps_source AS "gpsSource", collector.name AS "collectedByName", sp.notes
       FROM sample_points sp LEFT JOIN users collector ON collector.id = sp.collected_by
       WHERE sp.tenant_id = $1::uuid AND sp.collection_order_id = $2::uuid ORDER BY sp.sequence NULLS LAST, sp.code`,
      [tenantId, collectionOrderId],
    );

    return { order, points: pointsResult.rows };
  });
}

export async function getHistoricalEvolutionReportData(tenantId: string, fieldId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const fieldResult = await client.query(
      `SELECT f.id::text, f.name AS "fieldName", f.area_ha::float8 AS "areaHa", c.name AS "clientName", p.name AS "propertyName"
       FROM fields f JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       WHERE f.tenant_id = $1::uuid AND f.id = $2::uuid`,
      [tenantId, fieldId],
    );
    const field = fieldResult.rows[0];
    if (!field) return null;

    const seasonsResult = await client.query(
      `SELECT id::text, season_label AS "seasonLabel", current_crop AS "currentCrop" FROM crop_seasons
       WHERE tenant_id = $1::uuid AND field_id = $2::uuid ORDER BY created_at`,
      [tenantId, fieldId],
    );

    const analysesResult = await client.query(
      `SELECT a.id::text, a.code, a.created_at::text AS "createdAt", cs.season_label AS "seasonLabel",
              i.structured_output AS "structuredOutput", i.status AS "interpretationStatus"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       LEFT JOIN LATERAL (
         SELECT structured_output, status FROM interpretations
         WHERE tenant_id = a.tenant_id AND analysis_id = a.id ORDER BY revision DESC LIMIT 1
       ) i ON true
       WHERE a.tenant_id = $1::uuid AND cs.field_id = $2::uuid
       ORDER BY a.created_at`,
      [tenantId, fieldId],
    );

    const yieldHistoryResult = await client.query(
      `SELECT id::text, season_label AS "seasonLabel", crop, cultivar, yield_value::float8 AS "yieldValue", yield_unit AS "yieldUnit", source, created_at::text AS "createdAt"
       FROM field_yield_history WHERE tenant_id = $1::uuid AND field_id = $2::uuid ORDER BY created_at`,
      [tenantId, fieldId],
    );

    /**
     * Aderência: recomendado (`input_recommendations`) x aplicado (`input_applications`), agregado por
     * análise deste talhão -- mesma lógica de `getInputComparisonForAnalysis` (catalog.ts), mas somando
     * TODAS as análises do talhão de uma vez, pra mostrar a linha do tempo de aderência, não só uma safra.
     * Pedido real do diretor (2026-09-04): mostrar se o produtor seguiu ou não a recomendação ao longo do
     * tempo, como respaldo técnico do agrônomo.
     */
    const adherenceResult = await client.query(
      `WITH latest_recommendations AS (
         SELECT DISTINCT ON (analysis_id, input_type) analysis_id, input_type, quantity, unit
         FROM input_recommendations WHERE tenant_id = $1::uuid AND analysis_id = ANY($2::uuid[])
         ORDER BY analysis_id, input_type, calculated_at DESC
       ),
       applied_totals AS (
         SELECT analysis_id, input_type, unit, SUM(quantity) AS total_quantity
         FROM input_applications WHERE tenant_id = $1::uuid AND analysis_id = ANY($2::uuid[])
         GROUP BY analysis_id, input_type, unit
       )
       SELECT r.analysis_id::text AS "analysisId", r.input_type AS "inputType", r.quantity::float8 AS "recommendedQuantity", r.unit,
              a.total_quantity::float8 AS "appliedQuantity"
       FROM latest_recommendations r
       LEFT JOIN applied_totals a ON a.analysis_id = r.analysis_id AND a.input_type = r.input_type AND a.unit = r.unit
       ORDER BY r.analysis_id, r.input_type`,
      [tenantId, analysesResult.rows.map((row) => row.id)],
    );
    const adherence = adherenceResult.rows.map((row) => {
      let status: "OK" | "UNDER" | "OVER" | "NOT_APPLIED";
      if (row.appliedQuantity == null) status = "NOT_APPLIED";
      else {
        const ratio = row.appliedQuantity / row.recommendedQuantity;
        status = ratio < 0.95 ? "UNDER" : ratio > 1.1 ? "OVER" : "OK";
      }
      return { ...row, status };
    });

    /**
     * Alerta de reanálise: regra já carregada na base de conhecimento (fonte: Trigo Safra 2026,
     * `scripts/seed-trigo-safra-2026.mjs`) -- análise de solo deve ser refeita a cada 3 anos no máximo.
     * Calculado aqui (data real, sem estimativa), não decide nada sozinho -- só sinaliza.
     */
    const lastAnalysisAt = analysesResult.rows.length ? analysesResult.rows[analysesResult.rows.length - 1].createdAt : null;
    const monthsSinceLastAnalysis = lastAnalysisAt ? Math.floor((Date.now() - new Date(lastAnalysisAt).getTime()) / (1000 * 60 * 60 * 24 * 30.44)) : null;
    const reanalysisDue = monthsSinceLastAnalysis != null && monthsSinceLastAnalysis >= 36;

    return {
      field,
      seasons: seasonsResult.rows,
      analyses: analysesResult.rows,
      yieldHistory: yieldHistoryResult.rows,
      adherence,
      reanalysis: { lastAnalysisAt, monthsSinceLastAnalysis, due: reanalysisDue, source: "Trigo Safra 2026 -- análise de solo a cada 3 anos no máximo" },
    };
  });
}

/**
 * Relatório EXECUTIVO (Fase 3, Bloco E): situação da propriedade, áreas que exigem atenção, cobertura
 * da avaliação, decisões e impedimentos, próximos passos. Reaproveita as MESMAS agregações já usadas na
 * Central de Decisão (`getExecutiveDashboard`/`getPortfolioFieldSummaries`, Fase 1) -- nenhum número novo
 * inventado pra este relatório, só a mesma fonte já auditada, reapresentada pro destinatário executivo.
 */
export async function getPropertyExecutiveReportData(tenantId: string, propertyId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const propertyResult = await client.query(
      `SELECT p.id::text, p.name, p.municipality, p.state, c.name AS "clientName"
       FROM properties p JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       WHERE p.tenant_id = $1::uuid AND p.id = $2::uuid`,
      [tenantId, propertyId],
    );
    const property = propertyResult.rows[0];
    if (!property) return null;

    const [summary, fieldSummaries] = await Promise.all([
      getExecutiveDashboard(tenantId, { propertyId }, userId),
      getPortfolioFieldSummaries(tenantId, { propertyId }, userId),
    ]);

    const attentionFields = fieldSummaries.filter((f) => f.evaluationStatus === "SEM_ANALISE" || f.evaluationStatus === "NAO_INTERPRETAVEL");

    return { property, summary, fields: fieldSummaries, attentionFields };
  });
}

/** Fecha o elo mapa -> relatório: publica um relatório real a partir de uma interpretação já aprovada. */
export async function publishFieldAnalysisReport(input: { tenantId: string; userId: string; interpretationId: string }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const interpretationResult = await client.query(
      `SELECT i.id::text, i.analysis_id::text AS "analysisId", i.revision, i.status, i.structured_output AS "structuredOutput"
       FROM interpretations i WHERE i.tenant_id = $1::uuid AND i.id = $2::uuid`,
      [input.tenantId, input.interpretationId],
    );
    const interpretation = interpretationResult.rows[0];
    if (!interpretation) throw new ReportError("Interpretação não encontrada.", 404);
    if (interpretation.status !== "APPROVED") throw new ReportError("Só é possível publicar um relatório de uma interpretação já aprovada por um agrônomo responsável.", 409);

    // Fechamento técnico (item 2 do segundo pedido do diretor): congela TAMBÉM os metadados do documento
    // no momento do publish -- cliente/propriedade/talhão/safra/cultivar/sistema/textura/meta produtiva/
    // laboratório e a marca (branding) da empresa. Sem isso, "Versão publicada" continuava lendo esses
    // campos AO VIVO (ex.: talhão renomeado depois vazaria pro documento supostamente imutável). Mesma
    // consulta/mesmos nomes de coluna de `getFieldAnalysisReportData`, pra "publishedContext" ser um
    // substituto direto do objeto `analysis` na tela.
    const contextResult = await client.query<PublishedReportContext>(
      `SELECT a.id::text, a.code, a.status::text, a.confidence_score::float8 AS "confidenceScore", a.confidence_level AS "confidenceLevel",
              a.created_at::text AS "createdAt", a.updated_at::text AS "updatedAt",
              c.name AS "clientName", p.name AS "propertyName", p.municipality, p.state,
              f.id::text AS "fieldId", f.name AS "fieldName", f.area_ha::float8 AS "areaHa",
              cs.season_label AS "seasonLabel", cs.current_crop AS "currentCrop", cs.cultivar, cs.management_system AS "managementSystem",
              cs.soil_texture AS "soilTexture", cs.yield_goal::float8 AS "yieldGoal", cs.yield_goal_unit AS "yieldGoalUnit",
              l.name AS "laboratoryName"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       LEFT JOIN laboratories l ON l.id = a.laboratory_id
       WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid`,
      [input.tenantId, interpretation.analysisId],
    );
    const publishedContext = contextResult.rows[0];
    if (!publishedContext) throw new ReportError("Contexto da análise não encontrado.", 404);
    const brandingSnapshot = await getTenantBranding(input.tenantId);

    const snapshotPayload: ReportSnapshotV2 = {
      reportSnapshotVersion: REPORT_SNAPSHOT_VERSION,
      interpretationId: interpretation.id,
      revision: interpretation.revision,
      publishedContext,
      structuredOutput: interpretation.structuredOutput,
      brandingSnapshot,
      publishedAt: new Date().toISOString(),
      publishedBy: input.userId,
    };
    const snapshot = JSON.stringify(snapshotPayload);
    const sha256 = createHash("sha256").update(snapshot).digest("hex");
    const stored = await saveReportSnapshot({ tenantId: input.tenantId, interpretationId: interpretation.id, revision: interpretation.revision, content: snapshot });
    const storageKey = stored?.key ?? `reports/${input.tenantId}/${interpretation.id}/rev-${interpretation.revision}`;

    const result = await client.query(
      `INSERT INTO reports (tenant_id, interpretation_id, revision, storage_key, sha256, published_at, published_by)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, now(), $6::uuid)
       RETURNING id::text, revision, storage_key AS "storageKey", published_at::text AS "publishedAt"`,
      [input.tenantId, interpretation.id, interpretation.revision, storageKey, sha256, input.userId],
    );
    const report = result.rows[0];
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "REPORT_PUBLISHED", entityType: "report", entityId: report.id, metadata: { interpretationId: interpretation.id, analysisId: interpretation.analysisId } });
    return report;
  });
}

/** Snapshot legado (versão 1 implícita, gravado antes desta correção -- sem `reportSnapshotVersion` nem
 * `publishedContext`/`brandingSnapshot`). Continua legível (nunca quebra um publish antigo), mas a tela
 * precisa tratar contexto/marca como NÃO capturados nesse caso, nunca usar dado atual como se fosse. */
export type ReportSnapshotV1Legacy = { interpretationId: string; revision: number; structuredOutput: unknown; publishedAt: string; reportSnapshotVersion?: undefined };

export type PublishedReportSnapshotResult =
  | { found: false }
  | {
      found: true;
      report: { id: string; revision: number; publishedAt: string; publishedByName: string | null; sha256: string };
      /** Conteúdo exatamente como gravado no publish -- nunca reconstruído a partir da interpretação
       * atual. `null` quando o arquivo não pôde ser lido OU quando o hash não bateu (ver `readError`/
       * `hashVerified`) -- item 1 do fechamento (fail closed): conteúdo com hash divergente NUNCA é
       * devolvido como `snapshot` utilizável, mesmo tendo sido lido e parseado com sucesso. */
      snapshot: ReportSnapshotV2 | ReportSnapshotV1Legacy | null;
      /** true = hash recalculado do arquivo lido bate com `reports.sha256` (prova de integridade real,
       * não presumida) -- ÚNICO caso em que `snapshot` vem preenchido. false = arquivo lido e parseado,
       * mas o conteúdo diverge do hash gravado -- tratado como violação de integridade, `snapshot` volta
       * `null` de propósito (nunca devolve conteúdo não confiável pro chamador usar por engano).
       * null = não deu pra ler/parsear o arquivo. */
      hashVerified: boolean | null;
      readError: string | null;
    };

/**
 * Fechamento técnico da Fase 3 (item 2 do primeiro pedido do diretor): lê de volta o snapshot IMUTÁVEL
 * gravado no publish (`saveReportSnapshot`/`storage_key`), em vez de reconstruir o conteúdo publicado a
 * partir da interpretação mais recente. Só funciona quando `STORAGE_PROVIDER=local` (única implementação
 * real de `readRawStoredFile` hoje -- outros provedores como S3 não estão implementados em
 * `src/lib/storage.ts`, então aqui isso vira `readError` explícito, nunca um retorno silencioso de dado
 * desatualizado como se fosse o publicado).
 *
 * Fail closed (item 1 do segundo pedido do diretor): esta função é a ÚNICA fonte de verdade sobre
 * integridade -- `snapshot` só volta preenchido quando o hash recalculado bate com `reports.sha256`. Um
 * hash divergente (adulteração, corrupção, truncamento) sempre devolve `snapshot: null` com
 * `hashVerified: false`, nunca o conteúdo lido "mesmo assim" -- quem chama não precisa (e não deve)
 * reimplementar essa checagem.
 */
export async function getPublishedReportSnapshot(tenantId: string, analysisId: string, userId?: string): Promise<PublishedReportSnapshotResult> {
  return withTenant({ tenantId, userId }, async (client) => {
    const publishedResult = await client.query(
      `SELECT r.id::text, r.revision, r.storage_key AS "storageKey", r.sha256, r.published_at::text AS "publishedAt", publisher.name AS "publishedByName"
       FROM reports r
       JOIN interpretations i ON i.tenant_id = r.tenant_id AND i.id = r.interpretation_id
       LEFT JOIN users publisher ON publisher.id = r.published_by
       WHERE r.tenant_id = $1::uuid AND i.analysis_id = $2::uuid
       ORDER BY r.published_at DESC LIMIT 1`,
      [tenantId, analysisId],
    );
    const reportRow = publishedResult.rows[0];
    if (!reportRow) return { found: false };

    const report = { id: reportRow.id, revision: reportRow.revision, publishedAt: reportRow.publishedAt, publishedByName: reportRow.publishedByName, sha256: reportRow.sha256 };
    try {
      const buffer = await readRawStoredFile(reportRow.storageKey);
      const rawContent = buffer.toString("utf8");
      const recomputedHash = createHash("sha256").update(rawContent).digest("hex");
      const hashVerified = recomputedHash === reportRow.sha256;
      // Fail closed: hash divergente NUNCA devolve o conteúdo parseado como `snapshot` utilizável, mesmo
      // que o JSON seja válido -- adulteração/corrupção não pode virar "versão publicada" só porque o
      // arquivo ainda abre. Quem chama recebe `hashVerified: false` e trata como violação de integridade,
      // nunca como um snapshot incompleto/degradado que dá pra usar "mesmo assim".
      if (!hashVerified) return { found: true, report, snapshot: null, hashVerified: false, readError: null };
      const snapshot = JSON.parse(rawContent);
      return { found: true, report, snapshot, hashVerified: true, readError: null };
    } catch (error) {
      // STORAGE_PROVIDER != local (arquivo nunca foi gravado de verdade) ou arquivo removido/indisponível
      // -- nunca finge que a versão atual é a publicada nesse caso, devolve o motivo real pra tela avisar.
      const message = error instanceof Error ? error.message : "Falha desconhecida ao ler o snapshot.";
      return { found: true, report, snapshot: null, hashVerified: null, readError: message };
    }
  });
}

export async function listPublishedReports(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT r.id::text, r.revision, r.published_at::text AS "publishedAt", r.sha256,
              a.id::text AS "analysisId", a.code AS "analysisCode",
              c.name AS "clientName", p.name AS "propertyName", f.name AS "fieldName", cs.season_label AS "seasonLabel",
              publisher.name AS "publishedByName"
       FROM reports r
       JOIN interpretations i ON i.tenant_id = r.tenant_id AND i.id = r.interpretation_id
       JOIN analyses a ON a.tenant_id = i.tenant_id AND a.id = i.analysis_id
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       LEFT JOIN users publisher ON publisher.id = r.published_by
       WHERE r.tenant_id = $1::uuid
       ORDER BY r.published_at DESC`,
      [tenantId],
    );
    return result.rows;
  });
}
