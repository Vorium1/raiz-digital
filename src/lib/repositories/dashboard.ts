import { withTenant } from "@/lib/db";

export type DashboardSnapshot = {
  activeAnalyses: number;
  awaitingReview: number;
  inconsistent: number;
  collectedPoints: number;
  clients: number;
};

/**
 * `clientId` é opcional -- quando ausente, mantém o comportamento antigo (carteira inteira), usado pelo
 * layout (badge global do menu). O dashboard passa o cliente filtrado na tela, corrigindo um bug real
 * confirmado na auditoria (item A): antes esta consulta ignorava o filtro de cliente selecionado, mesmo
 * aparecendo visualmente na mesma tela que o painel executivo (que já respeitava o filtro).
 */
export async function getDashboardSnapshot(tenantId: string, userId?: string, clientId?: string | null) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<DashboardSnapshot>(
      `SELECT
        (SELECT count(*)::int FROM analyses a JOIN crop_seasons cs ON cs.id = a.crop_season_id JOIN fields f ON f.id = cs.field_id JOIN properties p ON p.id = f.property_id WHERE a.status NOT IN ('ARCHIVED','REPORT_SENT') AND ($1::uuid IS NULL OR p.client_id = $1::uuid)) AS "activeAnalyses",
        (SELECT count(*)::int FROM analyses a JOIN crop_seasons cs ON cs.id = a.crop_season_id JOIN fields f ON f.id = cs.field_id JOIN properties p ON p.id = f.property_id WHERE a.status = 'AWAITING_REVIEW' AND ($1::uuid IS NULL OR p.client_id = $1::uuid)) AS "awaitingReview",
        (SELECT count(*)::int FROM analyses a JOIN crop_seasons cs ON cs.id = a.crop_season_id JOIN fields f ON f.id = cs.field_id JOIN properties p ON p.id = f.property_id WHERE a.status = 'INCONSISTENT' AND ($1::uuid IS NULL OR p.client_id = $1::uuid)) AS inconsistent,
        (SELECT count(*)::int FROM sample_points sp JOIN collection_orders co ON co.id = sp.collection_order_id JOIN crop_seasons cs ON cs.id = co.crop_season_id JOIN fields f ON f.id = cs.field_id JOIN properties p ON p.id = f.property_id WHERE sp.collected_at IS NOT NULL AND ($1::uuid IS NULL OR p.client_id = $1::uuid)) AS "collectedPoints",
        (SELECT count(*)::int FROM clients WHERE ($1::uuid IS NULL OR id = $1::uuid)) AS clients`,
      [clientId ?? null],
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
         (SELECT avg(confidence_score)::float8 FROM scoped_analyses WHERE confidence_score IS NOT NULL) AS "avgConfidence",
         -- Análises com parâmetro aguardando homologação (motor rodou e não achou nada interpretável)
         -- desaparecem de "interpretationsPending" (não é IN_REVIEW) e de "criticalFields" (não é
         -- INCONSISTENT) -- ficavam invisíveis no painel principal, só apareciam como alerta de baixa
         -- prioridade em /alertas. Achado real confirmado na auditoria (item B). "Não avaliado" nunca deve
         -- virar silêncio na tela -- por isso ganha indicador próprio, nunca contado como "tudo OK".
         (SELECT count(*)::int FROM scoped_analyses a WHERE EXISTS (
            SELECT 1 FROM interpretations i WHERE i.analysis_id = a.id AND i.status = 'CALCULATED' AND i.not_interpretable_reason IS NOT NULL
              AND i.revision = (SELECT max(i2.revision) FROM interpretations i2 WHERE i2.analysis_id = a.id)
         )) AS "notInterpretableCount"
      `,
      [filters.clientId ?? null, filters.propertyId ?? null, filters.cropSeasonId ?? null],
    );
    const row = result.rows[0] as any;
    const coveragePct = row.totalPoints > 0 ? Math.round((row.collectedPoints / row.totalPoints) * 100) : 0;
    return { ...row, coveragePct };
  });
}

export type PortfolioFieldSummary = {
  id: string; name: string; boundary: unknown; clientName: string; propertyName: string;
  plannedPoints: number; collectedPoints: number;
  /** Status real de avaliação, nunca "saudável" pra área não avaliada (achado real da auditoria, item B) --
   * ver `evaluationTone` no componente do mapa pra saber como cada valor vira cor. */
  evaluationStatus: "SEM_ANALISE" | "NAO_INTERPRETAVEL" | "EM_ANDAMENTO" | "APROVADO";
};

/**
 * Um talhão, uma linha -- consulta agregada única (nunca uma consulta por talhão; pedido explícito do
 * briefing pra Central de Decisão). Mesmo filtro de cliente/propriedade/safra do resto do painel
 * (`getExecutiveDashboard`), pra respeitar a regra de "todos os blocos com o mesmo filtro".
 */
export async function getPortfolioFieldSummaries(tenantId: string, filters: ExecutiveDashboardFilters, userId?: string): Promise<PortfolioFieldSummary[]> {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `WITH scoped_fields AS (
         -- ::jsonb (não ::json) -- GROUP BY abaixo precisa comparar igualdade, e o tipo json puro do
         -- Postgres não tem operador de igualdade (erro real encontrado testando: "could not identify an
         -- equality operator for type json"). jsonb tem, e serializa pro cliente exatamente igual.
         SELECT f.id, f.name, ST_AsGeoJSON(f.boundary)::jsonb AS boundary, p.name AS "propertyName", c.name AS "clientName"
         FROM fields f
         JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
         JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
         WHERE ($1::uuid IS NULL OR p.client_id = $1::uuid) AND ($2::uuid IS NULL OR p.id = $2::uuid)
       ),
       scoped_seasons AS (
         SELECT cs.id, cs.field_id FROM crop_seasons cs
         WHERE cs.field_id IN (SELECT id FROM scoped_fields) AND ($3::uuid IS NULL OR cs.id = $3::uuid)
       ),
       scoped_points AS (
         SELECT sp.*, cs.field_id FROM sample_points sp
         JOIN collection_orders co ON co.id = sp.collection_order_id
         JOIN scoped_seasons cs ON cs.id = co.crop_season_id
       ),
       scoped_analyses AS (
         SELECT a.id, a.crop_season_id, cs.field_id,
                li.status AS latest_interpretation_status, li.not_interpretable_reason
         FROM analyses a
         JOIN scoped_seasons cs ON cs.id = a.crop_season_id
         LEFT JOIN LATERAL (
           SELECT status, not_interpretable_reason FROM interpretations
           WHERE interpretations.analysis_id = a.id ORDER BY revision DESC LIMIT 1
         ) li ON true
       )
       SELECT sf.id::text, sf.name, sf.boundary, sf."clientName", sf."propertyName",
              count(sp.*)::int AS "plannedPoints", count(sp.*) FILTER (WHERE sp.collected_at IS NOT NULL)::int AS "collectedPoints",
              CASE
                WHEN count(sa.id) = 0 THEN 'SEM_ANALISE'
                WHEN count(sa.id) FILTER (WHERE sa.latest_interpretation_status = 'APPROVED') = count(sa.id) THEN 'APROVADO'
                WHEN count(sa.id) FILTER (WHERE sa.latest_interpretation_status = 'CALCULATED' AND sa.not_interpretable_reason IS NOT NULL) > 0 THEN 'NAO_INTERPRETAVEL'
                ELSE 'EM_ANDAMENTO'
              END AS "evaluationStatus"
       FROM scoped_fields sf
       LEFT JOIN scoped_points sp ON sp.field_id = sf.id
       LEFT JOIN scoped_analyses sa ON sa.field_id = sf.id
       GROUP BY sf.id, sf.name, sf.boundary, sf."clientName", sf."propertyName"
       ORDER BY sf.name`,
      [filters.clientId ?? null, filters.propertyId ?? null, filters.cropSeasonId ?? null],
    );
    return result.rows;
  });
}

export type FilterOptions = {
  clients: Array<{ id: string; name: string }>;
  properties: Array<{ id: string; name: string; clientId: string }>;
  /** `propertyId`/`clientId` adicionados pra permitir cascata real no filtro (Fase 1: "ao trocar cliente
   * ou propriedade, limpe seleções filhas incompatíveis") -- antes a safra só sabia seu `fieldId`, sem
   * jeito de saber a qual propriedade/cliente ela pertencia sem outra consulta. */
  seasons: Array<{ id: string; seasonLabel: string; fieldId: string; propertyId: string; clientId: string }>;
};

export async function getDashboardFilterOptions(tenantId: string, userId?: string): Promise<FilterOptions> {
  return withTenant({ tenantId, userId }, async (client) => {
    const [clients, properties, seasons] = await Promise.all([
      client.query(`SELECT id::text, name FROM clients ORDER BY name`),
      client.query(`SELECT id::text, name, client_id::text AS "clientId" FROM properties ORDER BY name`),
      client.query(
        `SELECT cs.id::text, cs.season_label AS "seasonLabel", cs.field_id::text AS "fieldId",
                f.property_id::text AS "propertyId", p.client_id::text AS "clientId"
         FROM crop_seasons cs
         JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
         JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
         ORDER BY cs.created_at DESC`,
      ),
    ]);
    return { clients: clients.rows, properties: properties.rows, seasons: seasons.rows };
  });
}
