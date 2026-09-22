import { evaluateAnalysisEvidenceFreshness } from "@/domain/analysis-evidence-freshness";
import { checkPrescriptionDraftGate, PRESCRIPTION_DRAFT_STATUS } from "@/domain/agronomic-prescription-gate";
import { evaluateAnalysisContextFingerprintFreshness, evaluateNitrogenExecutionSnapshotFreshness } from "@/domain/prescription-context-freshness";
import { PRESCRIPTION_NITROGEN_RULE_IDS } from "@/domain/nitrogen-prescription-evidence";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { AiGenerationError } from "@/lib/repositories/ai-generations";

/**
 * Persiste uma prescrição somente se o snapshot validado antes/depois do provedor ainda for o snapshot
 * corrente dentro da própria transação de INSERT. O lock SHARE na análise/safra conflita com importação
 * (FOR UPDATE) e com UPDATE do contexto da safra, fechando a janela entre o último check HTTP e o save.
 *
 * UX 2.0 permite salvar o RASCUNHO quando a mesma interpretação continua IN_REVIEW ou APPROVED. O registro
 * nasce explicitamente PENDING_REVIEW. Promoção de doses e publicação continuam protegidas pelos gates
 * estritos de revisão/publicação e exigem interpretação APPROVED.
 */
