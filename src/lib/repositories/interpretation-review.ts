import { evaluateInterpretationReviewTransition, type InterpretationReviewStatus } from "@/domain/interpretation-review";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { InterpretationError } from "@/lib/repositories/interpretations";

/**
 * Revisão profissional fail-closed da interpretação determinística.
 *
 * O registro alvo é bloqueado durante a decisão. A política impede:
 * - aprovar uma revisão antiga enquanto uma mais nova já existe;
 * - transformar CALCULATED (pendente) em IN_REVIEW/APPROVED por chamada de API;
 * - rebaixar APPROVED para IN_REVIEW;
 * - alterar PUBLISHED/SUPERSEDED;
 * - repetir APPROVED gerando auditorias/mutações desnecessárias.
 */
export async function reviewInterpretationSafely(input: {
  tenantId: string;
  userId: string;
  interpretationId: string;
  approve: boolean;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const locked = await client.query<{
      id: string;
      status: InterpretationReviewStatus;
      analysisId: string;
      revision: number;
      latestRevision: number;
    }>(
      `SELECT i.id::text,
              i.status::text AS status,
              i.analysis_id::text AS "analysisId",
              i.revision,
              (SELECT max(i2.revision) FROM interpretations i2
               WHERE i2.tenant_id = i.tenant_id AND i2.analysis_id = i.analysis_id) AS "latestRevision"
       FROM interpretations i
       WHERE i.tenant_id = $1::uuid AND i.id = $2::uuid
       FOR UPDATE`,
      [input.tenantId, input.interpretationId],
    );
    const current = locked.rows[0];
    if (!current) throw new InterpretationError("Interpretação não encontrada.", 404);

    const transition = evaluateInterpretationReviewTransition({
      currentStatus: current.status,
      approve: input.approve,
      isLatestRevision: current.revision === current.latestRevision,
    });
    if (!transition.allowed) throw new InterpretationError(transition.reason ?? "Transição de revisão inválida.", 409);

    if (transition.noOp) {
      return {
        id: current.id,
        status: current.status,
        analysisId: current.analysisId,
        revision: current.revision,
        idempotent: true,
      };
    }

    const nextStatus = transition.nextStatus;
    if (!nextStatus) throw new InterpretationError("Transição de revisão inválida.", 409);

    const updatedResult = input.approve
      ? await client.query<{ id: string; status: string; analysisId: string; revision: number }>(
          `UPDATE interpretations
           SET status = 'APPROVED',
               reviewed_by = $3::uuid,
               reviewed_at = now(),
               approved_by = $3::uuid,
               approved_at = now()
           WHERE tenant_id = $1::uuid AND id = $2::uuid
           RETURNING id::text, status, analysis_id::text AS "analysisId", revision`,
          [input.tenantId, input.interpretationId, input.userId],
        )
      : await client.query<{ id: string; status: string; analysisId: string; revision: number }>(
          `UPDATE interpretations
           SET status = 'IN_REVIEW',
               reviewed_by = $3::uuid,
               reviewed_at = now()
           WHERE tenant_id = $1::uuid AND id = $2::uuid
           RETURNING id::text, status, analysis_id::text AS "analysisId", revision`,
          [input.tenantId, input.interpretationId, input.userId],
        );

    const updated = updatedResult.rows[0];
    if (!updated) throw new InterpretationError("Interpretação não encontrada.", 404);

    await client.query(
      `UPDATE analyses
       SET status = $3::analysis_status, updated_at = now()
       WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [input.tenantId, updated.analysisId, input.approve ? "APPROVED" : "AWAITING_REVIEW"],
    );

    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: input.approve ? "INTERPRETATION_APPROVED" : "INTERPRETATION_REVIEWED",
      entityType: "interpretation",
      entityId: updated.id,
      metadata: { analysisId: updated.analysisId, revision: updated.revision },
    });

    return { ...updated, idempotent: false };
  });
}
