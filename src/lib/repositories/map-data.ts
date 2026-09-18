import { evaluateAnalysisEvidenceFreshness } from "@/domain/analysis-evidence-freshness";
import { withTenant } from "@/lib/db";

export type MapPointLayer = {
  id: string;
  code: string;
  sequence: number | null;
  latitude: number;
  longitude: number;
  observedLatitude: number | null;
  observedLongitude: number | null;
  depthFromCm: number;
  depthToCm: number;
  subsampleCount: number | null;
  accuracyM: number | null;
  gpsSource: string | null;
  notes: string | null;
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
  interpretationCurrent: boolean;
  interpretationFreshnessCode: string;
  confidence: { score: number; level: string } | null;
  trace: { cropProfileCode: string | null; cropProfileVersion: string | null } | null;
  analysisId: string | null;
  reportId: string | null;
};

export type FieldSoilMapContext = {
  collectionOrderId: string;
  collectionOrderCode: string;
  seasonLabel: string;
  depthFromCm: number;
  depthToCm: number;
};

/**
 * Resolve a ordem de coleta mais recente do talhão que realmente possui resultado laboratorial.
 * É usada pelo painel Satélite quando ele não recebeu uma ordem explícita da tela. Nunca escolhe uma
 * ordem vazia só por ser mais nova e nunca atravessa tenant/RLS.
 */
export async function getLatestFieldSoilMapContext(input: {
  tenantId: string;
  userId?: string;
  fieldId: string;
}): Promise<FieldSoilMapContext | null> {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query<FieldSoilMapContext>(
      `SELECT co.id::text AS "collectionOrderId", co.code AS "collectionOrderCode",
              cs.season_label AS "seasonLabel", co.depth_from_cm::float8 AS "depthFromCm",
              co.depth_to_cm::float8 AS "depthToCm"
       FROM collection_orders co
       JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
       WHERE co.tenant_id = $1::uuid AND cs.field_id = $2::uuid
         AND EXISTS (
           SELECT 1
           FROM sample_points sp
           JOIN lab_samples ls ON ls.tenant_id = sp.tenant_id AND ls.sample_point_id = sp.id
           JOIN lab_results lr ON lr.tenant_id = ls.tenant_id AND lr.lab_sample_id = ls.id
           WHERE sp.tenant_id = co.tenant_id AND sp.collection_order_id = co.id
         )
       ORDER BY co.created_at DESC
       LIMIT 1`,
      [input.tenantId, input.fieldId],
    );
    return result.rows[0] ?? null;
  });
}

