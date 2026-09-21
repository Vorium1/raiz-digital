import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { AnalysisDepthId } from "@/domain/analysis-depths";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { irrigationApplicationsFromContext, parseIrrigationApplications } from "@/domain/irrigation-applications";
import { parseWheatBuyerQualityContext } from "@/domain/wheat-buyer-quality-context";

function analysisCode() {
  const year = new Date().getFullYear();
  return `AN-${year}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export class AnalysisContextError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "AnalysisContextError";
  }
}

function planningContextFromAnalysisContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      plannedManagementNotes: "",
      fertilityPlanningHorizonYears: null as 2 | 3 | 4 | 5 | null,
      fertilityCyclePlanNotes: "",
      irrigationApplications: [],
      wheatBuyerQualityContext: null as unknown,
    };
  }
  const draft = (value as { draft?: unknown }).draft;
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    return {
      plannedManagementNotes: "",
      fertilityPlanningHorizonYears: null as 2 | 3 | 4 | 5 | null,
      fertilityCyclePlanNotes: "",
      irrigationApplications: [],
      wheatBuyerQualityContext: null as unknown,
    };
  }

  const source = draft as {
    plannedManagementNotes?: unknown;
    fertilityPlanningHorizonYears?: unknown;
    fertilityCyclePlanNotes?: unknown;
    wheatBuyerQualityContext?: unknown;
  };
  const horizon = Number(source.fertilityPlanningHorizonYears);
  return {
    plannedManagementNotes: typeof source.plannedManagementNotes === "string" ? source.plannedManagementNotes : "",
    fertilityPlanningHorizonYears: [2, 3, 4, 5].includes(horizon) ? horizon as 2 | 3 | 4 | 5 : null,
    fertilityCyclePlanNotes: typeof source.fertilityCyclePlanNotes === "string" ? source.fertilityCyclePlanNotes : "",
    irrigationApplications: irrigationApplicationsFromContext(value) ?? [],
    wheatBuyerQualityContext: source.wheatBuyerQualityContext ?? null,
  };
}

/** `clientId` opcional -- omitido, mantém o comportamento antigo (carteira inteira), usado por /analises,
 * /relatorios e /api/analyses. O dashboard passa o cliente filtrado na tela pra corrigir o mesmo bug real
 * do item A (seção "Fluxo de análises" ignorava o filtro de cliente selecionado). */
export async function listAnalyses(tenantId: string, userId?: string, clientId?: string | null) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT a.id::text, a.code, a.status::text, a.confidence_score::float8 AS "confidenceScore",
              a.requested_analysis_depth AS "requestedAnalysisDepth",
              a.created_at::text AS "createdAt", a.updated_at::text AS "updatedAt",
              c.name AS "clientName", p.name AS "propertyName", f.name AS "fieldName", f.area_ha::float8 AS "areaHa",
              cs.season_label AS "seasonLabel", cs.current_crop AS "currentCrop", cs.next_crop AS "nextCrop",
              li.status AS "latestInterpretationStatus", li.not_interpretable_reason AS "notInterpretableReason"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       LEFT JOIN LATERAL (
         SELECT status, not_interpretable_reason FROM interpretations
         WHERE interpretations.tenant_id = a.tenant_id AND interpretations.analysis_id = a.id
         ORDER BY revision DESC LIMIT 1
       ) li ON true
       WHERE ($1::uuid IS NULL OR c.id = $1::uuid)
       ORDER BY a.updated_at DESC
       LIMIT 200`,
      [clientId ?? null],
    );
    return result.rows;
  });
}

