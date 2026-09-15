import { withTenant } from "@/lib/db";

/**
 * Fase 2, Bloco E: comparativos que mostram a diferença de verdade -- valor observado de cada lado,
 * diferença absoluta, classificação quando disponível, e sinalização explícita de incompatibilidade
 * (unidade, método analítico, tipo de amostra, profundidade) em vez de parear valores como se fossem o
 * mesmo tipo de medida só porque têm o mesmo código de parâmetro.
 */
export type ParameterComparisonRow = {
  parameterCode: string;
  unitA: string | null;
  unitB: string | null;
  methodsA: string[];
  methodsB: string[];
  sampleTypesA: string[];
  sampleTypesB: string[];
  depthA: { from: number; to: number } | null;
  depthB: { from: number; to: number } | null;
  nA: number;
  nB: number;
  avgA: number | null;
  avgB: number | null;
  classificationA: string | null;
  classificationB: string | null;
  comparable: boolean;
  incompatibilityReasons: string[];
  absoluteDifference: number | null;
  isPercentUnit: boolean;
};

type AggregateRow = { parameterCode: string; n: number; avg: number; units: string[]; methods: string[]; sampleTypes: string[]; depthFrom: number | null; depthTo: number | null };

function buildComparisonRows(
  aggA: Map<string, AggregateRow>,
  aggB: Map<string, AggregateRow>,
  classA: Map<string, string>,
  classB: Map<string, string>,
): ParameterComparisonRow[] {
  const codes = new Set([...aggA.keys(), ...aggB.keys()]);
  const rows: ParameterComparisonRow[] = [];
  for (const code of codes) {
    const A = aggA.get(code) ?? null;
    const B = aggB.get(code) ?? null;
    const unitsA = A?.units ?? [];
    const unitsB = B?.units ?? [];
    const methodsA = A?.methods ?? [];
    const methodsB = B?.methods ?? [];
    const sampleTypesA = A?.sampleTypes ?? [];
    const sampleTypesB = B?.sampleTypes ?? [];
    const unitA = unitsA[0] ?? null;
    const unitB = unitsB[0] ?? null;

    const reasons: string[] = [];
    if (!A) reasons.push("Sem resultado deste parâmetro no lado A.");
    if (!B) reasons.push("Sem resultado deste parâmetro no lado B.");
    if (A && B) {
      if (unitsA.length > 1 || unitsB.length > 1) reasons.push("Mais de uma unidade registrada para este parâmetro em um dos lados -- revisão de cadastro necessária antes de comparar.");
      else if (unitA !== unitB) reasons.push(`Unidades diferentes (${unitA ?? "—"} vs. ${unitB ?? "—"}).`);
      if (!methodsA.some((m) => methodsB.includes(m))) reasons.push("Nenhum método analítico em comum entre os dois lados.");
      if (!sampleTypesA.some((s) => sampleTypesB.includes(s))) reasons.push(`Tipos de amostra diferentes (${sampleTypesA.join("/")} vs. ${sampleTypesB.join("/")}).`);
      if (A.depthFrom != null && A.depthTo != null && B.depthFrom != null && B.depthTo != null) {
        const overlap = A.depthFrom < B.depthTo && B.depthFrom < A.depthTo;
        if (!overlap) reasons.push(`Profundidades sem sobreposição (${A.depthFrom}–${A.depthTo}cm vs. ${B.depthFrom}–${B.depthTo}cm).`);
      }
    }
    const comparable = reasons.length === 0;

    rows.push({
      parameterCode: code,
      unitA, unitB, methodsA, methodsB, sampleTypesA, sampleTypesB,
      depthA: A && A.depthFrom != null && A.depthTo != null ? { from: A.depthFrom, to: A.depthTo } : null,
      depthB: B && B.depthFrom != null && B.depthTo != null ? { from: B.depthFrom, to: B.depthTo } : null,
      nA: A?.n ?? 0, nB: B?.n ?? 0,
      avgA: A?.avg ?? null, avgB: B?.avg ?? null,
      classificationA: classA.get(code) ?? null, classificationB: classB.get(code) ?? null,
      comparable,
      incompatibilityReasons: reasons,
      absoluteDifference: comparable && A && B ? B.avg - A.avg : null,
      isPercentUnit: unitA === "%" || unitB === "%",
    });
  }
  return rows.sort((a, b) => a.parameterCode.localeCompare(b.parameterCode));
}

