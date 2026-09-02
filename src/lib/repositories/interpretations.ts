import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { runAgronomicEngine, type CropProfileDef, type LabResultInput } from "@/domain/agronomic-engine";

export class InterpretationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "InterpretationError";
  }
}

/**
 * Roda o motor determinístico para uma análise usando somente dados
 * persistidos (crop_profile homologado da safra + lab_results reais, com a
 * profundidade real do ponto de coleta quando existir) e grava o resultado
 * como uma nova revisão em `interpretations`. Nunca chama IA -- isso ainda
 * não está conectado nesta fase.
 */
export async function runInterpretationForAnalysis(input: { tenantId: string; userId: string; analysisId: string }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const analysisResult = await client.query<{ cropSeasonId: string; cropProfileId: string | null }>(
      `SELECT a.crop_season_id::text AS "cropSeasonId", cs.crop_profile_id::text AS "cropProfileId"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid`,
      [input.tenantId, input.analysisId],
    );
    const analysis = analysisResult.rows[0];
    if (!analysis) throw new InterpretationError("Análise não encontrada.", 404);

    let cropProfile: CropProfileDef | null = null;
    if (analysis.cropProfileId) {
      const profileResult = await client.query(
        `SELECT id::text, code, name, status, semantic_version AS "semanticVersion", content_hash AS "contentHash"
         FROM crop_profiles WHERE id = $1::uuid`,
        [analysis.cropProfileId],
      );
      const profileRow = profileResult.rows[0];
      if (profileRow) {
        const paramsResult = await client.query(
          `SELECT id::text, parameter_code AS "parameterCode", parameter_category AS "parameterCategory",
                  depth_from_cm::float8 AS "depthFromCm", depth_to_cm::float8 AS "depthToCm",
                  analytical_method_allowed AS "analyticalMethodAllowed", unit_expected AS "unitExpected",
                  sufficiency_ranges AS "sufficiencyRanges", criticality, status
           FROM crop_profile_parameters WHERE crop_profile_id = $1::uuid`,
          [analysis.cropProfileId],
        );
        cropProfile = { ...profileRow, parameters: paramsResult.rows };
      }
    }

    const resultsResult = await client.query<LabResultInput>(
      `SELECT ls.laboratory_code AS "sampleCode", lr.parameter_code AS "parameterCode", lr.numeric_value::float8 AS "value",
              lr.unit, lr.analytical_method AS "method", sp.depth_from_cm::float8 AS "depthFromCm", sp.depth_to_cm::float8 AS "depthToCm"
       FROM lab_samples ls
       JOIN lab_results lr ON lr.lab_sample_id = ls.id
       LEFT JOIN sample_points sp ON sp.tenant_id = ls.tenant_id AND sp.id = ls.sample_point_id
       WHERE ls.tenant_id = $1::uuid AND ls.analysis_id = $2::uuid
       ORDER BY ls.laboratory_code, lr.parameter_code`,
      [input.tenantId, input.analysisId],
    );
    const labResults = resultsResult.rows.map((row) => ({ ...row, depthFromCm: row.depthFromCm ?? null, depthToCm: row.depthToCm ?? null }));
    if (labResults.length === 0) {
      throw new InterpretationError("Não há resultados de laboratório persistidos para esta análise. Importe e confira o laudo antes de interpretar.", 409);
    }

    const engineResult = runAgronomicEngine({ cropProfile, labResults });

    const revisionResult = await client.query<{ nextRevision: number }>(
      `SELECT coalesce(max(revision), 0) + 1 AS "nextRevision" FROM interpretations WHERE tenant_id = $1::uuid AND analysis_id = $2::uuid`,
      [input.tenantId, input.analysisId],
    );
    const revision = revisionResult.rows[0].nextRevision;
    const status = engineResult.interpretable ? "IN_REVIEW" : "CALCULATED";
    const notInterpretableReason = engineResult.interpretable ? null : (engineResult.pendencies[0] ?? "Sem contexto suficiente para interpretar.");

    const insertResult = await client.query<{ id: string; revision: number; status: string; createdAt: string }>(
      `INSERT INTO interpretations
       (tenant_id, analysis_id, crop_profile_id, revision, structured_output, assumptions, warnings, status, not_interpretable_reason)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb, '[]'::jsonb, $6::jsonb, $7, $8)
       RETURNING id::text, revision, status, created_at::text AS "createdAt"`,
      [
        input.tenantId,
        input.analysisId,
        cropProfile?.id ?? null,
        revision,
        JSON.stringify({ facts: engineResult.facts, interpretation: engineResult.interpretation, confidence: engineResult.confidence, trace: engineResult.trace }),
        JSON.stringify(engineResult.pendencies),
        status,
        notInterpretableReason,
      ],
    );
    const created = insertResult.rows[0];

    await client.query(
      `UPDATE analyses SET status = $3::analysis_status, updated_at = now() WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [input.tenantId, input.analysisId, engineResult.interpretable ? "AWAITING_REVIEW" : "READY_TO_INTERPRET"],
    );

    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "INTERPRETATION_CALCULATED",
      entityType: "interpretation",
      entityId: created.id,
      metadata: { analysisId: input.analysisId, revision, status, interpretable: engineResult.interpretable, pendencyCount: engineResult.pendencies.length },
    });

    return { interpretation: created, engineResult };
  });
}

export async function getLatestInterpretation(tenantId: string, analysisId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT i.id::text, i.revision, i.structured_output AS "structuredOutput", i.assumptions, i.warnings, i.status,
              i.crop_profile_id::text AS "cropProfileId", i.not_interpretable_reason AS "notInterpretableReason",
              i.reviewed_by::text AS "reviewedBy", i.reviewed_at::text AS "reviewedAt",
              i.approved_by::text AS "approvedBy", i.approved_at::text AS "approvedAt", i.created_at::text AS "createdAt"
       FROM interpretations i WHERE i.tenant_id = $1::uuid AND i.analysis_id = $2::uuid
       ORDER BY i.revision DESC LIMIT 1`,
      [tenantId, analysisId],
    );
    return result.rows[0] ?? null;
  });
}

