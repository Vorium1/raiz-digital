import { withTenant } from "@/lib/db";

async function latestInterpretationForField(client: any, fieldId: string) {
  const result = await client.query(
    `SELECT i.structured_output AS "structuredOutput", a.code AS "analysisCode", cs.season_label AS "seasonLabel"
     FROM interpretations i
     JOIN analyses a ON a.tenant_id = i.tenant_id AND a.id = i.analysis_id
     JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
     WHERE cs.field_id = $1::uuid
     ORDER BY i.created_at DESC LIMIT 1`,
    [fieldId],
  );
  return result.rows[0] ?? null;
}

export async function compareFields(tenantId: string, fieldIdA: string, fieldIdB: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const fieldsResult = await client.query(
      `SELECT id::text, name FROM fields WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])`,
      [tenantId, [fieldIdA, fieldIdB]],
    );
    const fieldA = fieldsResult.rows.find((row: any) => row.id === fieldIdA);
    const fieldB = fieldsResult.rows.find((row: any) => row.id === fieldIdB);
    const [dataA, dataB] = await Promise.all([latestInterpretationForField(client, fieldIdA), latestInterpretationForField(client, fieldIdB)]);
    return { labelA: fieldA?.name ?? "—", labelB: fieldB?.name ?? "—", contextA: dataA?.seasonLabel ?? null, contextB: dataB?.seasonLabel ?? null, dataA: dataA?.structuredOutput ?? null, dataB: dataB?.structuredOutput ?? null };
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
    async function latest(seasonId: string) {
      const result = await client.query(
        `SELECT i.structured_output AS "structuredOutput"
         FROM interpretations i JOIN analyses a ON a.tenant_id = i.tenant_id AND a.id = i.analysis_id
         WHERE a.crop_season_id = $1::uuid ORDER BY i.created_at DESC LIMIT 1`,
        [seasonId],
      );
      return result.rows[0]?.structuredOutput ?? null;
    }
    const seasonA = seasonsResult.rows.find((row: any) => row.id === seasonIdA);
    const seasonB = seasonsResult.rows.find((row: any) => row.id === seasonIdB);
    const [dataA, dataB] = await Promise.all([latest(seasonIdA), latest(seasonIdB)]);
    return { labelA: seasonA ? `${seasonA.fieldName} · ${seasonA.label}` : "—", labelB: seasonB ? `${seasonB.fieldName} · ${seasonB.label}` : "—", dataA, dataB };
  });
}

export async function comparePoints(tenantId: string, pointIdA: string, pointIdB: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    async function pointData(pointId: string) {
      const pointResult = await client.query(
        `SELECT sp.id::text, sp.code, sp.collection_order_id::text AS "collectionOrderId" FROM sample_points sp WHERE sp.tenant_id = $1::uuid AND sp.id = $2::uuid`,
        [tenantId, pointId],
      );
      const point = pointResult.rows[0];
      if (!point) return null;
      const resultsResult = await client.query(
        `SELECT lr.parameter_code AS "parameterCode", lr.numeric_value::float8 AS value, lr.unit
         FROM lab_samples ls JOIN lab_results lr ON lr.tenant_id = ls.tenant_id AND lr.lab_sample_id = ls.id
         WHERE ls.tenant_id = $1::uuid AND ls.sample_point_id = $2::uuid ORDER BY lr.parameter_code`,
        [tenantId, pointId],
      );
      const interpretationResult = await client.query(
        `SELECT i.structured_output AS "structuredOutput"
         FROM interpretations i JOIN analyses a ON a.tenant_id = i.tenant_id AND a.id = i.analysis_id
         WHERE a.collection_order_id = $1::uuid ORDER BY i.created_at DESC LIMIT 1`,
        [point.collectionOrderId],
      );
      const structured = interpretationResult.rows[0]?.structuredOutput as { interpretation?: Array<{ sampleCode: string; parameterCode: string; interpretable: boolean; classification?: string }> } | undefined;
      const classifications = new Map<string, string>();
      for (const item of structured?.interpretation ?? []) {
        if (item.sampleCode === point.code && item.interpretable) classifications.set(item.parameterCode, item.classification ?? "");
      }
      return { code: point.code, results: resultsResult.rows.map((row: any) => ({ ...row, classification: classifications.get(row.parameterCode) ?? null })) };
    }
    const [pointA, pointB] = await Promise.all([pointData(pointIdA), pointData(pointIdB)]);
    return { pointA, pointB };
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
