import type { PoolClient } from "pg";

export type OperationalAlertSourceMap = Record<string, Array<Record<string, any>>>;

const CLIMATE_ADVISORY_CROPS = ["soja", "milho", "arroz"];

/**
 * Uma única leitura de banco para todas as fontes da Central de Atenção.
 *
 * Cada braço do UNION preserva a consulta/regra anterior e devolve apenas um discriminador + payload.
 * A transformação em texto/criticidade continua em alerts.ts, então esta otimização não muda semântica.
 */
export async function getOperationalAlertSources(client: PoolClient, tenantId: string): Promise<OperationalAlertSourceMap> {
  const result = await client.query<{ kind: string; payload: Record<string, any> }>(
    `SELECT 'overdueOrders' AS kind,
            jsonb_build_object(
              'id', co.id::text, 'code', co.code, 'plannedAt', co.planned_at::text,
              'fieldId', f.id::text, 'fieldName', f.name, 'clientName', c.name, 'assignedToName', u.name
            ) AS payload
     FROM collection_orders co
     JOIN crop_seasons cs ON cs.tenant_id=co.tenant_id AND cs.id=co.crop_season_id
     JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
     JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
     JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
     LEFT JOIN users u ON u.id=co.assigned_to
     WHERE co.tenant_id=$1::uuid
       AND co.status IN ('PLANNED','IN_PROGRESS')
       AND co.planned_at IS NOT NULL
       AND co.planned_at < now()

     UNION ALL

     SELECT 'pendingPoints' AS kind,
            jsonb_build_object(
              'id', co.id::text, 'code', co.code, 'plannedAt', co.planned_at::text,
              'fieldId', f.id::text, 'fieldName', f.name, 'clientName', c.name, 'assignedToName', u.name,
              'pending', count(sp.*) FILTER (WHERE sp.collected_at IS NULL)::int,
              'total', count(sp.*)::int
            ) AS payload
     FROM collection_orders co
     JOIN crop_seasons cs ON cs.tenant_id=co.tenant_id AND cs.id=co.crop_season_id
     JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
     JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
     JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
     JOIN sample_points sp ON sp.tenant_id=co.tenant_id AND sp.collection_order_id=co.id
     LEFT JOIN users u ON u.id=co.assigned_to
     WHERE co.tenant_id=$1::uuid AND co.status IN ('PLANNED','IN_PROGRESS')
     GROUP BY co.id, co.code, co.planned_at, f.id, f.name, c.name, u.name
     HAVING count(sp.*) FILTER (WHERE sp.collected_at IS NULL) > 0

     UNION ALL

     SELECT 'awaitingLab' AS kind,
            jsonb_build_object(
              'id', a.id::text, 'code', a.code, 'fieldId', f.id::text, 'fieldName', f.name,
              'clientName', c.name, 'updatedAt', a.updated_at::text
            ) AS payload
     FROM analyses a
     JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
     JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
     JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
     JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
     WHERE a.tenant_id=$1::uuid AND a.status='AWAITING_LAB'

     UNION ALL

     SELECT 'inconsistent' AS kind,
            jsonb_build_object(
              'id', a.id::text, 'code', a.code, 'fieldId', f.id::text, 'fieldName', f.name,
              'clientName', c.name, 'updatedAt', a.updated_at::text
            ) AS payload
     FROM analyses a
     JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
     JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
     JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
     JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
     WHERE a.tenant_id=$1::uuid AND a.status='INCONSISTENT'

     UNION ALL

     SELECT 'staleCurrentInterpretations' AS kind, to_jsonb(stale_row) AS payload
     FROM (
       WITH latest_seasons AS (
         SELECT DISTINCT ON (cs.field_id) cs.id, cs.field_id, cs.crop_profile_id, cs.created_at
         FROM crop_seasons cs
         WHERE cs.tenant_id=$1::uuid
         ORDER BY cs.field_id, cs.created_at DESC, cs.id DESC
       ),
       latest_analyses AS (
         SELECT DISTINCT ON (ls.field_id)
                a.id, a.tenant_id, a.code, a.created_at, ls.field_id, ls.crop_profile_id
         FROM analyses a
         JOIN latest_seasons ls ON ls.id=a.crop_season_id
         ORDER BY ls.field_id, a.created_at DESC, a.id DESC
       )
       SELECT la.id::text AS "analysisId",
              la.code,
              f.id::text AS "fieldId",
              f.name AS "fieldName",
              c.name AS "clientName",
              li.created_at::text AS "interpretationCreatedAt",
              CASE
                WHEN li.crop_profile_id IS DISTINCT FROM la.crop_profile_id THEN 'CROP_PROFILE_CHANGED'
                WHEN latest_import.latest_import_at IS NOT NULL AND li.created_at < latest_import.latest_import_at THEN 'LAB_EVIDENCE_CHANGED'
                WHEN cp.id IS NOT NULL
                 AND li.created_at < greatest(cp.updated_at, coalesce(rule_state.latest_parameter_rule_at, cp.updated_at)) THEN 'AGRONOMIC_RULES_CHANGED'
                ELSE NULL
              END AS "freshnessCode"
       FROM latest_analyses la
       JOIN fields f ON f.tenant_id=la.tenant_id AND f.id=la.field_id
       JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
       JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
       LEFT JOIN crop_profiles cp ON cp.id=la.crop_profile_id
       JOIN LATERAL (
         SELECT i.created_at, i.crop_profile_id
         FROM interpretations i
         WHERE i.tenant_id=la.tenant_id AND i.analysis_id=la.id
         ORDER BY i.revision DESC
         LIMIT 1
       ) li ON true
       LEFT JOIN LATERAL (
         SELECT max(coalesce(ai.committed_at, ai.created_at)) AS latest_import_at
         FROM analysis_imports ai
         WHERE ai.tenant_id=la.tenant_id AND ai.analysis_id=la.id
       ) latest_import ON true
       LEFT JOIN LATERAL (
         SELECT max(cpp.updated_at) AS latest_parameter_rule_at
         FROM crop_profile_parameters cpp
         WHERE cpp.crop_profile_id=cp.id
       ) rule_state ON cp.id IS NOT NULL
       WHERE li.crop_profile_id IS DISTINCT FROM la.crop_profile_id
          OR (latest_import.latest_import_at IS NOT NULL AND li.created_at < latest_import.latest_import_at)
          OR (
            cp.id IS NOT NULL
            AND li.created_at < greatest(cp.updated_at, coalesce(rule_state.latest_parameter_rule_at, cp.updated_at))
          )
     ) stale_row

     UNION ALL

     SELECT 'awaitingReview' AS kind,
            jsonb_build_object(
              'id', i.id::text, 'analysisId', i.analysis_id::text, 'createdAt', i.created_at::text,
              'code', a.code, 'fieldId', f.id::text, 'fieldName', f.name, 'clientName', c.name
            ) AS payload
     FROM interpretations i
     JOIN analyses a ON a.tenant_id=i.tenant_id AND a.id=i.analysis_id
     JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
     LEFT JOIN crop_profiles cp ON cp.id=cs.crop_profile_id
     JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
     JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
     JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
     LEFT JOIN LATERAL (
       SELECT max(coalesce(ai.committed_at, ai.created_at)) AS latest_import_at
       FROM analysis_imports ai
       WHERE ai.tenant_id=a.tenant_id AND ai.analysis_id=a.id
     ) latest_import ON true
     LEFT JOIN LATERAL (
       SELECT max(cpp.updated_at) AS latest_parameter_rule_at
       FROM crop_profile_parameters cpp
       WHERE cpp.crop_profile_id=cp.id
     ) rule_state ON cp.id IS NOT NULL
     WHERE i.tenant_id=$1::uuid
       AND i.status='IN_REVIEW'
       AND i.revision=(SELECT max(revision) FROM interpretations i2 WHERE i2.tenant_id=i.tenant_id AND i2.analysis_id=i.analysis_id)
       AND i.crop_profile_id IS NOT DISTINCT FROM cs.crop_profile_id
       AND (latest_import.latest_import_at IS NULL OR i.created_at >= latest_import.latest_import_at)
       AND (
         cp.id IS NULL
         OR i.created_at >= greatest(cp.updated_at, coalesce(rule_state.latest_parameter_rule_at, cp.updated_at))
       )

     UNION ALL

     SELECT 'unhomologatedParams' AS kind,
            jsonb_build_object('id', cp.id::text, 'name', cp.name, 'pending', count(*)::int) AS payload
     FROM crop_profile_parameters cpp
     JOIN crop_profiles cp ON cp.id=cpp.crop_profile_id
     WHERE cpp.status!='ACTIVE'
       AND cp.id IN (
         SELECT DISTINCT crop_profile_id
         FROM crop_seasons
         WHERE tenant_id=$1::uuid AND crop_profile_id IS NOT NULL
       )
     GROUP BY cp.id, cp.name

     UNION ALL

     SELECT 'seasonsWithoutCrop' AS kind, to_jsonb(no_crop) AS payload
     FROM (
       WITH latest_seasons AS (
         SELECT DISTINCT ON (cs.field_id)
                cs.id, cs.tenant_id, cs.field_id, cs.season_label, cs.crop_profile_id, cs.created_at
         FROM crop_seasons cs
         WHERE cs.tenant_id=$1::uuid
         ORDER BY cs.field_id, cs.created_at DESC, cs.id DESC
       )
       SELECT cs.id::text AS id,
              cs.season_label AS "seasonLabel",
              f.id::text AS "fieldId",
              f.name AS "fieldName",
              c.name AS "clientName"
       FROM latest_seasons cs
       JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
       JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
       JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
       WHERE cs.crop_profile_id IS NULL
     ) no_crop

     UNION ALL

     SELECT 'fieldsWithoutSeason' AS kind,
            jsonb_build_object('id', f.id::text, 'name', f.name, 'clientName', c.name) AS payload
     FROM fields f
     JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
     JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
     WHERE f.tenant_id=$1::uuid
       AND NOT EXISTS (
         SELECT 1 FROM crop_seasons cs
         WHERE cs.tenant_id=f.tenant_id AND cs.field_id=f.id
       )

     UNION ALL

     SELECT 'staleAnalyses' AS kind,
            jsonb_build_object(
              'id', a.id::text, 'code', a.code, 'status', a.status,
              'fieldId', f.id::text, 'fieldName', f.name, 'clientName', c.name,
              'createdAt', a.created_at::text
            ) AS payload
     FROM analyses a
     JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
     JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
     JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
     JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
     WHERE a.tenant_id=$1::uuid
       AND a.status IN ('DRAFT','COLLECTION_SCHEDULED','COLLECTION_IN_PROGRESS','AWAITING_LAB')
       AND a.created_at < now() - interval '14 days'

     UNION ALL

     SELECT 'brokenTraceability' AS kind,
            jsonb_build_object(
              'id', ls.id::text, 'laboratory_code', ls.laboratory_code,
              'analysisId', a.id::text, 'analysisCode', a.code,
              'fieldId', f.id::text, 'fieldName', f.name, 'clientName', c.name
            ) AS payload
     FROM lab_samples ls
     JOIN analyses a ON a.tenant_id=ls.tenant_id AND a.id=ls.analysis_id
     JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
     JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
     JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
     JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
     WHERE ls.tenant_id=$1::uuid
       AND ls.sample_point_id IS NULL
       AND a.collection_order_id IS NOT NULL

     UNION ALL

     SELECT 'reanalysisDue' AS kind,
            jsonb_build_object(
              'id', f.id::text, 'name', f.name, 'clientName', c.name,
              'lastAnalysisAt', max(a.created_at)::text
            ) AS payload
     FROM analyses a
     JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
     JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
     JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
     JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
     WHERE a.tenant_id=$1::uuid
     GROUP BY f.id, f.name, c.name
     HAVING max(a.created_at) < now() - interval '3 years'

     UNION ALL

     SELECT 'inputDeviation' AS kind, to_jsonb(input_row) AS payload
     FROM (
       WITH latest_recommendations AS (
         SELECT DISTINCT ON (analysis_id, input_type)
                id, analysis_id, input_type, quantity, unit, calculation_source, calculated_at, source_generation_id
         FROM input_recommendations
         WHERE tenant_id=$1::uuid
         ORDER BY analysis_id, input_type, calculated_at DESC, id DESC
       ),
       applied_totals AS (
         SELECT analysis_id, input_type, unit, SUM(quantity) AS total_quantity
         FROM input_applications
         WHERE tenant_id=$1::uuid
         GROUP BY analysis_id, input_type, unit
       )
       SELECT r.analysis_id::text AS "analysisId",
              r.input_type AS "inputType",
              r.quantity::float8 AS "recommendedQuantity",
              r.unit,
              applied.total_quantity::float8 AS "appliedQuantity",
              an.code,
              f.id::text AS "fieldId",
              f.name AS "fieldName",
              c.name AS "clientName"
       FROM latest_recommendations r
       JOIN applied_totals applied
         ON applied.analysis_id=r.analysis_id AND applied.input_type=r.input_type AND applied.unit=r.unit
       JOIN analyses an ON an.tenant_id=$1::uuid AND an.id=r.analysis_id
       JOIN crop_seasons cs ON cs.tenant_id=an.tenant_id AND cs.id=an.crop_season_id
       LEFT JOIN crop_profiles cp ON cp.id=cs.crop_profile_id
       JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
       JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
       JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
       LEFT JOIN ai_generations g
         ON g.tenant_id=$1::uuid AND g.id=r.source_generation_id AND g.kind='AGRONOMIC_PRESCRIPTION'
       LEFT JOIN LATERAL (
         SELECT i.id, i.status, i.created_at, i.crop_profile_id
         FROM interpretations i
         WHERE i.tenant_id=an.tenant_id AND i.analysis_id=an.id
         ORDER BY i.revision DESC
         LIMIT 1
       ) li ON true
       LEFT JOIN LATERAL (
         SELECT max(coalesce(ai.committed_at, ai.created_at)) AS latest_import_at
         FROM analysis_imports ai
         WHERE ai.tenant_id=an.tenant_id AND ai.analysis_id=an.id
       ) latest_import ON true
       LEFT JOIN LATERAL (
         SELECT max(cpp.updated_at) AS latest_parameter_rule_at
         FROM crop_profile_parameters cpp
         WHERE cpp.crop_profile_id=cp.id
       ) rule_state ON cp.id IS NOT NULL
       WHERE (
         (r.source_generation_id IS NULL AND coalesce(r.calculation_source, '') NOT LIKE 'ai_generations:%')
         OR (
           r.source_generation_id IS NOT NULL
           AND g.status = 'APPROVED'
           AND g.created_at >= cs.updated_at
           AND g.interpretation_id = li.id
           AND li.status = 'APPROVED'
           AND li.crop_profile_id IS NOT DISTINCT FROM cs.crop_profile_id
           AND (latest_import.latest_import_at IS NULL OR li.created_at >= latest_import.latest_import_at)
           AND (
             cp.id IS NULL
             OR li.created_at >= greatest(cp.updated_at, coalesce(rule_state.latest_parameter_rule_at, cp.updated_at))
           )
         )
       )
     ) input_row

     UNION ALL

     SELECT 'climateSeasons' AS kind,
            jsonb_build_object(
              'id', cs.id::text, 'fieldId', cs.field_id::text, 'seasonLabel', cs.season_label,
              'crop', coalesce(cs.next_crop, cs.current_crop), 'fieldName', f.name, 'clientName', c.name
            ) AS payload
     FROM crop_seasons cs
     JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
     JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
     JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
     WHERE cs.tenant_id=$1::uuid
       AND cs.season_label='2026/27'
       AND p.state='RS'
       AND lower(coalesce(cs.next_crop, cs.current_crop, ''))=ANY($2::text[])`,
    [tenantId, CLIMATE_ADVISORY_CROPS],
  );

  const grouped: OperationalAlertSourceMap = {};
  for (const row of result.rows) {
    (grouped[row.kind] ??= []).push(row.payload);
  }
  return grouped;
}