export async function listInterpretationHistory(tenantId: string, analysisId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT id::text, revision, status, not_interpretable_reason AS "notInterpretableReason",
              created_at::text AS "createdAt", reviewed_at::text AS "reviewedAt", approved_at::text AS "approvedAt"
       FROM interpretations WHERE tenant_id = $1::uuid AND analysis_id = $2::uuid ORDER BY revision DESC`,
      [tenantId, analysisId],
    );
    return result.rows;
  });
}

export async function reviewInterpretation(input: { tenantId: string; userId: string; interpretationId: string; approve: boolean }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query<{ id: string; status: string; analysisId: string }>(
      input.approve
        ? `UPDATE interpretations SET status = 'APPROVED', reviewed_by = $3::uuid, reviewed_at = now(), approved_by = $3::uuid, approved_at = now()
           WHERE tenant_id = $1::uuid AND id = $2::uuid RETURNING id::text, status, analysis_id::text AS "analysisId"`
        : `UPDATE interpretations SET status = 'IN_REVIEW', reviewed_by = $3::uuid, reviewed_at = now()
           WHERE tenant_id = $1::uuid AND id = $2::uuid RETURNING id::text, status, analysis_id::text AS "analysisId"`,
      [input.tenantId, input.interpretationId, input.userId],
    );
    const updated = result.rows[0];
    if (!updated) throw new InterpretationError("Interpretação não encontrada.", 404);
    if (input.approve) {
      await client.query(`UPDATE analyses SET status = 'APPROVED', updated_at = now() WHERE tenant_id = $1::uuid AND id = $2::uuid`, [input.tenantId, updated.analysisId]);
    }
    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: input.approve ? "INTERPRETATION_APPROVED" : "INTERPRETATION_REVIEWED",
      entityType: "interpretation",
      entityId: updated.id,
      metadata: { analysisId: updated.analysisId },
    });
    return updated;
  });
}
