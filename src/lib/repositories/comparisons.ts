import type { PoolClient } from "pg";
import { evaluateAnalysisEvidenceFreshness } from "@/domain/analysis-evidence-freshness";
import { buildParameterComparisonRows, type ComparisonMeasurementAggregate, type ParameterComparisonRow } from "@/domain/comparison-compatibility";
import { withTenant } from "@/lib/db";

/** Comparações usam o domínio puro de compatibilidade; este repositório só resolve escopo/dados reais. */
export type { ParameterComparisonRow } from "@/domain/comparison-compatibility";

function classificationsFromStructuredOutput(structuredOutput: any): Map<string, string> {
  const byParameter = new Map<string, Set<string>>();
  for (const item of structuredOutput?.interpretation ?? []) {
    if (!item.interpretable || !item.classification) continue;
    const classes = byParameter.get(item.parameterCode) ?? new Set<string>();
    classes.add(String(item.classification));
    byParameter.set(item.parameterCode, classes);
  }
  const map = new Map<string, string>();
  for (const [parameterCode, classes] of byParameter) {
    if (classes.size === 1) map.set(parameterCode, [...classes][0]);
  }
  return map;
}

type AnalysisScope = { id: string };

async function latestAnalysisForField(client: PoolClient, tenantId: string, fieldId: string): Promise<AnalysisScope | null> {
  const result = await client.query(
    `SELECT a.id::text
     FROM analyses a
     JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
     WHERE a.tenant_id = $1::uuid AND cs.field_id = $2::uuid
       AND EXISTS (
         SELECT 1
         FROM lab_samples ls
         JOIN lab_results lr ON lr.tenant_id = ls.tenant_id AND lr.lab_sample_id = ls.id
         WHERE ls.tenant_id = a.tenant_id AND ls.analysis_id = a.id AND lr.numeric_value IS NOT NULL
       )
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT 1`,
    [tenantId, fieldId],
  );
  return result.rows[0] ?? null;
}

async function latestAnalysisForSeason(client: PoolClient, tenantId: string, seasonId: string): Promise<AnalysisScope | null> {
  const result = await client.query(
    `SELECT a.id::text, a.collection_order_id::text AS "collectionOrderId"
     FROM analyses a
     WHERE a.tenant_id = $1::uuid AND a.crop_season_id = $2::uuid
       AND EXISTS (
         SELECT 1
         FROM lab_samples ls
         JOIN lab_results lr ON lr.tenant_id = ls.tenant_id AND lr.lab_sample_id = ls.id
         WHERE ls.tenant_id = a.tenant_id AND ls.analysis_id = a.id AND lr.numeric_value IS NOT NULL
       )
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT 1`,
    [tenantId, seasonId],
  );
  return result.rows[0] ?? null;
}

async function aggregateParametersByAnalysis(client: PoolClient, tenantId: string, analysisId: string | null): Promise<Map<string, ComparisonMeasurementAggregate>> {
  if (!analysisId) return new Map();
  const result = await client.query(
    `SELECT lr.parameter_code AS "parameterCode", count(*)::int AS n, avg(lr.numeric_value)::float8 AS avg,
            array_remove(array_agg(DISTINCT lr.unit), NULL) AS units,
            array_remove(array_agg(DISTINCT lr.analytical_method), NULL) AS methods,
            array_remove(array_agg(DISTINCT ls.sample_type), NULL) AS "sampleTypes",
            coalesce(
              array_agg(DISTINCT jsonb_build_object('from', sp.depth_from_cm::float8, 'to', sp.depth_to_cm::float8))
                FILTER (WHERE sp.depth_from_cm IS NOT NULL AND sp.depth_to_cm IS NOT NULL),
              ARRAY[]::jsonb[]
            ) AS depths
     FROM lab_samples ls
     JOIN lab_results lr ON lr.tenant_id = ls.tenant_id AND lr.lab_sample_id = ls.id
     LEFT JOIN sample_points sp ON sp.tenant_id = ls.tenant_id AND sp.id = ls.sample_point_id
     WHERE ls.tenant_id = $1::uuid AND ls.analysis_id = $2::uuid
     GROUP BY lr.parameter_code`,
    [tenantId, analysisId],
  );
  return new Map(result.rows.map((row: ComparisonMeasurementAggregate) => [row.parameterCode, row]));
}

