import { withTenant } from "@/lib/db";
import { AiGenerationError } from "@/lib/repositories/ai-generations";
import { reviewInterpretationWithClient } from "@/lib/repositories/interpretation-review";
import { reviewAgronomicPrescriptionWithClient } from "@/lib/repositories/prescription-review";

export type FinalTechnicalReviewDecision = "APPROVED" | "CHANGES_REQUESTED";

type FinalTechnicalReviewInput = {
  tenantId: string;
  userId: string;
  analysisId: string;
  interpretationId: string;
  prescriptionId: string;
  decision: FinalTechnicalReviewDecision;
  note?: string | null;
};

/**
 * Decisão final única da UX 2.0.
 *
 * APPROVED preserva duas decisões auditáveis (interpretação + prescrição), ambas na MESMA transação.
 * A prescrição continua executando todos os gates estritos depois que a interpretação foi marcada APPROVED;
 * se qualquer gate falhar, o ROLLBACK desfaz também a aprovação da interpretação.
 *
 * CHANGES_REQUESTED marca somente o rascunho da prescrição para ajustes e nunca aprova a interpretação,
 * promove recomendação ou publica relatório.
 */
export async function reviewFinalTechnicalReviewSafely(input: FinalTechnicalReviewInput) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const linkage = await client.query<{
      interpretationAnalysisId: string;
      prescriptionAnalysisId: string;
      prescriptionInterpretationId: string | null;
    }>(
      `SELECT i.analysis_id::text AS "interpretationAnalysisId",
              g.analysis_id::text AS "prescriptionAnalysisId",
              g.interpretation_id::text AS "prescriptionInterpretationId"
       FROM interpretations i
       JOIN ai_generations g ON g.tenant_id = i.tenant_id
       WHERE i.tenant_id = $1::uuid
         AND i.id = $2::uuid
         AND g.id = $3::uuid
         AND g.kind = 'AGRONOMIC_PRESCRIPTION'
       FOR UPDATE OF i, g`,
      [input.tenantId, input.interpretationId, input.prescriptionId],
    );
    const linked = linkage.rows[0];
    if (!linked) throw new AiGenerationError("Interpretação ou recomendação de rascunho não encontrada.", 404);
    if (
      linked.interpretationAnalysisId !== input.analysisId
      || linked.prescriptionAnalysisId !== input.analysisId
      || linked.prescriptionInterpretationId !== input.interpretationId
    ) {
      throw new AiGenerationError(
        "A interpretação e a recomendação não pertencem ao mesmo snapshot técnico desta análise. Recarregue a revisão antes de decidir.",
        409,
      );
    }

    if (input.decision === "CHANGES_REQUESTED") {
      const prescription = await reviewAgronomicPrescriptionWithClient(client, {
        tenantId: input.tenantId,
        userId: input.userId,
        generationId: input.prescriptionId,
        decision: "CHANGES_REQUESTED",
        note: input.note ?? null,
      });
      if (prescription.analysisId !== input.analysisId) {
        throw new AiGenerationError("A recomendação revisada não pertence à análise informada.", 409);
      }
      return { decision: input.decision, interpretation: null, prescription };
    }

    const interpretation = await reviewInterpretationWithClient(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      interpretationId: input.interpretationId,
      approve: true,
    });
    if (interpretation.analysisId !== input.analysisId) {
      throw new AiGenerationError("A interpretação aprovada não pertence à análise informada.", 409);
    }

    const prescription = await reviewAgronomicPrescriptionWithClient(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      generationId: input.prescriptionId,
      decision: "APPROVED",
      note: input.note ?? null,
    });
    if (prescription.analysisId !== input.analysisId) {
      throw new AiGenerationError("A recomendação aprovada não pertence à análise informada.", 409);
    }

    return { decision: input.decision, interpretation, prescription };
  });
}

/** Compatibilidade interna para qualquer chamada que ainda represente aprovação explícita. */
export async function approveFinalTechnicalReviewSafely(input: Omit<FinalTechnicalReviewInput, "decision">) {
  return reviewFinalTechnicalReviewSafely({ ...input, decision: "APPROVED" });
}
