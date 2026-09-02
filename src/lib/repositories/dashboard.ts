import { withTenant } from "@/lib/db";

export type DashboardSnapshot = {
  activeAnalyses: number;
  awaitingReview: number;
  inconsistent: number;
  collectedPoints: number;
  clients: number;
};

export async function getDashboardSnapshot(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<DashboardSnapshot>(
      `SELECT
        (SELECT count(*)::int FROM analyses WHERE status NOT IN ('ARCHIVED','REPORT_SENT')) AS "activeAnalyses",
        (SELECT count(*)::int FROM analyses WHERE status = 'AWAITING_REVIEW') AS "awaitingReview",
        (SELECT count(*)::int FROM analyses WHERE status = 'INCONSISTENT') AS inconsistent,
        (SELECT count(*)::int FROM sample_points WHERE collected_at IS NOT NULL) AS "collectedPoints",
        (SELECT count(*)::int FROM clients) AS clients`,
    );
    return result.rows[0];
  });
}

export type ExecutiveDashboard = {
  clients: number;
  properties: number;
  totalAreaHa: number;
  fields: number;
  seasonsInProgress: number;
  openOrders: number;
  totalPoints: number;
  collectedPoints: number;
  coveragePct: number;
  labsProcessed: number;
  interpretationsPending: number;
  criticalFields: number;
  avgConfidence: number | null;
};

export type ExecutiveDashboardFilters = {
  clientId?: string;
  propertyId?: string;
  cropSeasonId?: string;
};

/**
 * Painel executivo: cada número vem de uma agregação real, sempre filtrável
 * pelo mesmo tenant da sessão (RLS + app.tenant_id). Filtros opcionais
 * restringem por cliente/propriedade/safra sem trocar a fonte do dado.
 */
export async function getExecutiveDashboard(tenantId: string, filters: ExecutiveDashboardFilters, userId?: string): Promise<ExecutiveDashboard> {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<ExecutiveDashboard>(
      `WITH scoped_fields AS (
         SELECT f.id, f.area_ha
         FROM fields f
         JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
         WHERE ($1::uuid IS NULL OR p.client_id = $1::uuid)
           AND ($2::uuid IS NULL OR p.id = $2::uuid)
       ),
       scoped_seasons AS (
         SELECT cs.id, cs.field_id, cs.crop_profile_id
         FROM crop_seasons cs
         WHERE cs.field_id IN (SELECT id FROM scoped_fields)
           AND ($3::uuid IS NULL OR cs.id = $3::uuid)
       ),
       scoped_analyses AS (
         SELECT a.* FROM analyses a WHERE a.crop_season_id IN (SELECT id FROM scoped_seasons)
       ),
       scoped_points AS (
         SELECT sp.* FROM sample_points sp
         JOIN collection_orders co ON co.id = sp.collection_order_id
         WHERE co.crop_season_id IN (SELECT id FROM scoped_seasons)
       )
       SELECT
         (SELECT count(*)::int FROM clients WHERE ($1::uuid IS NULL OR id = $1::uuid)) AS clients,
         (SELECT count(DISTINCT p.id)::int FROM properties p WHERE ($1::uuid IS NULL OR p.client_id = $1::uuid) AND ($2::uuid IS NULL OR p.id = $2::uuid)) AS properties,
         (SELECT coalesce(sum(area_ha), 0)::float8 FROM scoped_fields) AS "totalAreaHa",
         (SELECT count(*)::int FROM scoped_fields) AS fields,
         (SELECT count(*)::int FROM scoped_seasons) AS "seasonsInProgress",
         (SELECT count(*)::int FROM collection_orders WHERE crop_season_id IN (SELECT id FROM scoped_seasons) AND status IN ('PLANNED','IN_PROGRESS')) AS "openOrders",
         (SELECT count(*)::int FROM scoped_points) AS "totalPoints",
         (SELECT count(*)::int FROM scoped_points WHERE collected_at IS NOT NULL) AS "collectedPoints",
         (SELECT count(*)::int FROM scoped_analyses WHERE status NOT IN ('DRAFT')) AS "labsProcessed",
         (SELECT count(*)::int FROM interpretations WHERE status = 'IN_REVIEW' AND analysis_id IN (SELECT id FROM scoped_analyses)) AS "interpretationsPending",
         (SELECT count(DISTINCT cs.field_id)::int FROM scoped_analyses a JOIN crop_seasons cs ON cs.id = a.crop_season_id WHERE a.status = 'INCONSISTENT') AS "criticalFields",
         (SELECT avg(confidence_score)::float8 FROM scoped_analyses WHERE confidence_score IS NOT NULL) AS "avgConfidence"
      `,
      [filters.clientId ?? null, filters.propertyId ?? null, filters.cropSeasonId ?? null],
    );
    const row = result.rows[0] as any;
    const coveragePct = row.totalPoints > 0 ? Math.round((row.collectedPoints / row.totalPoints) * 100) : 0;
    return { ...row, coveragePct };
  });
}

export type FilterOptions = {
  clients: Array<{ id: string; name: string }>;
  properties: Array<{ id: string; name: string; clientId: string }>;
  seasons: Array<{ id: string; seasonLabel: string; fieldId: string }>;
};

export async function getDashboardFilterOptions(tenantId: string, userId?: string): Promise<FilterOptions> {
  return withTenant({ tenantId, userId }, async (client) => {
    const [clients, properties, seasons] = await Promise.all([
      client.query(`SELECT id::text, name FROM clients ORDER BY name`),
      client.query(`SELECT id::text, name, client_id::text AS "clientId" FROM properties ORDER BY name`),
      client.query(`SELECT id::text, season_label AS "seasonLabel", field_id::text AS "fieldId" FROM crop_seasons ORDER BY created_at DESC`),
    ]);
    return { clients: clients.rows, properties: properties.rows, seasons: seasons.rows };
  });
}
