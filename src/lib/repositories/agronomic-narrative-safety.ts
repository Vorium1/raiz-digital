import { evaluateAnalysisEvidenceFreshness, type AnalysisEvidenceFreshness } from "@/domain/analysis-evidence-freshness";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { AiGenerationError } from "@/lib/repositories/ai-generations";

export type AgronomicNarrativeFreshness = AnalysisEvidenceFreshness & {
  generationInterpretationId: string | null;
  latestInterpretationId: string | null;
};

export async function getAgronomicNarrativeFreshness(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
  generationId: string | null | undefined;
}): Promise<AgronomicNarrativeFreshness | null> {
  if (!input.generationId) return null;
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query<{
      generationInterpretationId: string | null;
      latestInterpretationId: string | null;
      latestInterpretationCreatedAt: string | null;
      latestInterpretationCropProfileId: string | null;
      currentCropProfileId: string | null;
      latestImportCommittedAt: string | null;
      latestRuleUpdatedAt: string | null;
    }>(
      `SELECT g.interpretation_id::text AS "generationInterpretationId",
              li.id::text AS "latestInterpretationId",
              li.created_at::text AS "latestInterpretationCreatedAt",
              li.crop_profile_id::text AS "latestInterpretationCropProfileId",
              cs.crop_profile_id::text AS "currentCropProfileId",
              latest_import.latest_import_at::text AS "latestImportCommittedAt",
              rule_state.latest_rule_updated_at::text AS "latestRuleUpdatedAt"
       FROM ai_generations g
       JOIN analyses a ON a.tenant_id=g.tenant_id AND a.id=g.analysis_id
       JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
       LEFT JOIN crop_profiles cp ON cp.id=cs.crop_profile_id
       LEFT JOIN LATERAL (
         SELECT i.id, i.created_at, i.crop_profile_id
         FROM interpretations i
         WHERE i.tenant_id=a.tenant_id AND i.analysis_id=a.id
         ORDER BY i.revision DESC
         LIMIT 1
       ) li ON true
       LEFT JOIN LATERAL (
         SELECT max(coalesce(ai.committed_at, ai.created_at)) AS latest_import_at
         FROM analysis_imports ai
         WHERE ai.tenant_id=a.tenant_id AND ai.analysis_id=a.id
       ) latest_import ON true
       LEFT JOIN LATERAL (
         SELECT greatest(cp.updated_at, coalesce(max(cpp.updated_at), cp.updated_at)) AS latest_rule_updated_at
         FROM crop_profile_parameters cpp
         WHERE cpp.crop_profile_id=cp.id
       ) rule_state ON cp.id IS NOT NULL
       WHERE g.tenant_id=$1::uuid AND g.analysis_id=$2::uuid AND g.id=$3::uuid AND g.kind='AGRONOMIC_NARRATIVE'
       LIMIT 1`,
      [input.tenantId, input.analysisId, input.generationId],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (!row.generationInterpretationId || row.generationInterpretationId !== row.latestInterpretationId) {
      return {
        current: false,
        code: "LAB_EVIDENCE_CHANGED",
        reason: "A síntese foi gerada para uma interpretação anterior. Gere uma nova versão a partir da revisão corrente.",
        generationInterpretationId: row.generationInterpretationId,
        latestInterpretationId: row.latestInterpretationId,
      };
    }
    const freshness = evaluateAnalysisEvidenceFreshness({
      interpretationCreatedAt: row.latestInterpretationCreatedAt,
      latestImportCommittedAt: row.latestImportCommittedAt,
      interpretationCropProfileId: row.latestInterpretationCropProfileId,
      currentCropProfileId: row.currentCropProfileId,
      latestRuleUpdatedAt: row.latestRuleUpdatedAt,
    });
    return { ...freshness, generationInterpretationId: row.generationInterpretationId, latestInterpretationId: row.latestInterpretationId };
  });
}

