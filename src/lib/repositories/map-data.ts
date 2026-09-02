import { withTenant } from "@/lib/db";

export type MapPointLayer = {
  id: string;
  code: string;
  latitude: number;
  longitude: number;
  depthFromCm: number;
  depthToCm: number;
  collectedAt: string | null;
  value: number | null;
  unit: string | null;
  method: string | null;
  interpretable: boolean | null;
  classification: string | null;
  notInterpretableReason: string | null;
  labResultCount: number;
};

export type MapLayerResult = {
  fieldBoundary: object;
  points: MapPointLayer[];
  availableParameters: string[];
  interpretationStatus: string | null;
  confidence: { score: number; level: string } | null;
  trace: { cropProfileCode: string | null; cropProfileVersion: string | null } | null;
};

/**
 * Camada de dados do mapa agronômico para um talhão/ordem de coleta: pontos
 * reais (PostGIS) cruzados com a classificação já homologada da última
 * interpretação, quando existir, para o parâmetro escolhido. Sem parâmetro
 * selecionado, ou sem interpretação, os pontos aparecem só com status de
 * coleta -- nunca com uma classificação inventada.
 */
export async function getFieldMapLayer(input: { tenantId: string; userId?: string; collectionOrderId: string; parameterCode: string | null }): Promise<MapLayerResult | null> {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const orderResult = await client.query<{ fieldBoundary: object }>(
      `SELECT ST_AsGeoJSON(f.boundary)::json AS "fieldBoundary"
       FROM collection_orders co
       JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       WHERE co.tenant_id = $1::uuid AND co.id = $2::uuid`,
      [input.tenantId, input.collectionOrderId],
    );
    const order = orderResult.rows[0];
    if (!order) return null;

    const paramsResult = await client.query<{ code: string }>(
      `SELECT DISTINCT lr.parameter_code AS code
       FROM sample_points sp
       JOIN lab_samples ls ON ls.tenant_id = sp.tenant_id AND ls.sample_point_id = sp.id
       JOIN lab_results lr ON lr.tenant_id = ls.tenant_id AND lr.lab_sample_id = ls.id
       WHERE sp.tenant_id = $1::uuid AND sp.collection_order_id = $2::uuid
       ORDER BY 1`,
      [input.tenantId, input.collectionOrderId],
    );
    const availableParameters = paramsResult.rows.map((row) => row.code);

    const pointsResult = await client.query(
      `SELECT sp.id::text, sp.code, ST_Y(sp.position)::float8 AS latitude, ST_X(sp.position)::float8 AS longitude,
              sp.depth_from_cm::float8 AS "depthFromCm", sp.depth_to_cm::float8 AS "depthToCm",
              sp.collected_at::text AS "collectedAt",
              lr.numeric_value::float8 AS value, lr.unit, lr.analytical_method AS method,
              (SELECT count(*)::int FROM lab_results lr2
                 JOIN lab_samples ls2 ON ls2.tenant_id = lr2.tenant_id AND ls2.id = lr2.lab_sample_id
                 WHERE ls2.tenant_id = sp.tenant_id AND ls2.sample_point_id = sp.id) AS "labResultCount"
       FROM sample_points sp
       LEFT JOIN lab_samples ls ON ls.tenant_id = sp.tenant_id AND ls.sample_point_id = sp.id
       LEFT JOIN lab_results lr ON lr.tenant_id = ls.tenant_id AND lr.lab_sample_id = ls.id AND lr.parameter_code = $3
       WHERE sp.tenant_id = $1::uuid AND sp.collection_order_id = $2::uuid
       ORDER BY sp.sequence NULLS LAST, sp.code`,
      [input.tenantId, input.collectionOrderId, input.parameterCode],
    );

    const interpretationResult = await client.query<{ status: string; structuredOutput: any }>(
      `SELECT i.status, i.structured_output AS "structuredOutput"
       FROM interpretations i
       JOIN analyses a ON a.tenant_id = i.tenant_id AND a.id = i.analysis_id
       WHERE i.tenant_id = $1::uuid AND a.collection_order_id = $2::uuid
       ORDER BY i.created_at DESC LIMIT 1`,
      [input.tenantId, input.collectionOrderId],
    );
    const interpretation = interpretationResult.rows[0] ?? null;
    const byCode = new Map<string, any>();
    if (interpretation?.structuredOutput?.interpretation) {
      for (const item of interpretation.structuredOutput.interpretation as any[]) {
        if (item.parameterCode === input.parameterCode) byCode.set(item.sampleCode, item);
      }
    }

    const points: MapPointLayer[] = pointsResult.rows.map((row: any) => {
      const match = byCode.get(row.code);
      return {
        id: row.id,
        code: row.code,
        latitude: row.latitude,
        longitude: row.longitude,
        depthFromCm: row.depthFromCm,
        depthToCm: row.depthToCm,
        collectedAt: row.collectedAt,
        value: row.value,
        unit: row.unit,
        method: row.method,
        interpretable: match ? Boolean(match.interpretable) : null,
        classification: match?.interpretable ? match.classification : null,
        notInterpretableReason: match && !match.interpretable ? match.reason : null,
        labResultCount: row.labResultCount,
      };
    });

    return {
      fieldBoundary: order.fieldBoundary,
      points,
      availableParameters,
      interpretationStatus: interpretation?.status ?? null,
      confidence: interpretation?.structuredOutput?.confidence ?? null,
      trace: interpretation?.structuredOutput?.trace ?? null,
    };
  });
}