export async function recordAgronomicPrescriptionGenerationSafely(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
  interpretationId: string;
  expectedSeasonUpdatedAt: string;
  expectedAnalysisContextFingerprint: string;
  expectedNitrogenExecutionId?: string | null;
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
    const stateResult = await client.query<{
      seasonUpdatedAt: string;
      analysisContextFingerprint: string;
      latestInterpretationId: string | null;
      latestInterpretationStatus: string | null;
      latestInterpretationCreatedAt: string | null;
      latestInterpretationCropProfileId: string | null;
      currentCropProfileId: string | null;
      latestImportCommittedAt: string | null;
      latestRuleUpdatedAt: string | null;
      latestNitrogenExecutionId: string | null;
    }>(
      `SELECT cs.updated_at::text AS "seasonUpdatedAt",
              md5(coalesce(a.analysis_context, '{}'::jsonb)::text) AS "analysisContextFingerprint",
              li.id::text AS "latestInterpretationId",
              li.status::text AS "latestInterpretationStatus",
              li.created_at::text AS "latestInterpretationCreatedAt",
              li.crop_profile_id::text AS "latestInterpretationCropProfileId",
              cs.crop_profile_id::text AS "currentCropProfileId",
              latest_import.latest_import_at::text AS "latestImportCommittedAt",
              rule_state.latest_rule_updated_at::text AS "latestRuleUpdatedAt",
              latest_n.id::text AS "latestNitrogenExecutionId"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       LEFT JOIN crop_profiles cp ON cp.id = cs.crop_profile_id
       LEFT JOIN LATERAL (
         SELECT i.id, i.status, i.created_at, i.crop_profile_id
         FROM interpretations i
         WHERE i.tenant_id = a.tenant_id AND i.analysis_id = a.id
         ORDER BY i.revision DESC
         LIMIT 1
       ) li ON true
       LEFT JOIN LATERAL (
         SELECT max(coalesce(ai.committed_at, ai.created_at)) AS latest_import_at
         FROM analysis_imports ai
         WHERE ai.tenant_id = a.tenant_id AND ai.analysis_id = a.id
       ) latest_import ON true
       LEFT JOIN LATERAL (
         SELECT greatest(cp.updated_at, coalesce(max(cpp.updated_at), cp.updated_at)) AS latest_rule_updated_at
         FROM crop_profile_parameters cpp
         WHERE cpp.crop_profile_id = cp.id
       ) rule_state ON cp.id IS NOT NULL
       LEFT JOIN LATERAL (
         SELECT execution.id
         FROM agronomic_rule_executions execution
         WHERE execution.tenant_id = a.tenant_id
           AND execution.analysis_id = a.id
           AND execution.rule_id = ANY($3::text[])
         ORDER BY execution.created_at DESC, execution.id DESC
         LIMIT 1
       ) latest_n ON true
       WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid
       LIMIT 1
       FOR SHARE OF a, cs`,
      [input.tenantId, input.analysisId, [...PRESCRIPTION_NITROGEN_RULE_IDS]],
    );
    const state = stateResult.rows[0];
    if (!state) throw new AiGenerationError("Análise não encontrada.", 404);

    if (state.latestInterpretationId !== input.interpretationId) {
      throw new AiGenerationError(
        "A interpretação determinística mudou antes de salvar a prescrição. A resposta foi descartada; gere novamente com a revisão atual.",
        409,
      );
    }
    const interpretationGate = checkPrescriptionDraftGate(state.latestInterpretationStatus);
    if (!interpretationGate.allowed) {
      throw new AiGenerationError(
        `${interpretationGate.reason} A resposta foi descartada antes de persistir o rascunho.`,
        409,
      );
    }

    const expectedSeasonAt = new Date(input.expectedSeasonUpdatedAt).getTime();
    const currentSeasonAt = new Date(state.seasonUpdatedAt).getTime();
    if (!Number.isFinite(expectedSeasonAt) || !Number.isFinite(currentSeasonAt) || expectedSeasonAt !== currentSeasonAt) {
      throw new AiGenerationError(
        "O contexto agronômico da safra mudou antes de salvar a prescrição. A resposta foi descartada; gere novamente.",
        409,
      );
    }

    const analysisContextFreshness = evaluateAnalysisContextFingerprintFreshness({
      generationFingerprint: input.expectedAnalysisContextFingerprint,
      currentFingerprint: state.analysisContextFingerprint,
    });
    if (!analysisContextFreshness.current) {
      throw new AiGenerationError(
        `${analysisContextFreshness.reason} A resposta foi descartada antes de persistir o rascunho.`,
        409,
      );
    }

    const evidenceFreshness = evaluateAnalysisEvidenceFreshness({
      interpretationCreatedAt: state.latestInterpretationCreatedAt,
      latestImportCommittedAt: state.latestImportCommittedAt,
      interpretationCropProfileId: state.latestInterpretationCropProfileId,
      currentCropProfileId: state.currentCropProfileId,
      latestRuleUpdatedAt: state.latestRuleUpdatedAt,
    });
    if (!evidenceFreshness.current) {
      throw new AiGenerationError(
        evidenceFreshness.reason ?? "O laudo laboratorial mudou depois da interpretação. Recalcule antes de gerar uma prescrição.",
        409,
      );
    }

    const nitrogenFreshness = evaluateNitrogenExecutionSnapshotFreshness({
      generationExecutionId: input.expectedNitrogenExecutionId ?? null,
      currentExecutionId: state.latestNitrogenExecutionId,
    });
    if (!nitrogenFreshness.current) {
      throw new AiGenerationError(
        `${nitrogenFreshness.reason} A resposta foi descartada antes de persistir o rascunho.`,
        409,
      );
    }

    const result = await client.query(
      `INSERT INTO ai_generations
       (tenant_id, kind, interpretation_id, analysis_id, provider, model, prompt_version, request_payload, response_payload, tokens_used, cost_usd, status, created_by)
       VALUES ($1::uuid, 'AGRONOMIC_PRESCRIPTION', $2::uuid, $3::uuid, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11::ai_review_status, $12::uuid)
       RETURNING id::text, status, created_at::text AS "createdAt"`,
      [
        input.tenantId,
        input.interpretationId,
        input.analysisId,
        input.provider,
        input.model,
        input.promptVersion,
        JSON.stringify(input.requestPayload),
        JSON.stringify(input.responsePayload),
        input.tokensUsed ?? null,
        input.costUsd ?? null,
        PRESCRIPTION_DRAFT_STATUS,
        input.userId,
      ],
    );
    const created = result.rows[0];

    if (input.supersedes) {
      await client.query(
        `UPDATE ai_generations
         SET superseded_by = $3::uuid
         WHERE tenant_id = $1::uuid AND id = $2::uuid AND kind = 'AGRONOMIC_PRESCRIPTION'`,
        [input.tenantId, input.supersedes, created.id],
      );
    }

    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "AI_AGRONOMIC_PRESCRIPTION_GENERATED",
      entityType: "ai_generation",
      entityId: created.id,
      metadata: {
        analysisId: input.analysisId,
        provider: input.provider,
        model: input.model,
        promptVersion: input.promptVersion,
        tokensUsed: input.tokensUsed ?? null,
        interpretationId: input.interpretationId,
        reviewStatus: PRESCRIPTION_DRAFT_STATUS,
      },
    });

    return created;
  });
}
