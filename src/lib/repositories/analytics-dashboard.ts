import { withTenant } from "@/lib/db";

/**
 * Consultas de agregação pro "Painel de análises" (cartões de estatística +
 * gráficos). Mesma disciplina do resto do repositório: todo número vem de
 * uma consulta real, sempre filtrada pelo tenant da sessão (RLS via
 * `withTenant`) -- nada aqui inventa ou aproxima valor. Quando não há dado
 * suficiente pra calcular algo (ex.: nenhuma interpretação ainda), a
 * resposta é uma lista vazia / `null`, nunca um número "de exemplo".
 *
 * "Fora de faixa" é decidido pelo mesmo vocabulário de rótulo já usado em
 * `src/lib/classification-colors.ts` (adequado/ideal/ótimo/suficiente) --
 * não duplica a lógica, só espelha a mesma lista de palavras em SQL, porque
 * a classificação já vem pronta em `interpretations.structured_output`
 * (JSONB) e não faz sentido reprocessar via TypeScript aqui.
 */

export type AnalyticsFilters = { clientId?: string; propertyId?: string; cropSeasonId?: string };

export type DefaultSeasonContext = { cropSeasonId: string; fieldId: string; fieldName: string; seasonLabel: string };

/**
 * Safra mais recente com pelo menos um resultado de laboratório persistido
 * -- usada como recorte padrão pros dois gráficos que exigem UMA safra
 * (faixa de suficiência é por cultura, não dá pra misturar). `null` quando
 * o tenant ainda não tem nenhum resultado importado -- o painel mostra
 * estado vazio nesse caso, nunca inventa uma safra de exemplo.
 */
export async function getDefaultSeasonContext(tenantId: string, userId?: string): Promise<DefaultSeasonContext | null> {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<DefaultSeasonContext>(
      `SELECT cs.id::text AS "cropSeasonId", f.id::text AS "fieldId", f.name AS "fieldName", cs.season_label AS "seasonLabel"
       FROM lab_results lr
       JOIN lab_samples ls ON ls.id = lr.lab_sample_id
       JOIN analyses a ON a.id = ls.analysis_id
       JOIN crop_seasons cs ON cs.id = a.crop_season_id
       JOIN fields f ON f.id = cs.field_id
       WHERE a.tenant_id = $1::uuid
       ORDER BY a.created_at DESC
       LIMIT 1`,
      [tenantId],
    );
    return result.rows[0] ?? null;
  });
}

export type AnalyticsStats = {
  reportsInPeriod: number;
  avgConfidence: number | null;
  pointsWithCompleteData: number;
  pointsTotal: number;
  parametersOutOfRange: number;
  awaitingReview: number;
};

const ADEQUATE_LABEL_PATTERN = "adequad|ideal|[oó]timo|suficiente|^normal$|^m[eé]dio$";

/** CTE compartilhada: só a revisão mais recente de cada análise, escopada pelos mesmos filtros do painel executivo. */
const SCOPED_LATEST_INTERPRETATION_CTE = `
  scoped_fields AS (
    SELECT f.id, f.name AS field_name
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
  latest_interpretation AS (
    SELECT DISTINCT ON (i.analysis_id) i.*
    FROM interpretations i
    WHERE i.analysis_id IN (SELECT id FROM scoped_analyses)
    ORDER BY i.analysis_id, i.revision DESC
  )
`;

export async function getAnalyticsStats(tenantId: string, filters: AnalyticsFilters, userId?: string): Promise<AnalyticsStats> {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `WITH ${SCOPED_LATEST_INTERPRETATION_CTE},
       scoped_points AS (
         SELECT sp.* FROM sample_points sp
         JOIN collection_orders co ON co.id = sp.collection_order_id
         WHERE co.crop_season_id IN (SELECT id FROM scoped_seasons)
       ),
       out_of_range AS (
         SELECT li.analysis_id, item->>'parameterCode' AS parameter_code
         FROM latest_interpretation li, jsonb_array_elements(li.structured_output->'interpretation') AS item
         WHERE (item->>'interpretable')::boolean IS TRUE
           AND (item->>'classification') !~* $4
       )
       SELECT
         (SELECT count(*)::int FROM scoped_analyses WHERE status NOT IN ('DRAFT')) AS "reportsInPeriod",
         (SELECT avg(confidence_score)::float8 FROM scoped_analyses WHERE confidence_score IS NOT NULL) AS "avgConfidence",
         (SELECT count(*)::int FROM scoped_points WHERE collected_at IS NOT NULL) AS "pointsWithCompleteData",
         (SELECT count(*)::int FROM scoped_points) AS "pointsTotal",
         (SELECT count(DISTINCT (analysis_id, parameter_code))::int FROM out_of_range) AS "parametersOutOfRange",
         (SELECT count(*)::int FROM scoped_analyses WHERE status = 'AWAITING_REVIEW') AS "awaitingReview"
      `,
      [filters.clientId ?? null, filters.propertyId ?? null, filters.cropSeasonId ?? null, ADEQUATE_LABEL_PATTERN],
    );
    return result.rows[0] as AnalyticsStats;
  });
}

export type StatusBucket = { status: string; count: number };

/** Distribuição real de `analyses.status` -- rótulos são os estados de verdade do fluxo, não uma categoria inventada pra bater com um mockup. */
export async function getAnalysisStatusDistribution(tenantId: string, filters: AnalyticsFilters, userId?: string): Promise<StatusBucket[]> {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `WITH ${SCOPED_LATEST_INTERPRETATION_CTE}
       SELECT status::text AS status, count(*)::int AS count
       FROM scoped_analyses
       GROUP BY status
       ORDER BY count DESC`,
      [filters.clientId ?? null, filters.propertyId ?? null, filters.cropSeasonId ?? null, ADEQUATE_LABEL_PATTERN],
    );
    return result.rows;
  });
}