async function currentApprovedInterpretationOutput(client: PoolClient, tenantId: string, analysisId: string | null): Promise<any | null> {
  if (!analysisId) return null;
  const result = await client.query<{
    status: string | null;
    structuredOutput: unknown;
    interpretationCreatedAt: string | null;
    interpretationCropProfileId: string | null;
    currentCropProfileId: string | null;
    latestImportCommittedAt: string | null;
    latestRuleUpdatedAt: string | null;
  }>(
    `SELECT li.status::text AS status,
            li.structured_output AS "structuredOutput",
            li.created_at::text AS "interpretationCreatedAt",
            li.crop_profile_id::text AS "interpretationCropProfileId",
            cs.crop_profile_id::text AS "currentCropProfileId",
            latest_import.latest_import_at::text AS "latestImportCommittedAt",
            rule_state.latest_rule_updated_at::text AS "latestRuleUpdatedAt"
     FROM analyses a
     JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
     LEFT JOIN crop_profiles cp ON cp.id = cs.crop_profile_id
     LEFT JOIN LATERAL (
       SELECT i.status, i.structured_output, i.created_at, i.crop_profile_id
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
     WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid
     LIMIT 1`,
    [tenantId, analysisId],
  );
  const row = result.rows[0];
  if (!row || row.status !== "APPROVED") return null;
  const freshness = evaluateAnalysisEvidenceFreshness({
    interpretationCreatedAt: row.interpretationCreatedAt,
    latestImportCommittedAt: row.latestImportCommittedAt,
    interpretationCropProfileId: row.interpretationCropProfileId,
    currentCropProfileId: row.currentCropProfileId,
    latestRuleUpdatedAt: row.latestRuleUpdatedAt,
  });
  return freshness.current ? row.structuredOutput : null;
}

async function currentApprovedClassificationsForAnalysis(client: PoolClient, tenantId: string, analysisId: string | null): Promise<Map<string, string>> {
  return classificationsFromStructuredOutput(await currentApprovedInterpretationOutput(client, tenantId, analysisId));
}

export async function compareFields(tenantId: string, fieldIdA: string, fieldIdB: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const fieldsResult = await client.query(
      `SELECT id::text, name, ST_AsGeoJSON(boundary)::json AS boundary FROM fields WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])`,
      [tenantId, [fieldIdA, fieldIdB]],
    );
    const fieldA = fieldsResult.rows.find((row: any) => row.id === fieldIdA);
    const fieldB = fieldsResult.rows.find((row: any) => row.id === fieldIdB);
    const [analysisA, analysisB] = await Promise.all([
      latestAnalysisForField(client, tenantId, fieldIdA),
      latestAnalysisForField(client, tenantId, fieldIdB),
    ]);
    const [aggA, aggB, classA, classB] = await Promise.all([
      aggregateParametersByAnalysis(client, tenantId, analysisA?.id ?? null),
      aggregateParametersByAnalysis(client, tenantId, analysisB?.id ?? null),
      currentApprovedClassificationsForAnalysis(client, tenantId, analysisA?.id ?? null),
      currentApprovedClassificationsForAnalysis(client, tenantId, analysisB?.id ?? null),
    ]);
    const rows = buildParameterComparisonRows(aggA, aggB, classA, classB);
    return {
      labelA: fieldA?.name ?? "—",
      labelB: fieldB?.name ?? "—",
      rows,
      boundaryA: fieldA?.boundary ?? null,
      boundaryB: fieldB?.boundary ?? null,
      analysisIdA: analysisA?.id ?? null,
      analysisIdB: analysisB?.id ?? null,
    };
  });
}

export async function compareSeasons(tenantId: string, seasonIdA: string, seasonIdB: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const seasonsResult = await client.query(
      `SELECT cs.id::text, cs.season_label AS label, f.name AS "fieldName" FROM crop_seasons cs
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       WHERE cs.tenant_id = $1::uuid AND cs.id = ANY($2::uuid[])`,
      [tenantId, [seasonIdA, seasonIdB]],
    );
    const seasonA = seasonsResult.rows.find((row: any) => row.id === seasonIdA);
    const seasonB = seasonsResult.rows.find((row: any) => row.id === seasonIdB);
    const [analysisA, analysisB] = await Promise.all([
      latestAnalysisForSeason(client, tenantId, seasonIdA),
      latestAnalysisForSeason(client, tenantId, seasonIdB),
    ]);
    const [aggA, aggB, classA, classB] = await Promise.all([
      aggregateParametersByAnalysis(client, tenantId, analysisA?.id ?? null),
      aggregateParametersByAnalysis(client, tenantId, analysisB?.id ?? null),
      currentApprovedClassificationsForAnalysis(client, tenantId, analysisA?.id ?? null),
      currentApprovedClassificationsForAnalysis(client, tenantId, analysisB?.id ?? null),
    ]);
    const rows = buildParameterComparisonRows(aggA, aggB, classA, classB);
    return {
      labelA: seasonA ? seasonA.fieldName + " · " + seasonA.label : "—",
      labelB: seasonB ? seasonB.fieldName + " · " + seasonB.label : "—",
      rows,
      analysisIdA: analysisA?.id ?? null,
      analysisIdB: analysisB?.id ?? null,
    };
  });
}

