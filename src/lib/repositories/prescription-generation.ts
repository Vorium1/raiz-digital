import { evaluateAnalysisEvidenceFreshness } from "@/domain/analysis-evidence-freshness";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { AiGenerationError } from "@/lib/repositories/ai-generations";

/**
 * Persiste uma prescrição somente se o snapshot validado antes/depois do provedor ainda for o snapshot
 * corrente dentro da própria transação de INSERT. O lock SHARE na análise/safra conflita com importação
 * (FOR UPDATE) e com UPDATE do contexto da safra, fechando a janela entre o último check HTTP e o save.
 */
export async function recordAgronomicPrescriptionGenerationSafely(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
  interpretationId: string;
  expectedSeasonUpdatedAt: string;
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
      latestInterpretationId: string | null;
      latestInterpretationStatus: string | null;
      latestInterpretationCreatedAt: string | null;
      latestImportCommittedAt: string | null;
    }>(
      `SELECT cs.updated_at::text AS "seasonUpdatedAt",
              li.id::text AS "latestInterpretationId",
              li.status::text AS "latestInterpretationStatus",
              li.created_at::text AS "latestInterpretationCreatedAt",
              latest_import.latest_import_at::text AS "latestImportCommittedAt"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       LEFT JOIN LATERAL (
         SELECT i.id, i.status, i.created_at
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
       WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid
       LIMIT 1
       FOR SHARE OF a, cs`,
      [input.tenantId, input.analysisId],
    );
    const state = stateResult.rows[0];
    if (!state) throw new AiGenerationError("Análise não encontrada.", 404);

    if (
      state.latestInterpretationId !== input.interpretationId
      || state.latestInterpretationStatus !== "APPROVED"
    ) {
      throw new AiGenerationError(
        "A interpretação determinística mudou antes de salvar a prescrição. A resposta foi descartada; gere novamente com a revisão APPROVED atual.",
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

    const evidenceFreshness = evaluateAnalysisEvidenceFreshness({
      interpretationCreatedAt: state.latestInterpretationCreatedAt,
      latestImportCommittedAt: state.latestImportCommittedAt,
    });
    if (!evidenceFreshness.current) {
      throw new AiGenerationError(
        evidenceFreshness.reason ?? "O laudo laboratorial mudou depois da interpretação. Recalcule antes de gerar uma prescrição.",
        409,
      );
    }

    const result = await client.query(
      `INSERT INTO ai_generations
       (tenant_id, kind, interpretation_id, analysis_id, provider, model, prompt_version, request_payload, response_payload, tokens_used, cost_usd, created_by)
       VALUES ($1::uuid, 'AGRONOMIC_PRESCRIPTION', $2::uuid, $3::uuid, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11::uuid)
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
      },
    });

    return created;
  });
}