export async function createAnalysis(input: {
  tenantId: string;
  userId: string;
  cropSeasonId: string;
  collectionOrderId?: string | null;
  laboratoryId?: string | null;
  sourceType?: "INTEGRATION" | "CSV" | "XLSX" | "PDF_OCR" | "MANUAL" | null;
  analysisDepth?: AnalysisDepthId | null;
  analysisContext?: Record<string, unknown> | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const code = analysisCode();
    const result = await client.query(
      `INSERT INTO analyses
       (tenant_id, crop_season_id, collection_order_id, laboratory_id, code, source_type, created_by,
        requested_analysis_depth, analysis_context)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::uuid, $8, $9::jsonb)
       RETURNING id::text, code, status::text, requested_analysis_depth AS "requestedAnalysisDepth", created_at::text AS "createdAt"`,
      [
        input.tenantId,
        input.cropSeasonId,
        input.collectionOrderId ?? null,
        input.laboratoryId ?? null,
        code,
        input.sourceType ?? null,
        input.userId,
        input.analysisDepth ?? null,
        JSON.stringify(input.analysisContext ?? {}),
      ],
    );
    const created = result.rows[0];
    let wheatBuyerProtocolIdForAudit: string | null = null;
    try {
      wheatBuyerProtocolIdForAudit = parseWheatBuyerQualityContext(next.wheatBuyerQualityContext).protocolId || null;
    } catch {
      // Contexto legado inválido é preservado, mas nunca quebra outra edição opcional.
    }

    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "ANALYSIS_CREATED",
      entityType: "analysis",
      entityId: created.id,
      metadata: { code, analysisDepth: input.analysisDepth ?? null },
    });
    return created;
  });
}

