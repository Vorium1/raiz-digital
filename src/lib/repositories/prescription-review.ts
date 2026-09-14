import { evaluatePrescriptionReviewTransition, type PrescriptionReviewDecision, type PrescriptionReviewStatus } from "@/domain/agronomic-prescription-review";
import { evaluatePrescriptionContextFreshness } from "@/domain/prescription-context-freshness";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { AiGenerationError } from "@/lib/repositories/ai-generations";

/**
 * Revisão transacional e concorrente-segura da prescrição.
 *
 * O SELECT ... FOR UPDATE é essencial: duas aprovações simultâneas da mesma geração são serializadas.
 * A segunda enxerga o estado já decidido e vira no-op idempotente, em vez de promover as mesmas doses
 * uma segunda vez. O índice parcial da migration 026 é a segunda barreira no banco.
 *
 * Antes de uma NOVA aprovação, a prescrição precisa continuar ancorada na revisão determinística mais
 * recente e APPROVED, e o contexto da safra não pode ter mudado depois da geração. A análise e a safra
 * ficam sob row lock compartilhado durante essa checagem/promoção, serializando mudanças concorrentes
 * que poderiam trocar a revisão ou o contexto no meio da aprovação. Uma repetição da mesma aprovação
 * continua idempotente: não reabre nem promove de novo uma geração já decidida.
 */
export async function reviewAgronomicPrescriptionSafely(input: {
  tenantId: string;
  userId: string;
  generationId: string;
  decision: PrescriptionReviewDecision;
  note?: string | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
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

    if (transition.shouldPromoteRecommendations) {
      const evidenceState = await client.query<{
        updatedAt: string;
        latestInterpretationId: string | null;
        latestInterpretationStatus: string | null;
      }>(
        `SELECT cs.updated_at::text AS "updatedAt",
                li.id::text AS "latestInterpretationId",
                li.status::text AS "latestInterpretationStatus"
         FROM analyses a
         JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
         LEFT JOIN LATERAL (
           SELECT i.id, i.status
           FROM interpretations i
           WHERE i.tenant_id = a.tenant_id AND i.analysis_id = a.id
           ORDER BY i.revision DESC
           LIMIT 1
         ) li ON true
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
      metadata: { decision: input.decision },
    });

    let promotedCount = 0;
    if (transition.shouldPromoteRecommendations) {
      const recommendations = current.responsePayload?.prescription?.recommendations ?? [];
      for (const recommendation of recommendations) {
        if (typeof recommendation.inputType !== "string" || typeof recommendation.quantity !== "number" || typeof recommendation.unit !== "string") continue;
        const inserted = await client.query(
          `INSERT INTO input_recommendations (tenant_id, analysis_id, input_type, quantity, unit, calculation_source)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING
           RETURNING id::text`,
          [input.tenantId, current.analysisId, recommendation.inputType, recommendation.quantity, recommendation.unit, `ai_generations:${current.id}`],
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
          metadata: { analysisId: current.analysisId, count: promotedCount },
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
  });
}
