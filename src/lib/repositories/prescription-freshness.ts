import { evaluateAnalysisEvidenceFreshness } from "@/domain/analysis-evidence-freshness";
import { evaluatePrescriptionContextFreshness, type PrescriptionContextFreshness } from "@/domain/prescription-context-freshness";
import { withTenant } from "@/lib/db";

const REVIEWABLE_INTERPRETATION_STATUSES = new Set(["IN_REVIEW", "APPROVED", "PUBLISHED"]);

/**
 * Estado corrente de uma geração já persistida.
 * Uma recomendação deixa de ser corrente quando a safra, a revisão determinística ou o laudo mudam.
 * A mudança IN_REVIEW -> APPROVED da MESMA revisão não invalida a recomendação: essa é justamente a
 * assinatura final do pacote completo preparado pela RAIZ.
 */
export async function getAgronomicPrescriptionFreshness(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
  generationId: string | null | undefined;
}): Promise<PrescriptionContextFreshness | null> {
  if (!input.generationId) return null;

  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query<{
      generationCreatedAt: string;
      generationInterpretationId: string | null;
      cropSeasonUpdatedAt: string;
      latestInterpretationId: string | null;
      latestInterpretationStatus: string | null;
      latestInterpretationCreatedAt: string | null;
      latestImportCommittedAt: string | null;
    }>(
      `SELECT g.created_at::text AS "generationCreatedAt",
              g.interpretation_id::text AS "generationInterpretationId",
              cs.updated_at::text AS "cropSeasonUpdatedAt",
              li.id::text AS "latestInterpretationId",
              li.status::text AS "latestInterpretationStatus",
              li.created_at::text AS "latestInterpretationCreatedAt",
              latest_import.latest_import_at::text AS "latestImportCommittedAt"
       FROM ai_generations g
       JOIN analyses a ON a.tenant_id = g.tenant_id AND a.id = g.analysis_id
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
       WHERE g.tenant_id = $1::uuid
         AND g.analysis_id = $2::uuid
         AND g.id = $3::uuid
         AND g.kind = 'AGRONOMIC_PRESCRIPTION'
       LIMIT 1`,
      [input.tenantId, input.analysisId, input.generationId],
    );
    const row = result.rows[0];
    if (!row) return { current: false, reason: "Não foi possível comprovar a geração de recomendação atual." };

    const contextFreshness = evaluatePrescriptionContextFreshness({
      generationCreatedAt: row.generationCreatedAt,
      cropSeasonUpdatedAt: row.cropSeasonUpdatedAt,
    });
    if (!contextFreshness.current) return contextFreshness;

    if (
      !row.generationInterpretationId
      || row.generationInterpretationId !== row.latestInterpretationId
      || !row.latestInterpretationStatus
      || !REVIEWABLE_INTERPRETATION_STATUSES.has(row.latestInterpretationStatus)
    ) {
      return {
        current: false,
        reason: "A interpretação determinística vinculada a esta recomendação foi superada ou deixou de sustentar a decisão atual.",
      };
    }

    const evidenceFreshness = evaluateAnalysisEvidenceFreshness({
      interpretationCreatedAt: row.latestInterpretationCreatedAt,
      latestImportCommittedAt: row.latestImportCommittedAt,
    });
    if (!evidenceFreshness.current) {
      return { current: false, reason: evidenceFreshness.reason };
    }

    return { current: true, reason: null };
  });
}