export async function getAnalysisById(tenantId: string, analysisId: string, userId?: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(analysisId)) return null;
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT a.id::text, a.code, a.status::text, a.source_type AS "sourceType",
              a.confidence_score::float8 AS "confidenceScore", a.confidence_level AS "confidenceLevel",
              a.requested_analysis_depth AS "requestedAnalysisDepth", a.analysis_context AS "analysisContext",
              a.created_at::text AS "createdAt", a.updated_at::text AS "updatedAt",
              c.id::text AS "clientId", c.name AS "clientName",
              p.id::text AS "propertyId", p.name AS "propertyName", p.municipality, p.state,
              f.id::text AS "fieldId", f.name AS "fieldName", f.area_ha::float8 AS "areaHa",
              cs.id::text AS "seasonId", cs.season_label AS "seasonLabel", cs.current_crop AS "currentCrop", cs.next_crop AS "nextCrop",
              cs.yield_goal::float8 AS "yieldGoal", cs.yield_goal_unit AS "yieldGoalUnit",
              co.id::text AS "collectionOrderId", co.code AS "collectionCode", l.name AS "laboratoryName",
              (SELECT count(*)::int FROM analysis_imports ai WHERE ai.tenant_id = a.tenant_id AND ai.analysis_id = a.id) AS "importCount",
              (SELECT count(*)::int FROM lab_samples ls WHERE ls.tenant_id = a.tenant_id AND ls.analysis_id = a.id) AS "labSampleCount",
              (SELECT count(*)::int FROM interpretations i WHERE i.tenant_id = a.tenant_id AND i.analysis_id = a.id) AS "interpretationCount",
              li.status AS "latestInterpretationStatus", li.not_interpretable_reason AS "notInterpretableReason"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       LEFT JOIN collection_orders co ON co.tenant_id = a.tenant_id AND co.id = a.collection_order_id
       LEFT JOIN laboratories l ON l.id = a.laboratory_id
       LEFT JOIN LATERAL (
         SELECT status, not_interpretable_reason FROM interpretations
         WHERE interpretations.tenant_id = a.tenant_id AND interpretations.analysis_id = a.id
         ORDER BY revision DESC LIMIT 1
       ) li ON true
       WHERE a.id = $1::uuid
       LIMIT 1`,
      [analysisId],
    );
    return result.rows[0] ?? null;
  });
}


export async function getAnalysisPlanningContext(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `SELECT id::text, analysis_context AS "analysisContext"
       FROM analyses
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       LIMIT 1`,
      [input.tenantId, input.analysisId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      analysisId: row.id as string,
      ...planningContextFromAnalysisContext(row.analysisContext),
    };
  });
}

export async function updateAnalysisPlanningContext(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
  plannedManagementNotes?: string;
  fertilityPlanningHorizonYears?: 2 | 3 | 4 | 5 | null;
  fertilityCyclePlanNotes?: string;
  irrigationApplications?: unknown;
  expectedIrrigationApplications?: unknown;
  wheatBuyerQualityContext?: unknown;
  expectedWheatBuyerQualityContext?: unknown;
}) {
  let nextBuyerQualityContext: ReturnType<typeof parseWheatBuyerQualityContext> | undefined;
  if (input.wheatBuyerQualityContext !== undefined) {
    try { nextBuyerQualityContext = parseWheatBuyerQualityContext(input.wheatBuyerQualityContext); }
    catch (error) { throw new AnalysisContextError(error instanceof Error ? error.message : "Contexto de comprador inválido.", 400); }
    if (input.expectedWheatBuyerQualityContext === undefined) {
      throw new AnalysisContextError("Recarregue o contexto antes de editar o protocolo de comprador.", 409);
    }
  }

  let nextApplications: ReturnType<typeof parseIrrigationApplications> | undefined;
  if (input.irrigationApplications !== undefined) {
    try { nextApplications = parseIrrigationApplications(input.irrigationApplications); }
    catch (error) { throw new AnalysisContextError(error instanceof Error ? error.message : "Irrigação inválida.", 400); }
    if (input.expectedIrrigationApplications === undefined) {
      throw new AnalysisContextError("Recarregue o contexto antes de editar as aplicações de irrigação.", 409);
    }
  }
  if (
    input.fertilityPlanningHorizonYears !== undefined
    && input.fertilityPlanningHorizonYears !== null
    && ![2, 3, 4, 5].includes(input.fertilityPlanningHorizonYears)
  ) {
    throw new AnalysisContextError("Horizonte de planejamento deve ser 2, 3, 4 ou 5 anos.", 400);
  }

  const nextPlannedManagement = input.plannedManagementNotes?.trim();
  const nextCycleNotes = input.fertilityCyclePlanNotes?.trim();
  if (nextPlannedManagement != null && nextPlannedManagement.length > 5000) {
    throw new AnalysisContextError("O manejo planejado deve ter no máximo 5.000 caracteres.", 400);
  }
  if (nextCycleNotes != null && nextCycleNotes.length > 5000) {
    throw new AnalysisContextError("O planejamento do ciclo deve ter no máximo 5.000 caracteres.", 400);
  }

  if (
    input.plannedManagementNotes === undefined
    && input.fertilityPlanningHorizonYears === undefined
    && input.fertilityCyclePlanNotes === undefined
    && input.irrigationApplications === undefined
    && input.wheatBuyerQualityContext === undefined
  ) {
    throw new AnalysisContextError("Nenhum campo de planejamento foi informado.", 400);
  }

  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `SELECT id::text, crop_season_id::text AS "cropSeasonId", analysis_context AS "analysisContext"
       FROM analyses
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       FOR UPDATE`,
      [input.tenantId, input.analysisId],
    );
    const row = result.rows[0];
    if (!row) throw new AnalysisContextError("Análise não encontrada.", 404);

    const current = planningContextFromAnalysisContext(row.analysisContext);
    if (nextApplications !== undefined && !isDeepStrictEqual(input.expectedIrrigationApplications, current.irrigationApplications)) {
      throw new AnalysisContextError("As aplicações de irrigação foram alteradas em outra sessão. Recarregue antes de salvar.", 409);
    }
    if (
      nextBuyerQualityContext !== undefined
      && !isDeepStrictEqual(input.expectedWheatBuyerQualityContext, current.wheatBuyerQualityContext)
    ) {
      throw new AnalysisContextError("O protocolo de comprador do trigo foi alterado em outra sessão. Recarregue antes de salvar.", 409);
    }
    const next = {
      irrigationApplications: nextApplications ?? current.irrigationApplications,
      wheatBuyerQualityContext: nextBuyerQualityContext ?? current.wheatBuyerQualityContext,
      plannedManagementNotes: input.plannedManagementNotes === undefined
        ? current.plannedManagementNotes
        : (nextPlannedManagement ?? ""),
      fertilityPlanningHorizonYears: input.fertilityPlanningHorizonYears === undefined
        ? current.fertilityPlanningHorizonYears
        : input.fertilityPlanningHorizonYears,
      fertilityCyclePlanNotes: input.fertilityCyclePlanNotes === undefined
        ? current.fertilityCyclePlanNotes
        : (nextCycleNotes ?? ""),
    };

    const changedFields: string[] = [];
    if (!isDeepStrictEqual(next.irrigationApplications, current.irrigationApplications)) changedFields.push("irrigationApplications");
    if (!isDeepStrictEqual(next.wheatBuyerQualityContext, current.wheatBuyerQualityContext)) changedFields.push("wheatBuyerQualityContext");
    if (next.plannedManagementNotes !== current.plannedManagementNotes.trim()) changedFields.push("plannedManagementNotes");
    if (next.fertilityPlanningHorizonYears !== current.fertilityPlanningHorizonYears) changedFields.push("fertilityPlanningHorizonYears");
    if (next.fertilityCyclePlanNotes !== current.fertilityCyclePlanNotes.trim()) changedFields.push("fertilityCyclePlanNotes");

    if (changedFields.length === 0) {
      return { analysisId: row.id as string, ...current, changed: false };
    }

    const root = row.analysisContext && typeof row.analysisContext === "object" && !Array.isArray(row.analysisContext)
      ? { ...row.analysisContext }
      : {};
    const currentDraft = (root as { draft?: unknown }).draft;
    const draft = currentDraft && typeof currentDraft === "object" && !Array.isArray(currentDraft)
      ? { ...currentDraft }
      : {};

    (draft as Record<string, unknown>).plannedManagementNotes = next.plannedManagementNotes;
    (draft as Record<string, unknown>).fertilityPlanningHorizonYears = next.fertilityPlanningHorizonYears;
    (draft as Record<string, unknown>).fertilityCyclePlanNotes = next.fertilityCyclePlanNotes;
    if (nextApplications !== undefined) (draft as Record<string, unknown>).irrigationApplications = nextApplications;
    if (nextBuyerQualityContext !== undefined) (draft as Record<string, unknown>).wheatBuyerQualityContext = nextBuyerQualityContext;
    (root as Record<string, unknown>).draft = draft;

    await client.query(
      `UPDATE analyses
       SET analysis_context = $3::jsonb, updated_at = now()
       WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [input.tenantId, input.analysisId, JSON.stringify(root)],
    );

    // O plano de fertilidade faz parte do contexto da prescrição, embora não seja
    // requisito para emitir o parecer. Alterá-lo invalida somente a recomendação
    // corrente e preserva o histórico já congelado.
    await client.query(
      `UPDATE crop_seasons
       SET updated_at = now()
       WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [input.tenantId, row.cropSeasonId],
    );

    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "ANALYSIS_FERTILITY_PLANNING_CONTEXT_UPDATED",
      entityType: "analysis",
      entityId: row.id,
      metadata: {
        changedFields,
        irrigationApplicationCount: Array.isArray(next.irrigationApplications) ? next.irrigationApplications.length : null,
        wheatBuyerQualityProtocolId: wheatBuyerProtocolIdForAudit,
        fertilityPlanningHorizonYears: next.fertilityPlanningHorizonYears,
        hasCyclePlan: next.fertilityCyclePlanNotes.length > 0,
        hasPlannedManagement: next.plannedManagementNotes.length > 0,
      },
    });

    return {
      analysisId: row.id as string,
      ...next,
      changed: true,
    };
  });
}