async function aggregateParametersByField(client: any, tenantId: string, fieldId: string): Promise<Map<string, AggregateRow>> {
  const result = await client.query(
    `SELECT lr.parameter_code AS "parameterCode", count(*)::int AS n, avg(lr.numeric_value)::float8 AS avg,
            array_remove(array_agg(DISTINCT lr.unit), NULL) AS units,
            array_remove(array_agg(DISTINCT lr.analytical_method), NULL) AS methods,
            array_remove(array_agg(DISTINCT ls.sample_type), NULL) AS "sampleTypes",
            min(sp.depth_from_cm)::float8 AS "depthFrom", max(sp.depth_to_cm)::float8 AS "depthTo"
     FROM sample_points sp
     JOIN collection_orders co ON co.tenant_id = sp.tenant_id AND co.id = sp.collection_order_id
     JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
     JOIN lab_samples ls ON ls.tenant_id = sp.tenant_id AND ls.sample_point_id = sp.id
     JOIN lab_results lr ON lr.tenant_id = ls.tenant_id AND lr.lab_sample_id = ls.id
     WHERE sp.tenant_id = $1::uuid AND cs.field_id = $2::uuid
     GROUP BY lr.parameter_code`,
    [tenantId, fieldId],
  );
  return new Map(result.rows.map((row: AggregateRow) => [row.parameterCode, row]));
}

async function aggregateParametersBySeason(client: any, tenantId: string, seasonId: string): Promise<Map<string, AggregateRow>> {
  const result = await client.query(
    `SELECT lr.parameter_code AS "parameterCode", count(*)::int AS n, avg(lr.numeric_value)::float8 AS avg,
            array_remove(array_agg(DISTINCT lr.unit), NULL) AS units,
            array_remove(array_agg(DISTINCT lr.analytical_method), NULL) AS methods,
            array_remove(array_agg(DISTINCT ls.sample_type), NULL) AS "sampleTypes",
            min(sp.depth_from_cm)::float8 AS "depthFrom", max(sp.depth_to_cm)::float8 AS "depthTo"
     FROM sample_points sp
     JOIN collection_orders co ON co.tenant_id = sp.tenant_id AND co.id = sp.collection_order_id
     JOIN lab_samples ls ON ls.tenant_id = sp.tenant_id AND ls.sample_point_id = sp.id
     JOIN lab_results lr ON lr.tenant_id = ls.tenant_id AND lr.lab_sample_id = ls.id
     WHERE sp.tenant_id = $1::uuid AND co.crop_season_id = $2::uuid
     GROUP BY lr.parameter_code`,
    [tenantId, seasonId],
  );
  return new Map(result.rows.map((row: AggregateRow) => [row.parameterCode, row]));
}

/** Melhor esforço: classificação da interpretação mais recente por parâmetro (não é uma média -- não
 * existe "classificação média". Quando o talhão/safra tem várias interpretações, só a mais recente é
 * usada, mesmo critério já usado no resto do produto pra "última interpretação"). */
function classificationsFromStructuredOutput(structuredOutput: any): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of structuredOutput?.interpretation ?? []) {
    if (item.interpretable && item.classification && !map.has(item.parameterCode)) map.set(item.parameterCode, item.classification);
  }
  return map;
}

async function latestStructuredOutputForField(client: any, fieldId: string) {
  const result = await client.query(
    `SELECT i.structured_output AS "structuredOutput"
     FROM interpretations i
     JOIN analyses a ON a.tenant_id = i.tenant_id AND a.id = i.analysis_id
     JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
     WHERE cs.field_id = $1::uuid
     ORDER BY i.created_at DESC LIMIT 1`,
    [fieldId],
  );
  return result.rows[0]?.structuredOutput ?? null;
}

async function latestStructuredOutputForSeason(client: any, seasonId: string) {
  const result = await client.query(
    `SELECT i.structured_output AS "structuredOutput"
     FROM interpretations i JOIN analyses a ON a.tenant_id = i.tenant_id AND a.id = i.analysis_id
     WHERE a.crop_season_id = $1::uuid ORDER BY i.created_at DESC LIMIT 1`,
    [seasonId],
  );
  return result.rows[0]?.structuredOutput ?? null;
}

export async function compareFields(tenantId: string, fieldIdA: string, fieldIdB: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const fieldsResult = await client.query(
      `SELECT id::text, name, ST_AsGeoJSON(boundary)::json AS boundary FROM fields WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])`,
      [tenantId, [fieldIdA, fieldIdB]],
    );
    const fieldA = fieldsResult.rows.find((row: any) => row.id === fieldIdA);
    const fieldB = fieldsResult.rows.find((row: any) => row.id === fieldIdB);
    const [aggA, aggB, structuredA, structuredB] = await Promise.all([
      aggregateParametersByField(client, tenantId, fieldIdA),
      aggregateParametersByField(client, tenantId, fieldIdB),
      latestStructuredOutputForField(client, fieldIdA),
      latestStructuredOutputForField(client, fieldIdB),
    ]);
    const rows = buildComparisonRows(aggA, aggB, classificationsFromStructuredOutput(structuredA), classificationsFromStructuredOutput(structuredB));
    // Mapas lado a lado (Fase 2, Bloco E) mostram o contorno real de cada talhão -- evidência espacial
    // honesta pra comparação Talhão×Talhão. Nunca pontos de uma ordem específica aqui: comparar dois
    // talhões inteiros não tem uma "ordem" única e sem ambiguidade pra escolher.
    return { labelA: fieldA?.name ?? "—", labelB: fieldB?.name ?? "—", rows, boundaryA: fieldA?.boundary ?? null, boundaryB: fieldB?.boundary ?? null };
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
    const [aggA, aggB, structuredA, structuredB] = await Promise.all([
      aggregateParametersBySeason(client, tenantId, seasonIdA),
      aggregateParametersBySeason(client, tenantId, seasonIdB),
      latestStructuredOutputForSeason(client, seasonIdA),
      latestStructuredOutputForSeason(client, seasonIdB),
    ]);
    const rows = buildComparisonRows(aggA, aggB, classificationsFromStructuredOutput(structuredA), classificationsFromStructuredOutput(structuredB));
    return { labelA: seasonA ? `${seasonA.fieldName} · ${seasonA.label}` : "—", labelB: seasonB ? `${seasonB.fieldName} · ${seasonB.label}` : "—", rows };
  });
}