export type FieldConfidenceRank = { fieldId: string; fieldName: string; avgConfidence: number; analysisCount: number };

export async function getFieldConfidenceRanking(tenantId: string, filters: AnalyticsFilters, userId?: string): Promise<FieldConfidenceRank[]> {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `WITH ${SCOPED_LATEST_INTERPRETATION_CTE}
       SELECT sf.id::text AS "fieldId", sf.field_name AS "fieldName",
              avg(sa.confidence_score)::float8 AS "avgConfidence", count(sa.id)::int AS "analysisCount"
       FROM scoped_analyses sa
       JOIN scoped_seasons ss ON ss.id = sa.crop_season_id
       JOIN scoped_fields sf ON sf.id = ss.field_id
       WHERE sa.confidence_score IS NOT NULL
       GROUP BY sf.id, sf.field_name
       ORDER BY "avgConfidence" DESC
       LIMIT 8`,
      [filters.clientId ?? null, filters.propertyId ?? null, filters.cropSeasonId ?? null, ADEQUATE_LABEL_PATTERN],
    );
    return result.rows;
  });
}

export type ParameterAverage = {
  parameterCode: string;
  avgValue: number;
  unit: string;
  sampleCount: number;
  sufficiencyRanges: Array<{ label: string; min?: number; max?: number }> | null;
};

/**
 * Média de valor medido por parâmetro, só faz sentido escopada a UMA safra
 * (cada cultura tem faixa de suficiência própria) -- por isso exige
 * `cropSeasonId`, diferente das outras consultas desta tela que aceitam
 * filtro opcional. `sufficiencyRanges` vem do `crop_profile_parameters` da
 * cultura vinculada, tipo de amostra SOLO (o gráfico de barras da tela é
 * sobre resultado de solo); `null` quando não há faixa homologada pra
 * aquele parâmetro -- o componente de gráfico deve mostrar a barra sem
 * faixa de referência nesse caso, nunca inventar uma.
 */
export async function getParameterAveragesForSeason(tenantId: string, cropSeasonId: string, userId?: string): Promise<ParameterAverage[]> {
  return withTenant({ tenantId, userId }, async (client) => {
    const cropProfileResult = await client.query<{ cropProfileId: string | null }>(
      `SELECT crop_profile_id::text AS "cropProfileId" FROM crop_seasons WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, cropSeasonId],
    );
    const cropProfileId = cropProfileResult.rows[0]?.cropProfileId ?? null;

    const averagesResult = await client.query<{ parameterCode: string; avgValue: number; unit: string; sampleCount: number }>(
      `SELECT lr.parameter_code AS "parameterCode", avg(lr.numeric_value)::float8 AS "avgValue",
              mode() WITHIN GROUP (ORDER BY lr.unit) AS unit, count(*)::int AS "sampleCount"
       FROM lab_results lr
       JOIN lab_samples ls ON ls.id = lr.lab_sample_id
       JOIN analyses a ON a.id = ls.analysis_id
       WHERE a.tenant_id = $1::uuid AND a.crop_season_id = $2::uuid AND lr.source = 'MEASURED'
       GROUP BY lr.parameter_code
       ORDER BY "sampleCount" DESC, "parameterCode"`,
      [tenantId, cropSeasonId],
    );

    let bandsByParameter = new Map<string, ParameterAverage["sufficiencyRanges"]>();
    if (cropProfileId) {
      const bandsResult = await client.query<{ parameterCode: string; sufficiencyRanges: ParameterAverage["sufficiencyRanges"] }>(
        `SELECT parameter_code AS "parameterCode", sufficiency_ranges AS "sufficiencyRanges"
         FROM crop_profile_parameters
         WHERE crop_profile_id = $1::uuid AND sample_type = 'SOLO' AND status = 'ACTIVE'
         ORDER BY parameter_code`,
        [cropProfileId],
      );
      bandsByParameter = new Map(bandsResult.rows.map((row) => [row.parameterCode, row.sufficiencyRanges]));
    }

    return averagesResult.rows.map((row) => ({ ...row, sufficiencyRanges: bandsByParameter.get(row.parameterCode) ?? null }));
  });
}

export type ParameterHistoryPoint = { analysisId: string; createdAt: string; seasonLabel: string; value: number; unit: string };

/** Histórico de um parâmetro (ex.: PH) num talhão específico, últimas N análises -- pro gráfico de linha "Evolução". */
export async function getParameterHistoryForField(tenantId: string, fieldId: string, parameterCode: string, limit = 6, userId?: string): Promise<ParameterHistoryPoint[]> {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<ParameterHistoryPoint>(
      `SELECT a.id::text AS "analysisId", a.created_at::text AS "createdAt", cs.season_label AS "seasonLabel",
              avg(lr.numeric_value)::float8 AS value, mode() WITHIN GROUP (ORDER BY lr.unit) AS unit
       FROM lab_results lr
       JOIN lab_samples ls ON ls.id = lr.lab_sample_id
       JOIN analyses a ON a.id = ls.analysis_id
       JOIN crop_seasons cs ON cs.id = a.crop_season_id
       WHERE a.tenant_id = $1::uuid AND cs.field_id = $2::uuid AND lr.parameter_code = $3 AND lr.source = 'MEASURED'
       GROUP BY a.id, a.created_at, cs.season_label
       ORDER BY a.created_at DESC
       LIMIT $4`,
      [tenantId, fieldId, parameterCode, limit],
    );
    return result.rows.reverse();
  });
}