/**
 * Camada de dados do mapa agronômico para um talhão/ordem de coleta: pontos reais (PostGIS) cruzados
 * com a classificação da última interpretação SOMENTE quando ela ainda representa a evidência e as
 * regras agronômicas correntes. Interpretação stale é preservada como histórico, mas nunca colore o
 * mapa como se fosse atual. A posição renderizada
 * privilegia `observed_position` quando existe; só cai para a posição planejada quando não há captura
 * observada. As duas continuam separadas no payload para auditoria.
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
      `SELECT sp.id::text, sp.code, sp.sequence,
              ST_Y(COALESCE(sp.observed_position, sp.position))::float8 AS latitude,
              ST_X(COALESCE(sp.observed_position, sp.position))::float8 AS longitude,
              CASE WHEN sp.observed_position IS NULL THEN NULL ELSE ST_Y(sp.observed_position) END AS "observedLatitude",
              CASE WHEN sp.observed_position IS NULL THEN NULL ELSE ST_X(sp.observed_position) END AS "observedLongitude",
              sp.depth_from_cm::float8 AS "depthFromCm", sp.depth_to_cm::float8 AS "depthToCm",
              sp.subsample_count AS "subsampleCount", sp.accuracy_m::float8 AS "accuracyM", sp.gps_source AS "gpsSource",
              sp.notes, sp.collected_at::text AS "collectedAt",
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

    const analysisResult = await client.query<{
      id: string;
      reportId: string | null;
      latestImportCommittedAt: string | null;
      currentCropProfileId: string | null;
      latestRuleUpdatedAt: string | null;
    }>(
      `SELECT a.id::text AS id,
              (SELECT r.id::text FROM reports r JOIN interpretations i2 ON i2.tenant_id = r.tenant_id AND i2.id = r.interpretation_id
                 WHERE i2.tenant_id = a.tenant_id AND i2.analysis_id = a.id ORDER BY r.published_at DESC LIMIT 1) AS "reportId",
              latest_import.latest_import_at::text AS "latestImportCommittedAt",
              cs.crop_profile_id::text AS "currentCropProfileId",
              rule_state.latest_rule_updated_at::text AS "latestRuleUpdatedAt"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       LEFT JOIN crop_profiles cp ON cp.id = cs.crop_profile_id
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
       WHERE a.tenant_id = $1::uuid AND a.collection_order_id = $2::uuid
       ORDER BY a.created_at DESC LIMIT 1`,
      [input.tenantId, input.collectionOrderId],
    );
    const analysis = analysisResult.rows[0] ?? null;

    const interpretationResult = analysis
      ? await client.query<{ status: string; structuredOutput: any; createdAt: string | null; cropProfileId: string | null }>(
          `SELECT i.status, i.structured_output AS "structuredOutput", i.created_at::text AS "createdAt", i.crop_profile_id::text AS "cropProfileId"
           FROM interpretations i
           WHERE i.tenant_id = $1::uuid AND i.analysis_id = $2::uuid
           ORDER BY i.revision DESC LIMIT 1`,
          [input.tenantId, analysis.id],
        )
      : { rows: [] as Array<{ status: string; structuredOutput: any; createdAt: string | null; cropProfileId: string | null }> };
    const interpretation = interpretationResult.rows[0] ?? null;
    const interpretationFreshness = interpretation && analysis
      ? evaluateAnalysisEvidenceFreshness({
          interpretationCreatedAt: interpretation.createdAt,
          latestImportCommittedAt: analysis.latestImportCommittedAt,
          interpretationCropProfileId: interpretation.cropProfileId,
          currentCropProfileId: analysis.currentCropProfileId,
          latestRuleUpdatedAt: analysis.latestRuleUpdatedAt,
        })
      : {
          current: false,
          code: "INTERPRETATION_TIMESTAMP_MISSING",
          reason: "Ainda não existe interpretação determinística corrente para esta coleta.",
        };
    const currentInterpretation = interpretationFreshness.current ? interpretation : null;
    const byCode = new Map<string, any>();
    if (currentInterpretation?.structuredOutput?.interpretation) {
      for (const item of currentInterpretation.structuredOutput.interpretation as any[]) {
        if (item.parameterCode === input.parameterCode) byCode.set(item.sampleCode, item);
      }
    }

    const points: MapPointLayer[] = pointsResult.rows.map((row: any) => {
      const match = byCode.get(row.code);
      return {
        id: row.id,
        code: row.code,
        sequence: row.sequence,
        latitude: row.latitude,
        longitude: row.longitude,
        observedLatitude: row.observedLatitude,
        observedLongitude: row.observedLongitude,
        depthFromCm: row.depthFromCm,
        depthToCm: row.depthToCm,
        subsampleCount: row.subsampleCount,
        accuracyM: row.accuracyM,
        gpsSource: row.gpsSource,
        notes: row.notes,
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
      interpretationCurrent: interpretationFreshness.current,
      interpretationFreshnessCode: interpretationFreshness.code,
      confidence: currentInterpretation?.structuredOutput?.confidence ?? null,
      trace: currentInterpretation?.structuredOutput?.trace ?? null,
      analysisId: analysis?.id ?? null,
      reportId: analysis?.reportId ?? null,
    };
  });
}