export async function comparePoints(tenantId: string, pointIdA: string, pointIdB: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    async function pointAggregate(pointId: string): Promise<{ code: string; fieldName: string } | null> {
      const pointResult = await client.query(
        `SELECT sp.id::text, sp.code, f.name AS "fieldName" FROM sample_points sp
         JOIN collection_orders co ON co.tenant_id = sp.tenant_id AND co.id = sp.collection_order_id
         JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
         JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
         WHERE sp.tenant_id = $1::uuid AND sp.id = $2::uuid`,
        [tenantId, pointId],
      );
      return pointResult.rows[0] ?? null;
    }
    async function pointResults(pointId: string) {
      const result = await client.query(
        `SELECT lr.parameter_code AS "parameterCode", lr.numeric_value::float8 AS value, lr.unit, lr.analytical_method AS method,
                ls.sample_type AS "sampleType", sp.depth_from_cm::float8 AS "depthFromCm", sp.depth_to_cm::float8 AS "depthToCm"
         FROM lab_samples ls JOIN lab_results lr ON lr.tenant_id = ls.tenant_id AND lr.lab_sample_id = ls.id
         JOIN sample_points sp ON sp.tenant_id = ls.tenant_id AND sp.id = ls.sample_point_id
         WHERE ls.tenant_id = $1::uuid AND ls.sample_point_id = $2::uuid ORDER BY lr.parameter_code`,
        [tenantId, pointId],
      );
      return result.rows;
    }
    async function pointClassifications(pointId: string): Promise<Map<string, string>> {
      const result = await client.query(
        `SELECT i.structured_output AS "structuredOutput"
         FROM interpretations i JOIN analyses a ON a.tenant_id = i.tenant_id AND a.id = i.analysis_id
         JOIN sample_points sp ON sp.tenant_id = a.tenant_id AND sp.collection_order_id = a.collection_order_id
         WHERE sp.tenant_id = $1::uuid AND sp.id = $2::uuid ORDER BY i.created_at DESC LIMIT 1`,
        [tenantId, pointId],
      );
      const structured = result.rows[0]?.structuredOutput;
      const map = new Map<string, string>();
      const pointResult = await client.query(`SELECT code FROM sample_points WHERE tenant_id = $1::uuid AND id = $2::uuid`, [tenantId, pointId]);
      const code = pointResult.rows[0]?.code;
      for (const item of structured?.interpretation ?? []) {
        if (item.sampleCode === code && item.interpretable && item.classification) map.set(item.parameterCode, item.classification);
      }
      return map;
    }

    const [pointA, pointB] = await Promise.all([pointAggregate(pointIdA), pointAggregate(pointIdB)]);
    if (!pointA || !pointB) return { pointA, pointB, rows: [] as ParameterComparisonRow[] };
    const [resultsA, resultsB, classA, classB] = await Promise.all([
      pointResults(pointIdA), pointResults(pointIdB), pointClassifications(pointIdA), pointClassifications(pointIdB),
    ]);
    const aggA = new Map<string, AggregateRow>(resultsA.map((r: any) => [r.parameterCode, {
      parameterCode: r.parameterCode, n: 1, avg: r.value, units: [r.unit].filter(Boolean), methods: [r.method].filter(Boolean),
      sampleTypes: [r.sampleType].filter(Boolean), depthFrom: r.depthFromCm, depthTo: r.depthToCm,
    }]));
    const aggB = new Map<string, AggregateRow>(resultsB.map((r: any) => [r.parameterCode, {
      parameterCode: r.parameterCode, n: 1, avg: r.value, units: [r.unit].filter(Boolean), methods: [r.method].filter(Boolean),
      sampleTypes: [r.sampleType].filter(Boolean), depthFrom: r.depthFromCm, depthTo: r.depthToCm,
    }]));
    const rows = buildComparisonRows(aggA, aggB, classA, classB);
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
