import { evaluateAnalysisEvidenceFreshness } from "@/domain/analysis-evidence-freshness";
import { evaluatePrescriptionReviewTransition, type PrescriptionReviewDecision, type PrescriptionReviewStatus } from "@/domain/agronomic-prescription-review";
import { evaluatePrescriptionContextFreshness } from "@/domain/prescription-context-freshness";
import { validatePrescriptionPkRecommendations } from "@/domain/prescription-pk-validation";
import { withTenant } from "@/lib/db";
import type { PoolClient } from "pg";
import { writeAudit } from "@/lib/repositories/audit";
import { AiGenerationError } from "@/lib/repositories/ai-generations";

function interpretationItems(structuredOutput: unknown) {
  if (!structuredOutput || typeof structuredOutput !== "object" || Array.isArray(structuredOutput)) return [];
  const value = (structuredOutput as { interpretation?: unknown }).interpretation;
  return Array.isArray(value) ? value : [];
}

type PrescriptionReviewInput = {
  tenantId: string;
  userId: string;
  generationId: string;
  decision: PrescriptionReviewDecision;
  note?: string | null;
};

/**
 * Revisão concorrente-segura executável dentro de uma transação já aberta.
 * Mantém os mesmos gates de freshness, interpretação APPROVED e P/K determinístico.
 */
