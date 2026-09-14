import { evaluatePrescriptionContextFreshness, type PrescriptionContextFreshness } from "@/domain/prescription-context-freshness";
import { withTenant } from "@/lib/db";

/**
 * Estado corrente de uma geração já persistida. Uma prescrição deixa de ser corrente quando:
 * 1) a safra mudou depois da geração; OU
 * 2) ela não aponta mais para a revisão determinística mais recente e APPROVED.
 *
 * Isso é somente leitura: a geração histórica não é apagada nem reescrita.
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
    }>(
      `SELECT g.created_at::text AS "generationCreatedAt",
              g.interpretation_id::text AS "generationInterpretationId",
              cs.updated_at::text AS "cropSeasonUpdatedAt",
              li.id::text AS "latestInterpretationId",
              li.status::text AS "latestInterpretationStatus"
       FROM ai_generations g
       JOIN analyses a ON a.tenant_id = g.tenant_id AND a.id = g.analysis_id
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       LEFT JOIN LATERAL (
         SELECT i.id, i.status
         FROM interpretations i
         WHERE i.tenant_id = a.tenant_id AND i.analysis_id = a.id
         ORDER BY i.revision DESC
         LIMIT 1
       ) li ON true
       WHERE g.tenant_id = $1::uuid
         AND g.analysis_id = $2::uuid
         AND g.id = $3::uuid
         AND g.kind = 'AGRONOMIC_PRESCRIPTION'
       LIMIT 1`,
      [input.tenantId, input.analysisId, input.generationId],
    );
    const row = result.rows[0];
    if (!row) return { current: false, reason: "Não foi possível comprovar a geração de prescrição atual." };

    const contextFreshness = evaluatePrescriptionContextFreshness({
      generationCreatedAt: row.generationCreatedAt,
      cropSeasonUpdatedAt: row.cropSeasonUpdatedAt,
    });
    if (!contextFreshness.current) return contextFreshness;

    if (
      !row.generationInterpretationId
      || row.generationInterpretationId !== row.latestInterpretationId
      || row.latestInterpretationStatus !== "APPROVED"
    ) {
      return {
        current: false,
        reason: "A interpretação determinística vinculada a esta geração foi superada ou deixou de ser a revisão APPROVED atual.",
      };
    }

    return { current: true, reason: null };
  });
}
