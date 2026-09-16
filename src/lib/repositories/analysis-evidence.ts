import { evaluateAnalysisEvidenceFreshness, type AnalysisEvidenceFreshness } from "@/domain/analysis-evidence-freshness";
import { withTenant } from "@/lib/db";

export type AnalysisEvidenceState = {
  analysisExists: boolean;
  interpretationId: string | null;
  interpretationStatus: string | null;
  interpretationCreatedAt: string | null;
  latestImportCommittedAt: string | null;
  freshness: AnalysisEvidenceFreshness;
};

/** Leitura única e fail-closed do vínculo entre a revisão determinística mais recente e o laudo atual. */
export async function getAnalysisEvidenceState(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
}): Promise<AnalysisEvidenceState> {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query<{
      analysisId: string;
      interpretationId: string | null;
      interpretationStatus: string | null;
      interpretationCreatedAt: string | null;
      latestImportCommittedAt: string | null;
    }>(
      `SELECT a.id::text AS "analysisId",
              li.id::text AS "interpretationId",
              li.status::text AS "interpretationStatus",
              li.created_at::text AS "interpretationCreatedAt",
              latest_import.latest_import_at::text AS "latestImportCommittedAt"
       FROM analyses a
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
       LIMIT 1`,
      [input.tenantId, input.analysisId],
    );
    const row = result.rows[0];
    if (!row) {
      return {
        analysisExists: false,
        interpretationId: null,
        interpretationStatus: null,
        interpretationCreatedAt: null,
        latestImportCommittedAt: null,
        freshness: {
          current: false,
          code: "INTERPRETATION_TIMESTAMP_MISSING",
          reason: "Análise não encontrada para comprovar a atualidade da evidência.",
        },
      };
    }

    return {
      analysisExists: true,
      interpretationId: row.interpretationId,
      interpretationStatus: row.interpretationStatus,
      interpretationCreatedAt: row.interpretationCreatedAt,
      latestImportCommittedAt: row.latestImportCommittedAt,
      freshness: row.interpretationId
        ? evaluateAnalysisEvidenceFreshness({
            interpretationCreatedAt: row.interpretationCreatedAt,
            latestImportCommittedAt: row.latestImportCommittedAt,
          })
        : {
            current: false,
            code: "INTERPRETATION_TIMESTAMP_MISSING",
            reason: "Ainda não existe interpretação determinística para o laudo corrente.",
          },
    };
  });
}