export async function comparePoints(tenantId: string, pointIdA: string, pointIdB: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    async function pointScope(pointId: string): Promise<{ code: string; fieldName: string; analysisId: string | null } | null> {
      const pointResult = await client.query(
        `SELECT sp.id::text, sp.code, f.name AS "fieldName", latest_analysis.id::text AS "analysisId"
         FROM sample_points sp
         JOIN collection_orders co ON co.tenant_id = sp.tenant_id AND co.id = sp.collection_order_id
         JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
         JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
         LEFT JOIN LATERAL (
           SELECT a.id
           FROM analyses a
           WHERE a.tenant_id = sp.tenant_id AND a.collection_order_id = sp.collection_order_id
           ORDER BY a.created_at DESC, a.id DESC
           LIMIT 1
         ) latest_analysis ON true
         WHERE sp.tenant_id = $1::uuid AND sp.id = $2::uuid`,
        [tenantId, pointId],
      );
      return pointResult.rows[0] ?? null;
    }

    async function pointResults(pointId: string, analysisId: string | null) {
      if (!analysisId) return [];
      const result = await client.query(
        `SELECT lr.parameter_code AS "parameterCode", lr.numeric_value::float8 AS value, lr.unit, lr.analytical_method AS method,
                ls.sample_type AS "sampleType", sp.depth_from_cm::float8 AS "depthFromCm", sp.depth_to_cm::float8 AS "depthToCm"
         FROM lab_samples ls
         JOIN lab_results lr ON lr.tenant_id = ls.tenant_id AND lr.lab_sample_id = ls.id
         JOIN sample_points sp ON sp.tenant_id = ls.tenant_id AND sp.id = ls.sample_point_id
         WHERE ls.tenant_id = $1::uuid AND ls.sample_point_id = $2::uuid AND ls.analysis_id = $3::uuid
         ORDER BY lr.parameter_code`,
        [tenantId, pointId, analysisId],
      );
      return result.rows;
    }

    async function pointClassifications(analysisId: string | null, pointCode: string): Promise<Map<string, string>> {
      const structured = await currentApprovedInterpretationOutput(client, tenantId, analysisId);
      const map = new Map<string, string>();
      for (const item of structured?.interpretation ?? []) {
        if (item.sampleCode === pointCode && item.interpretable && item.classification) map.set(item.parameterCode, item.classification);
      }
      return map;
    }

    const [pointA, pointB] = await Promise.all([pointScope(pointIdA), pointScope(pointIdB)]);
    if (!pointA || !pointB) return { pointA, pointB, rows: [] as ParameterComparisonRow[] };
    const [resultsA, resultsB, classA, classB] = await Promise.all([
      pointResults(pointIdA, pointA.analysisId),
      pointResults(pointIdB, pointB.analysisId),
      pointClassifications(pointA.analysisId, pointA.code),
      pointClassifications(pointB.analysisId, pointB.code),
    ]);
    const aggA = new Map<string, ComparisonMeasurementAggregate>(resultsA.map((row: any) => [row.parameterCode, {
      parameterCode: row.parameterCode, n: 1, avg: row.value, units: [row.unit].filter(Boolean), methods: [row.method].filter(Boolean),
      sampleTypes: [row.sampleType].filter(Boolean), depths: row.depthFromCm != null && row.depthToCm != null ? [{ from: row.depthFromCm, to: row.depthToCm }] : [],
    }]));
    const aggB = new Map<string, ComparisonMeasurementAggregate>(resultsB.map((row: any) => [row.parameterCode, {
      parameterCode: row.parameterCode, n: 1, avg: row.value, units: [row.unit].filter(Boolean), methods: [row.method].filter(Boolean),
      sampleTypes: [row.sampleType].filter(Boolean), depths: row.depthFromCm != null && row.depthToCm != null ? [{ from: row.depthFromCm, to: row.depthToCm }] : [],
    }]));
    const rows = buildParameterComparisonRows(aggA, aggB, classA, classB);
    return { pointA, pointB, rows };
  });
}

export async function compareProperties(tenantId: string, propertyIdA: string, propertyIdB: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    async function summary(propertyId: string) {
      const result = await client.query(
        `SELECT p.name,
                (SELECT count(*)::int FROM fields WHERE tenant_id = p.tenant_id AND property_id = p.id) AS fields,
                (SELECT coalesce(sum(area_ha),0)::float8 FROM fields WHERE tenant_id = p.tenant_id AND property_id = p.id) AS "totalAreaHa",
                (SELECT avg(a.confidence_score)::float8 FROM analyses a
                   JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
                   JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
                   WHERE f.property_id = p.id AND a.confidence_score IS NOT NULL) AS "avgConfidence",
                (SELECT count(*)::int FROM sample_points sp
                   JOIN collection_orders co ON co.tenant_id = sp.tenant_id AND co.id = sp.collection_order_id
                   JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
                   JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
                   WHERE f.property_id = p.id) AS "totalPoints",
                (SELECT count(*)::int FROM sample_points sp
                   JOIN collection_orders co ON co.tenant_id = sp.tenant_id AND co.id = sp.collection_order_id
                   JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
                   JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
                   WHERE f.property_id = p.id AND sp.collected_at IS NOT NULL) AS "collectedPoints"
         FROM properties p WHERE p.tenant_id = $1::uuid AND p.id = $2::uuid`,
        [tenantId, propertyId],
      );
      return result.rows[0] ?? null;
    }
    const [summaryA, summaryB] = await Promise.all([summary(propertyIdA), summary(propertyIdB)]);
    return { summaryA, summaryB };
  });
}
