import { withTenant } from "@/lib/db";

export type ActivationSnapshot = {
  clients: number;
  properties: number;
  fields: number;
  seasons: number;
  totalPoints: number;
  labsProcessed: number;
  approvedFields: number;
};

/**
 * Marcos globais de ativação do tenant. Esta consulta é deliberadamente independente dos filtros do
 * dashboard: trocar cliente, propriedade ou safra nunca pode fazer a empresa "regredir" na jornada de
 * onboarding. Cada marco nasce de persistência real; não existe flag manual de etapa concluída.
 */
export async function getActivationSnapshot(tenantId: string, userId?: string): Promise<ActivationSnapshot> {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<ActivationSnapshot>(
      `SELECT
        (SELECT count(*)::int FROM clients c WHERE c.tenant_id = $1::uuid) AS clients,
        (SELECT count(*)::int FROM properties p WHERE p.tenant_id = $1::uuid) AS properties,
        (SELECT count(*)::int FROM fields f WHERE f.tenant_id = $1::uuid) AS fields,
        (SELECT count(*)::int FROM crop_seasons cs WHERE cs.tenant_id = $1::uuid) AS seasons,
        (SELECT count(*)::int FROM sample_points sp WHERE sp.tenant_id = $1::uuid) AS "totalPoints",
        (SELECT count(DISTINCT ls.analysis_id)::int
           FROM lab_samples ls
           JOIN lab_results lr ON lr.tenant_id = ls.tenant_id AND lr.lab_sample_id = ls.id
          WHERE ls.tenant_id = $1::uuid) AS "labsProcessed",
        (SELECT count(DISTINCT cs.field_id)::int
           FROM interpretations i
           JOIN analyses a ON a.tenant_id = i.tenant_id AND a.id = i.analysis_id
           JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
          WHERE i.tenant_id = $1::uuid AND i.status = 'APPROVED') AS "approvedFields"`,
      [tenantId],
    );
    return result.rows[0];
  });
}
