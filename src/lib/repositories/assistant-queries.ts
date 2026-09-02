import { withTenant } from "@/lib/db";

/** Consultas de apoio ao Assistente RAIZ — sempre reais, sempre escopadas pelo tenant da sessão. */

export async function countLabsImportedThisMonth(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM analysis_imports WHERE tenant_id = $1::uuid AND created_at >= date_trunc('month', now())`,
      [tenantId],
    );
    return result.rows[0].count;
  });
}

export async function listLowestConfidenceAnalyses(tenantId: string, limit: number, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT a.id::text, a.code, a.confidence_score::float8 AS "confidenceScore", f.name AS "fieldName", c.name AS "clientName"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       WHERE a.tenant_id = $1::uuid AND a.confidence_score IS NOT NULL
       ORDER BY a.confidence_score ASC LIMIT $2`,
      [tenantId, limit],
    );
    return result.rows;
  });
}

export async function listAnalysesAwaitingReview(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT a.id::text, a.code, c.name AS "clientName", f.name AS "fieldName"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       WHERE a.tenant_id = $1::uuid AND a.status = 'AWAITING_REVIEW'
       ORDER BY a.updated_at DESC`,
      [tenantId],
    );
    return result.rows;
  });
}

export async function findPropertyByName(tenantId: string, needle: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT id::text, name FROM properties WHERE tenant_id = $1::uuid AND name ILIKE $2 LIMIT 1`,
      [tenantId, `%${needle}%`],
    );
    return result.rows[0] ?? null;
  });
}

export async function compareLatestTwoSeasons(tenantId: string, fieldId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const seasonsResult = await client.query(
      `SELECT id::text, season_label AS "seasonLabel", current_crop AS "currentCrop"
       FROM crop_seasons WHERE tenant_id = $1::uuid AND field_id = $2::uuid ORDER BY created_at DESC LIMIT 2`,
      [tenantId, fieldId],
    );
    if (seasonsResult.rows.length < 2) return null;
    const [latest, previous] = seasonsResult.rows;
    async function latestInterpretation(seasonId: string) {
      const result = await client.query(
        `SELECT i.structured_output AS "structuredOutput" FROM interpretations i
         JOIN analyses a ON a.tenant_id = i.tenant_id AND a.id = i.analysis_id
         WHERE a.crop_season_id = $1::uuid ORDER BY i.created_at DESC LIMIT 1`,
        [seasonId],
      );
      return result.rows[0]?.structuredOutput ?? null;
    }
    const [latestData, previousData] = await Promise.all([latestInterpretation(latest.id), latestInterpretation(previous.id)]);
    return { latest, previous, latestData, previousData };
  });
}