export async function reviewAgronomicPrescriptionWithClient(client: PoolClient, input: PrescriptionReviewInput) {
  const locked = await client.query<{
    id: string;
    analysisId: string;
    interpretationId: string | null;
    status: PrescriptionReviewStatus;
    createdAt: string;
    responsePayload: { prescription?: { recommendations?: Array<{ inputType?: unknown; quantity?: unknown; unit?: unknown }> } } | null;
  }>(
    `SELECT id::text, analysis_id::text AS "analysisId", interpretation_id::text AS "interpretationId",
            status::text AS status, created_at::text AS "createdAt", response_payload AS "responsePayload"
     FROM ai_generations
     WHERE tenant_id = $1::uuid AND id = $2::uuid AND kind = 'AGRONOMIC_PRESCRIPTION'
     FOR UPDATE`,
    [input.tenantId, input.generationId],
  );
  const current = locked.rows[0];
  if (!current) throw new AiGenerationError("Prescrição não encontrada.", 404);

  const transition = evaluatePrescriptionReviewTransition(current.status, input.decision);
  if (!transition.allowed) throw new AiGenerationError(transition.reason ?? "Transição de revisão inválida.", 409);
  if (transition.noOp) {
    return {
      id: current.id,
      status: current.status,
      analysisId: current.analysisId,
      promotedRecommendations: 0,
      idempotent: true,
    };
  }

  const recommendationSources = new Map<number, string>();
  let deterministicPkValidated = 0;

  if (transition.shouldPromoteRecommendations) {
    const evidenceState = await client.query<{
      updatedAt: string;
      yieldGoal: number | null;
      yieldGoalUnit: string | null;
      cultivationOrderAfterSoilAnalysis: number | null;
      cropProfileCode: string | null;
      currentCropProfileId: string | null;
      latestInterpretationId: string | null;
      latestInterpretationCropProfileId: string | null;
      latestInterpretationStatus: string | null;
      latestInterpretationCreatedAt: string | null;
      latestStructuredOutput: unknown;
      latestImportCommittedAt: string | null;
      latestRuleUpdatedAt: string | null;
    }>(
      `SELECT cs.updated_at::text AS "updatedAt",
              cs.yield_goal::float8 AS "yieldGoal",
              cs.yield_goal_unit AS "yieldGoalUnit",
              cs.cultivation_order_after_soil_analysis AS "cultivationOrderAfterSoilAnalysis",
              cp.code AS "cropProfileCode",
              cs.crop_profile_id::text AS "currentCropProfileId",
              li.id::text AS "latestInterpretationId",
              li.crop_profile_id::text AS "latestInterpretationCropProfileId",
              li.status::text AS "latestInterpretationStatus",
              li.created_at::text AS "latestInterpretationCreatedAt",
              li.structured_output AS "latestStructuredOutput",
              latest_import.latest_import_at::text AS "latestImportCommittedAt",
              rule_state.latest_rule_updated_at::text AS "latestRuleUpdatedAt"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       LEFT JOIN crop_profiles cp ON cp.id = cs.crop_profile_id
       LEFT JOIN LATERAL (
         SELECT i.id, i.status, i.created_at, i.structured_output, i.crop_profile_id
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
       WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid
       LIMIT 1
       FOR SHARE OF a, cs`,
      [input.tenantId, current.analysisId],
    );
    const state = evidenceState.rows[0];
    const freshness = evaluatePrescriptionContextFreshness({
      generationCreatedAt: current.createdAt,
      cropSeasonUpdatedAt: state?.updatedAt,
    });
    if (!freshness.current) {
      throw new AiGenerationError(freshness.reason ?? "O contexto da prescrição mudou; gere uma nova versão.", 409);
    }
    if (
      !current.interpretationId
      || current.interpretationId !== state?.latestInterpretationId
      || state?.latestInterpretationStatus !== "APPROVED"
    ) {
      throw new AiGenerationError(
        "A interpretação determinística vinculada a esta prescrição não é mais a revisão APPROVED atual. Gere uma nova prescrição antes de aprovar ou promover doses.",
        409,
      );
    }

    const labEvidenceFreshness = evaluateAnalysisEvidenceFreshness({
      interpretationCreatedAt: state?.latestInterpretationCreatedAt,
      latestImportCommittedAt: state?.latestImportCommittedAt,
      interpretationCropProfileId: state?.latestInterpretationCropProfileId,
      currentCropProfileId: state?.currentCropProfileId,
      latestRuleUpdatedAt: state?.latestRuleUpdatedAt,
    });
    if (!labEvidenceFreshness.current) {
      throw new AiGenerationError(
        labEvidenceFreshness.reason ?? "O laudo laboratorial mudou depois da interpretação desta prescrição. Recalcule antes de aprovar.",
        409,
      );
    }

    const recommendations = current.responsePayload?.prescription?.recommendations ?? [];
    const pkValidation = validatePrescriptionPkRecommendations({
      recommendations,
      cropCode: state?.cropProfileCode,
      interpretation: interpretationItems(state?.latestStructuredOutput),
      yieldGoal: state?.yieldGoal,
      yieldGoalUnit: state?.yieldGoalUnit,
      cultivationOrderAfterSoilAnalysis: state?.cultivationOrderAfterSoilAnalysis,
    });
    if (!pkValidation.allowed) {
      const details = pkValidation.failures.map((failure) => {
        const expected = failure.validation?.expected;
        const expectedText = expected
          ? ` permitido ${expected.minimumKgPerHa}–${expected.maximumKgPerHa} kg/ha`
          : "";
        return `${failure.inputType}: ${failure.blockers.join(", ")}${expectedText}`;
      }).join("; ");
      throw new AiGenerationError(
        `P/K não pode ser promovido como dose oficial nesta análise. ${details}. Gere uma nova versão ancorada no motor determinístico.`,
        409,
      );
    }

    for (const validated of pkValidation.validated) {
      const expected = validated.validation.expected;
      if (!expected) continue;
      recommendationSources.set(validated.index, `deterministic:${expected.ruleId};ai_generation:${current.id}`);
    }
    deterministicPkValidated = pkValidation.validated.length;
  }

  await client.query(
    `UPDATE ai_generations
     SET status = $3::ai_review_status,
         reviewer_note = nullif($4,''),
         reviewed_by = $5::uuid,
         reviewed_at = now()
     WHERE tenant_id = $1::uuid AND id = $2::uuid AND kind = 'AGRONOMIC_PRESCRIPTION'`,
    [input.tenantId, input.generationId, input.decision, input.note ?? "", input.userId],
  );

  await writeAudit(client, {
    tenantId: input.tenantId,
    userId: input.userId,
    action: "AI_AGRONOMIC_PRESCRIPTION_REVIEWED",
    entityType: "ai_generation",
    entityId: current.id,
    metadata: { decision: input.decision, deterministicPkValidated },
  });

  let promotedCount = 0;
  if (transition.shouldPromoteRecommendations) {
    const recommendations = current.responsePayload?.prescription?.recommendations ?? [];
    for (let index = 0; index < recommendations.length; index += 1) {
      const recommendation = recommendations[index];
      if (typeof recommendation.inputType !== "string" || typeof recommendation.quantity !== "number" || typeof recommendation.unit !== "string") continue;
      const calculationSource = recommendationSources.get(index) ?? `ai_generations:${current.id}`;
      const inserted = await client.query(
        `INSERT INTO input_recommendations
         (tenant_id, analysis_id, input_type, quantity, unit, calculation_source, source_generation_id)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::uuid)
         ON CONFLICT DO NOTHING
         RETURNING id::text`,
        [input.tenantId, current.analysisId, recommendation.inputType, recommendation.quantity, recommendation.unit, calculationSource, current.id],
      );
      promotedCount += inserted.rowCount ?? 0;
    }
    if (promotedCount > 0) {
      await writeAudit(client, {
        tenantId: input.tenantId,
        userId: input.userId,
        action: "INPUT_RECOMMENDATIONS_PROMOTED_FROM_AI",
        entityType: "ai_generation",
        entityId: current.id,
        metadata: { analysisId: current.analysisId, count: promotedCount, deterministicPkValidated },
      });
    }
  }

  return {
    id: current.id,
    status: input.decision,
    analysisId: current.analysisId,
    promotedRecommendations: promotedCount,
    idempotent: false,
  };
}

/**
 * Revisão transacional e concorrente-segura da prescrição.
 * A API histórica permanece igual e agora delega à operação reutilizável na mesma transação.
 */
export async function reviewAgronomicPrescriptionSafely(input: PrescriptionReviewInput) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, (client) => reviewAgronomicPrescriptionWithClient(client, input));
}
