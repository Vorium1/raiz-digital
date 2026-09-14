import { evaluatePrescriptionReviewTransition, type PrescriptionReviewDecision, type PrescriptionReviewStatus } from "@/domain/agronomic-prescription-review";
import { evaluatePrescriptionContextFreshness } from "@/domain/prescription-context-freshness";
import { canonicalCommercialTarget } from "@/domain/commercial-recommendation-targets";
import { validateDeterministicPkRecommendation, type UniformPkTarget } from "@/domain/uniform-pk-readiness";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { AiGenerationError } from "@/lib/repositories/ai-generations";

function interpretationItems(structuredOutput: unknown) {
  if (!structuredOutput || typeof structuredOutput !== "object" || Array.isArray(structuredOutput)) return [];
  const value = (structuredOutput as { interpretation?: unknown }).interpretation;
  return Array.isArray(value) ? value : [];
}

function ambiguousElementalPkInput(inputType: string) {
  const code = inputType
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return new Set(["P", "K", "FOSFORO", "POTASSIO", "PHOSPHORUS", "POTASSIUM"]).has(code);
}

/**
 * Revisão transacional e concorrente-segura da prescrição.
 *
 * Além de freshness/interpretação APPROVED, P2O5/K2O passam por uma barreira adicional: o servidor
 * recalcula a dose com a tabela determinística, a cultura homologada, a meta produtiva, a ordem após a
 * análise e a representatividade dos pontos. A IA nunca vira autoridade de dose por ter produzido JSON.
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

    const recommendationSources = new Map<number, string>();
    let deterministicPkValidated = 0;

    if (transition.shouldPromoteRecommendations) {
      const evidenceState = await client.query<{
        updatedAt: string;
        yieldGoal: number | null;
        yieldGoalUnit: string | null;
        cultivationOrderAfterSoilAnalysis: number | null;
        cropProfileCode: string | null;
        latestInterpretationId: string | null;
        latestInterpretationStatus: string | null;
        latestStructuredOutput: unknown;
      }>(
        `SELECT cs.updated_at::text AS "updatedAt",
                cs.yield_goal::float8 AS "yieldGoal",
                cs.yield_goal_unit AS "yieldGoalUnit",
                cs.cultivation_order_after_soil_analysis AS "cultivationOrderAfterSoilAnalysis",
                cp.code AS "cropProfileCode",
                li.id::text AS "latestInterpretationId",
                li.status::text AS "latestInterpretationStatus",
                li.structured_output AS "latestStructuredOutput"
         FROM analyses a
         JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
         LEFT JOIN crop_profiles cp ON cp.id = cs.crop_profile_id
         LEFT JOIN LATERAL (
           SELECT i.id, i.status, i.structured_output
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

      const recommendations = current.responsePayload?.prescription?.recommendations ?? [];
      const interpreted = interpretationItems(state?.latestStructuredOutput);
      for (let index = 0; index < recommendations.length; index += 1) {
        const recommendation = recommendations[index];
        if (typeof recommendation.inputType !== "string") continue;
        const canonicalTarget = canonicalCommercialTarget(recommendation.inputType);
        if (canonicalTarget !== "P2O5" && canonicalTarget !== "K2O") {
          if (ambiguousElementalPkInput(recommendation.inputType)) {
            throw new AiGenerationError(
              `A recomendação “${recommendation.inputType}” é ambígua. P/K oficial precisa declarar P2O5 ou K2O explicitamente; nenhuma conversão elemental é feita por suposição.`,
              409,
            );
          }
          continue;
        }
        if (typeof recommendation.quantity !== "number" || typeof recommendation.unit !== "string") {
          throw new AiGenerationError(`A recomendação de ${canonicalTarget} não possui quantidade/unidade válidas para validação determinística.`, 409);
        }

        const validation = validateDeterministicPkRecommendation({
          cropCode: state?.cropProfileCode,
          interpretation: interpreted,
          yieldGoal: state?.yieldGoal,
          yieldGoalUnit: state?.yieldGoalUnit,
          cultivationOrderAfterSoilAnalysis: state?.cultivationOrderAfterSoilAnalysis,
          nutrient: canonicalTarget as UniformPkTarget,
          quantity: recommendation.quantity,
          unit: recommendation.unit,
        });
        if (!validation.allowed || !validation.expected) {
          const expected = validation.expected
            ? ` Faixa/valor permitido pelo motor: ${validation.expected.minimumKgPerHa}–${validation.expected.maximumKgPerHa} kg/ha.`
            : "";
          throw new AiGenerationError(
            `${canonicalTarget} não pode ser promovido como dose oficial nesta análise. ${validation.blockers.join(", ")}.${expected}`,
            409,
          );
        }
        recommendationSources.set(index, `deterministic:${validation.expected.ruleId};ai_generation:${current.id}`);
        deterministicPkValidated += 1;
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
  });
}