async function lockCurrentNarrativeEvidence(
  client: import("pg").PoolClient,
  input: { tenantId: string; analysisId: string; interpretationId: string },
) {
  const result = await client.query<{
    latestInterpretationId: string | null;
    latestInterpretationCreatedAt: string | null;
    latestInterpretationCropProfileId: string | null;
    currentCropProfileId: string | null;
    latestImportCommittedAt: string | null;
    latestRuleUpdatedAt: string | null;
  }>(
    `SELECT li.id::text AS "latestInterpretationId",
            li.created_at::text AS "latestInterpretationCreatedAt",
            li.crop_profile_id::text AS "latestInterpretationCropProfileId",
            cs.crop_profile_id::text AS "currentCropProfileId",
            latest_import.latest_import_at::text AS "latestImportCommittedAt",
            rule_state.latest_rule_updated_at::text AS "latestRuleUpdatedAt"
     FROM analyses a
     JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
     LEFT JOIN crop_profiles cp ON cp.id=cs.crop_profile_id
     LEFT JOIN LATERAL (
       SELECT i.id, i.created_at, i.crop_profile_id
       FROM interpretations i
       WHERE i.tenant_id=a.tenant_id AND i.analysis_id=a.id
       ORDER BY i.revision DESC
       LIMIT 1
     ) li ON true
     LEFT JOIN LATERAL (
       SELECT max(coalesce(ai.committed_at, ai.created_at)) AS latest_import_at
       FROM analysis_imports ai
       WHERE ai.tenant_id=a.tenant_id AND ai.analysis_id=a.id
     ) latest_import ON true
     LEFT JOIN LATERAL (
       SELECT greatest(cp.updated_at, coalesce(max(cpp.updated_at), cp.updated_at)) AS latest_rule_updated_at
       FROM crop_profile_parameters cpp
       WHERE cpp.crop_profile_id=cp.id
     ) rule_state ON cp.id IS NOT NULL
     WHERE a.tenant_id=$1::uuid AND a.id=$2::uuid
     LIMIT 1
     FOR SHARE OF a`,
    [input.tenantId, input.analysisId],
  );
  const state = result.rows[0];
  if (!state) throw new AiGenerationError("Análise não encontrada.", 404);
  if (state.latestInterpretationId !== input.interpretationId) {
    throw new AiGenerationError("A interpretação mudou. A síntese antiga não pode ser tratada como corrente.", 409);
  }
  const freshness = evaluateAnalysisEvidenceFreshness({
    interpretationCreatedAt: state.latestInterpretationCreatedAt,
    latestImportCommittedAt: state.latestImportCommittedAt,
    interpretationCropProfileId: state.latestInterpretationCropProfileId,
    currentCropProfileId: state.currentCropProfileId,
    latestRuleUpdatedAt: state.latestRuleUpdatedAt,
  });
  if (!freshness.current) throw new AiGenerationError(freshness.reason ?? "O laudo mudou. Recalcule a interpretação antes de continuar.", 409);
  return freshness;
}

export async function recordAgronomicNarrativeGenerationSafely(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
  interpretationId: string;
  provider: string;
  model: string;
  promptVersion: string;
  requestPayload: unknown;
  responsePayload: unknown;
  tokensUsed?: number | null;
  costUsd?: number | null;
  supersedes?: string | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    await lockCurrentNarrativeEvidence(client, input);
    const result = await client.query(
      `INSERT INTO ai_generations
       (tenant_id, kind, interpretation_id, analysis_id, provider, model, prompt_version, request_payload, response_payload, tokens_used, cost_usd, created_by)
       VALUES ($1::uuid, 'AGRONOMIC_NARRATIVE', $2::uuid, $3::uuid, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11::uuid)
       RETURNING id::text, status, created_at::text AS "createdAt"`,
      [
        input.tenantId, input.interpretationId, input.analysisId, input.provider, input.model, input.promptVersion,
        JSON.stringify(input.requestPayload), JSON.stringify(input.responsePayload), input.tokensUsed ?? null, input.costUsd ?? null, input.userId,
      ],
    );
    const created = result.rows[0];
    if (input.supersedes) {
      await client.query(
        `UPDATE ai_generations SET superseded_by=$3::uuid
         WHERE tenant_id=$1::uuid AND id=$2::uuid AND kind='AGRONOMIC_NARRATIVE'`,
        [input.tenantId, input.supersedes, created.id],
      );
    }
    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "AI_AGRONOMIC_NARRATIVE_GENERATED",
      entityType: "ai_generation",
      entityId: created.id,
      metadata: { analysisId: input.analysisId, interpretationId: input.interpretationId, provider: input.provider, model: input.model, promptVersion: input.promptVersion, tokensUsed: input.tokensUsed ?? null },
    });
    return created;
  });
}

export async function reviewAgronomicNarrativeSafely(input: {
  tenantId: string;
  userId: string;
  generationId: string;
  decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
  note?: string | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const generationResult = await client.query<{
      id: string;
      analysisId: string;
      interpretationId: string | null;
      status: string;
    }>(
      `SELECT id::text, analysis_id::text AS "analysisId", interpretation_id::text AS "interpretationId", status::text
       FROM ai_generations
       WHERE tenant_id=$1::uuid AND id=$2::uuid AND kind='AGRONOMIC_NARRATIVE'
       FOR UPDATE`,
      [input.tenantId, input.generationId],
    );
    const generation = generationResult.rows[0];
    if (!generation) throw new AiGenerationError("Geração não encontrada.", 404);
    if (!generation.interpretationId) throw new AiGenerationError("A síntese não possui interpretação rastreável e não pode ser revisada como corrente.", 409);
    await lockCurrentNarrativeEvidence(client, {
      tenantId: input.tenantId,
      analysisId: generation.analysisId,
      interpretationId: generation.interpretationId,
    });

    const updatedResult = await client.query<{ id: string; status: string; analysisId: string }>(
      `UPDATE ai_generations
       SET status=$3::ai_review_status, reviewer_note=nullif($4,''), reviewed_by=$5::uuid, reviewed_at=now()
       WHERE tenant_id=$1::uuid AND id=$2::uuid AND kind='AGRONOMIC_NARRATIVE'
       RETURNING id::text, status, analysis_id::text AS "analysisId"`,
      [input.tenantId, input.generationId, input.decision, input.note ?? "", input.userId],
    );
    const updated = updatedResult.rows[0];
    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "AI_AGRONOMIC_NARRATIVE_REVIEWED",
      entityType: "ai_generation",
      entityId: updated.id,
      metadata: { decision: input.decision, interpretationId: generation.interpretationId },
    });
    return updated;
  });
}
