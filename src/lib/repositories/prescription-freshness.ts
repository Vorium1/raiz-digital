import { evaluateAnalysisEvidenceFreshness } from "@/domain/analysis-evidence-freshness";
import { evaluatePrescriptionContextFreshness, type PrescriptionContextFreshness } from "@/domain/prescription-context-freshness";
import { withTenant } from "@/lib/db";

/**
 * Estado corrente de uma geração já persistida. Uma prescrição deixa de ser corrente quando:
 * 1) a safra mudou depois da geração; OU
 * 2) ela não aponta mais para a revisão determinística mais recente em estado revisável
 *    (IN_REVIEW ou APPROVED); OU
 * 3) o laudo ou as regras agronômicas mudaram depois da interpretação que sustenta a geração.
 *
 * "Corrente" aqui significa que o rascunho ainda representa o snapshot técnico atual. Não significa
 * que ele já esteja oficial/aprovado. A publicação continua exigindo interpretação e prescrição
 * APPROVED nos gates próprios de revisão/publicação.
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
      latestInterpretationCreatedAt: string | null;
      latestInterpretationCropProfileId: string | null;
      currentCropProfileId: string | null;
      latestImportCommittedAt: string | null;
      latestRuleUpdatedAt: string | null;
    }>(
      `SELECT g.created_at::text AS "generationCreatedAt",
              g.interpretation_id::text AS "generationInterpretationId",
              cs.updated_at::text AS "cropSeasonUpdatedAt",
              li.id::text AS "latestInterpretationId",
              li.status::text AS "latestInterpretationStatus",
              li.created_at::text AS "latestInterpretationCreatedAt",
              li.crop_profile_id::text AS "latestInterpretationCropProfileId",
              cs.crop_profile_id::text AS "currentCropProfileId",
              latest_import.latest_import_at::text AS "latestImportCommittedAt",
              rule_state.latest_rule_updated_at::text AS "latestRuleUpdatedAt"
       FROM ai_generations g
       JOIN analyses a ON a.tenant_id = g.tenant_id AND a.id = g.analysis_id
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
      || (row.latestInterpretationStatus !== "IN_REVIEW" && row.latestInterpretationStatus !== "APPROVED")
    ) {
      return {
        current: false,
        reason: "A interpretação determinística vinculada a esta geração foi superada ou deixou de ser a revisão atual disponível para decisão.",
      };
    }

    const evidenceFreshness = evaluateAnalysisEvidenceFreshness({
      interpretationCreatedAt: row.latestInterpretationCreatedAt,
      latestImportCommittedAt: row.latestImportCommittedAt,
      interpretationCropProfileId: row.latestInterpretationCropProfileId,
      currentCropProfileId: row.currentCropProfileId,
      latestRuleUpdatedAt: row.latestRuleUpdatedAt,
    });
    if (!evidenceFreshness.current) {
      return { current: false, reason: evidenceFreshness.reason };
    }

    return { current: true, reason: null };
  });
}
