import { evaluateAnalysisEvidenceFreshness } from "@/domain/analysis-evidence-freshness";
import { evaluateInterpretationReviewTransition, type InterpretationReviewStatus } from "@/domain/interpretation-review";
import { withTenant } from "@/lib/db";
import type { PoolClient } from "pg";
import { writeAudit } from "@/lib/repositories/audit";
import { InterpretationError } from "@/lib/repositories/interpretations";

type InterpretationReviewInput = {
  tenantId: string;
  userId: string;
  interpretationId: string;
  approve: boolean;
};

/**
 * Mesma revisão fail-closed, mas executável dentro de uma transação já aberta.
 * Usado pela UX 2.0 para que a aprovação da interpretação e da prescrição possa ser atômica.
 */
export async function reviewInterpretationWithClient(client: PoolClient, input: InterpretationReviewInput) {
  const locked = await client.query<{
    id: string;
    status: InterpretationReviewStatus;
    analysisId: string;
    revision: number;
    latestRevision: number;
    createdAt: string;
  }>(
    `SELECT i.id::text,
            i.status::text AS status,
            i.analysis_id::text AS "analysisId",
            i.revision,
            i.created_at::text AS "createdAt",
            (SELECT max(i2.revision) FROM interpretations i2
             WHERE i2.tenant_id = i.tenant_id AND i2.analysis_id = i.analysis_id) AS "latestRevision"
     FROM interpretations i
     WHERE i.tenant_id = $1::uuid AND i.id = $2::uuid
     FOR UPDATE`,
    [input.tenantId, input.interpretationId],
  );
  const current = locked.rows[0];
  if (!current) throw new InterpretationError("Interpretação não encontrada.", 404);

  const evidenceState = await client.query<{ latestImportCommittedAt: string | null }>(
    `SELECT latest_import.latest_import_at::text AS "latestImportCommittedAt"
     FROM analyses a
     LEFT JOIN LATERAL (
       SELECT max(coalesce(ai.committed_at, ai.created_at)) AS latest_import_at
       FROM analysis_imports ai
       WHERE ai.tenant_id = a.tenant_id AND ai.analysis_id = a.id
     ) latest_import ON true
     WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid
     FOR SHARE OF a`,
    [input.tenantId, current.analysisId],
  );
  const evidenceFreshness = evaluateAnalysisEvidenceFreshness({
    interpretationCreatedAt: current.createdAt,
    latestImportCommittedAt: evidenceState.rows[0]?.latestImportCommittedAt ?? null,
  });
  if (!evidenceFreshness.current) {
    throw new InterpretationError(evidenceFreshness.reason ?? "A interpretação não representa o laudo laboratorial corrente.", 409);
  }

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
}

/**
 * Revisão profissional fail-closed da interpretação determinística.
 * Mantém a API existente; internamente delega à versão que aceita o mesmo client/transação.
 */
export async function reviewInterpretationSafely(input: InterpretationReviewInput) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, (client) => reviewInterpretationWithClient(client, input));
}
