import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import type { ImportedPoint } from "@/domain/field-operations";

export class FieldOperationError extends Error {
  constructor(message: string, public status = 400, public details?: Record<string, unknown>) {
    super(message);
    this.name = "FieldOperationError";
  }
}

export type CollectionOrderPoint = {
  id: string;
  code: string;
  sequence: number | null;
  latitude: number;
  longitude: number;
  observedLatitude: number | null;
  observedLongitude: number | null;
  collectedAt: string | null;
  depthFromCm: number;
  depthToCm: number;
  subsampleCount: number | null;
  accuracyM: number | null;
  gpsSource: string | null;
  labResultCount: number;
};

export type CollectionOrderListItem = {
  id: string;
  code: string;
  status: "PLANNED" | "IN_PROGRESS" | "DONE" | "CANCELED";
  samplingStrategy: "GRID" | "IMPORTED" | "MANUAL";
  gridAreaHa: number | null;
  depthFromCm: number;
  depthToCm: number;
  plannedAt: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  cropSeasonId: string;
  seasonLabel: string;
  fieldId: string;
  fieldName: string;
  fieldAreaHa: number;
  propertyName: string;
  clientName: string;
  fieldBoundary: object;
  plannedPoints: number;
  collectedPoints: number;
  points: CollectionOrderPoint[];
};

export async function listCollectionOrders(tenantId: string, userId?: string, cropSeasonId?: string | null) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<CollectionOrderListItem>(
      `SELECT
         co.id::text AS id,
         co.code,
         co.status,
         co.sampling_strategy AS "samplingStrategy",
         co.grid_area_ha::float8 AS "gridAreaHa",
         co.depth_from_cm::float8 AS "depthFromCm",
         co.depth_to_cm::float8 AS "depthToCm",
         co.planned_at::text AS "plannedAt",
         co.assigned_to::text AS "assignedTo",
         u.name AS "assignedToName",
         cs.id::text AS "cropSeasonId",
         cs.season_label AS "seasonLabel",
         f.id::text AS "fieldId",
         f.name AS "fieldName",
         f.area_ha::float8 AS "fieldAreaHa",
         p.name AS "propertyName",
         c.name AS "clientName",
         ST_AsGeoJSON(f.boundary)::json AS "fieldBoundary",
         count(sp.id)::int AS "plannedPoints",
         count(sp.id) FILTER (WHERE sp.collected_at IS NOT NULL)::int AS "collectedPoints",
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', sp.id::text,
               'code', sp.code,
               'sequence', sp.sequence,
               'latitude', ST_Y(sp.position),
               'longitude', ST_X(sp.position),
               'observedLatitude', CASE WHEN sp.observed_position IS NULL THEN NULL ELSE ST_Y(sp.observed_position) END,
               'observedLongitude', CASE WHEN sp.observed_position IS NULL THEN NULL ELSE ST_X(sp.observed_position) END,
               'collectedAt', sp.collected_at,
               'depthFromCm', sp.depth_from_cm::float8,
               'depthToCm', sp.depth_to_cm::float8,
               'subsampleCount', sp.subsample_count,
               'accuracyM', sp.accuracy_m::float8,
               'gpsSource', sp.gps_source,
               'labResultCount', (
                 SELECT count(*)::int
                 FROM analysis_import_rows air
                 JOIN analysis_imports ai ON ai.tenant_id = air.tenant_id AND ai.id = air.import_id
                 JOIN analyses la ON la.tenant_id = ai.tenant_id AND la.id = ai.analysis_id
                 WHERE la.tenant_id = sp.tenant_id AND la.collection_order_id = sp.collection_order_id AND air.sample_code = sp.code
               )
             ) ORDER BY coalesce(sp.sequence, 2147483647), sp.code
           ) FILTER (WHERE sp.id IS NOT NULL),
           '[]'::jsonb
         ) AS points
       FROM collection_orders co
       JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       LEFT JOIN users u ON u.id = co.assigned_to
       LEFT JOIN sample_points sp ON sp.tenant_id = co.tenant_id AND sp.collection_order_id = co.id
       WHERE co.tenant_id = $1::uuid AND ($2::uuid IS NULL OR co.crop_season_id = $2::uuid)
       GROUP BY co.id, u.name, cs.id, cs.season_label, f.id, f.name, f.area_ha, f.boundary, p.name, c.name
       ORDER BY co.created_at DESC`,
      [tenantId, cropSeasonId ?? null],
    );
    return result.rows;
  });
}

export async function createCollectionOrder(input: {
  tenantId: string;
  userId: string;
  cropSeasonId: string;
  assignedTo?: string | null;
  gridAreaHa?: number | null;
  depthFromCm: number;
  depthToCm: number;
  plannedAt?: string | null;
  samplingStrategy: "GRID" | "IMPORTED" | "MANUAL";
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const context = await client.query<{ fieldId: string; fieldAreaHa: number }>(
      `SELECT f.id::text AS "fieldId", f.area_ha::float8 AS "fieldAreaHa"
       FROM crop_seasons cs
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       WHERE cs.tenant_id = $1::uuid AND cs.id = $2::uuid`,
      [input.tenantId, input.cropSeasonId],
    );
    if (!context.rows[0]) throw new FieldOperationError("Safra/talhão não encontrado.", 404);
    if (input.depthFromCm < 0 || input.depthToCm <= input.depthFromCm || input.depthToCm > 300) throw new FieldOperationError("Profundidade de coleta inválida.");
    if (input.samplingStrategy === "GRID" && (!input.gridAreaHa || input.gridAreaHa < 0.05 || input.gridAreaHa > context.rows[0].fieldAreaHa * 2)) {
      throw new FieldOperationError("Informe um grid em hectares compatível com a área do talhão.");
    }

    const createdResult = await client.query<{ id: string; code: string }>(
      `INSERT INTO collection_orders
       (tenant_id, crop_season_id, assigned_to, code, grid_area_ha, depth_from_cm, depth_to_cm, planned_at, sampling_strategy)
       VALUES (
         $1::uuid, $2::uuid, $3::uuid,
         'OC-' || to_char(current_date,'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
         $4, $5, $6, $7::timestamptz, $8
       )
       RETURNING id::text, code`,
      [input.tenantId, input.cropSeasonId, input.assignedTo ?? null, input.gridAreaHa ?? null, input.depthFromCm, input.depthToCm, input.plannedAt ?? null, input.samplingStrategy],
    );
    const order = createdResult.rows[0];

    let generatedPoints = 0;
    if (input.samplingStrategy === "GRID") {
      const gridAreaHa = input.gridAreaHa as number;
      const pointInsert = await client.query<{ count: number }>(
        `WITH field_context AS (
           SELECT f.boundary,
                  ST_X(ST_Centroid(f.boundary)) AS lon,
                  ST_Y(ST_Centroid(f.boundary)) AS lat
           FROM crop_seasons cs
           JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
           WHERE cs.tenant_id = $1::uuid AND cs.id = $2::uuid
         ), projected AS (
           SELECT boundary,
                  CASE WHEN lat >= 0
                    THEN 32600 + floor((lon + 180.0) / 6.0 + 1)::int
                    ELSE 32700 + floor((lon + 180.0) / 6.0 + 1)::int
                  END AS utm_srid
           FROM field_context
         ), metric AS (
           SELECT ST_Transform(boundary, utm_srid) AS boundary_metric, utm_srid
           FROM projected
         ), cells AS (
           SELECT grid.geom AS cell_geom, metric.boundary_metric, metric.utm_srid
           FROM metric
           CROSS JOIN LATERAL ST_SquareGrid(sqrt($4::float8 * 10000.0), metric.boundary_metric) AS grid
           WHERE ST_Intersects(grid.geom, metric.boundary_metric)
             AND ST_Area(ST_Intersection(grid.geom, metric.boundary_metric)) >= ($4::float8 * 10000.0 * 0.05)
         ), normalized AS (
           SELECT row_number() OVER (ORDER BY ST_Y(ST_Centroid(cell_geom)) DESC, ST_X(ST_Centroid(cell_geom)))::int AS seq,
                  ST_PointOnSurface(ST_Intersection(cell_geom, boundary_metric)) AS point_metric,
                  cell_geom,
                  utm_srid
           FROM cells
         ), inserted AS (
           INSERT INTO sample_points
           (tenant_id, collection_order_id, code, sequence, position, grid_boundary, depth_from_cm, depth_to_cm, gps_source, source_payload)
           SELECT $1::uuid, $3::uuid, 'P' || lpad(seq::text,3,'0'), seq,
                  ST_Transform(point_metric,4326)::geometry(Point,4326),
                  ST_Transform(cell_geom,4326)::geometry(Polygon,4326),
                  $5, $6, 'POSTGIS_GRID',
                  jsonb_build_object('strategy','SQUARE_GRID','gridAreaHa',$4::float8,'utmSrid',utm_srid)
           FROM normalized
           WHERE seq <= 2000
           RETURNING 1
         ) SELECT count(*)::int AS count FROM inserted`,
        [input.tenantId, input.cropSeasonId, order.id, gridAreaHa, input.depthFromCm, input.depthToCm],
      );
      generatedPoints = pointInsert.rows[0]?.count ?? 0;
      if (!generatedPoints) throw new FieldOperationError("Não foi possível gerar pontos dentro do talhão. Revise o polígono e o tamanho do grid.", 422);
    }

    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "COLLECTION_ORDER_CREATED",
      entityType: "collection_order",
      entityId: order.id,
      metadata: { code: order.code, strategy: input.samplingStrategy, generatedPoints },
    });

    return { ...order, generatedPoints };
  });
}

export async function cancelCollectionOrder(input: { tenantId: string; userId: string; orderId: string }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const current = await client.query<{ status: string; code: string }>(
      `SELECT status, code FROM collection_orders WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [input.tenantId, input.orderId],
    );
    const row = current.rows[0];
    if (!row) throw new FieldOperationError("Ordem de coleta não encontrada.", 404);
    if (row.status !== "PLANNED") {
      throw new FieldOperationError("Só é possível cancelar uma ordem que ainda não teve nenhum ponto coletado.", 409);
    }

    await client.query(`UPDATE collection_orders SET status = 'CANCELED' WHERE tenant_id = $1::uuid AND id = $2::uuid`, [input.tenantId, input.orderId]);
    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "COLLECTION_ORDER_CANCELED",
      entityType: "collection_order",
      entityId: input.orderId,
      metadata: { code: row.code },
    });
  });
}

export async function importCollectionPoints(input: {
  tenantId: string;
  userId: string;
  orderId: string;
  points: ImportedPoint[];
  source: "CSV" | "GEOJSON";
  replaceExisting?: boolean;
}) {
  if (!input.points.length) throw new FieldOperationError("Nenhum ponto válido para importar.");
  if (input.points.length > 2000) throw new FieldOperationError("Importação limitada a 2.000 pontos por ordem nesta versão.");

  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const orderContext = await client.query<{ depthFromCm: number; depthToCm: number; collectedPoints: number }>(
      `SELECT co.depth_from_cm::float8 AS "depthFromCm", co.depth_to_cm::float8 AS "depthToCm",
              count(sp.id) FILTER (WHERE sp.collected_at IS NOT NULL)::int AS "collectedPoints"
       FROM collection_orders co
       LEFT JOIN sample_points sp ON sp.tenant_id = co.tenant_id AND sp.collection_order_id = co.id
       WHERE co.tenant_id = $1::uuid AND co.id = $2::uuid
       GROUP BY co.id`,
      [input.tenantId, input.orderId],
    );
    const context = orderContext.rows[0];
    if (!context) throw new FieldOperationError("Ordem de coleta não encontrada.", 404);
    if (input.replaceExisting !== false && context.collectedPoints > 0) throw new FieldOperationError("Não é permitido substituir pontos depois que a coleta foi iniciada.", 409);

    const codes = input.points.map((point) => point.code.trim());
    const longitudes = input.points.map((point) => point.longitude);
    const latitudes = input.points.map((point) => point.latitude);
    const depthFrom = input.points.map((point) => point.depthFromCm ?? context.depthFromCm);
    const depthTo = input.points.map((point) => point.depthToCm ?? context.depthToCm);
    const subsampleCounts = input.points.map((point) => point.subsampleCount ?? null);
    const sourcePayloads = input.points.map((point) => JSON.stringify(point.sourcePayload ?? {}));

    const outsideCheck = await client.query<{ code: string }>(
      `WITH input AS (
         SELECT * FROM unnest($3::text[], $4::float8[], $5::float8[])
           AS t(code, longitude, latitude)
       ), boundary AS (
         SELECT f.boundary
         FROM collection_orders co
         JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
         JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
         WHERE co.tenant_id = $1::uuid AND co.id = $2::uuid
       )
       SELECT input.code
       FROM input, boundary
       WHERE NOT ST_Covers(boundary.boundary, ST_SetSRID(ST_MakePoint(input.longitude, input.latitude), 4326))`,
      [input.tenantId, input.orderId, codes, longitudes, latitudes],
    );
    const outside = outsideCheck.rows.map((row) => row.code);
    if (outside.length) throw new FieldOperationError(`${outside.length} ponto(s) estão fora do limite do talhão.`, 422, { outside: outside.slice(0, 25) });

    if (input.replaceExisting !== false) {
      await client.query("DELETE FROM sample_points WHERE tenant_id = $1::uuid AND collection_order_id = $2::uuid", [input.tenantId, input.orderId]);
    }

    await client.query(
      `WITH input AS (
         SELECT * FROM unnest($3::text[], $4::float8[], $5::float8[], $6::float8[], $7::float8[], $8::int[], $9::text[])
           WITH ORDINALITY AS t(code, longitude, latitude, depth_from_cm, depth_to_cm, subsample_count, source_payload, seq)
       )
       INSERT INTO sample_points
       (tenant_id, collection_order_id, code, sequence, position, depth_from_cm, depth_to_cm, subsample_count, gps_source, source_payload)
       SELECT $1::uuid, $2::uuid, input.code, input.seq::int,
              ST_SetSRID(ST_MakePoint(input.longitude, input.latitude), 4326),
              input.depth_from_cm, input.depth_to_cm, input.subsample_count, $10, input.source_payload::jsonb
       FROM input`,
      [input.tenantId, input.orderId, codes, longitudes, latitudes, depthFrom, depthTo, subsampleCounts, sourcePayloads, `IMPORTED_${input.source}`],
    );

    await client.query("UPDATE collection_orders SET sampling_strategy = 'IMPORTED', status = 'PLANNED' WHERE tenant_id = $1::uuid AND id = $2::uuid", [input.tenantId, input.orderId]);
    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "COLLECTION_POINTS_IMPORTED",
      entityType: "collection_order",
      entityId: input.orderId,
      metadata: { source: input.source, pointCount: input.points.length },
    });
    return { imported: input.points.length };
  });
}

export async function collectSamplePoint(input: {
  tenantId: string;
  userId: string;
  orderId: string;
  pointId: string;
  latitude: number;
  longitude: number;
  accuracyM?: number | null;
  subsampleCount?: number | null;
  notes?: string | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const validation = await client.query<{
      inside: boolean;
      distanceMeters: number;
      allowedMeters: number;
      code: string;
    }>(
      `SELECT
         ST_Covers(f.boundary, ST_SetSRID(ST_MakePoint($4,$5),4326)) AS inside,
         ST_Distance(sp.position::geography, ST_SetSRID(ST_MakePoint($4,$5),4326)::geography)::float8 AS "distanceMeters",
         greatest(75.0, coalesce($6::float8 * 2.0,0), coalesce(sqrt(co.grid_area_ha::float8 * 10000.0)/2.0,0))::float8 AS "allowedMeters",
         sp.code
       FROM sample_points sp
       JOIN collection_orders co ON co.tenant_id = sp.tenant_id AND co.id = sp.collection_order_id
       JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       WHERE sp.tenant_id = $1::uuid AND sp.collection_order_id = $2::uuid AND sp.id = $3::uuid`,
      [input.tenantId, input.orderId, input.pointId, input.longitude, input.latitude, input.accuracyM ?? null],
    );
    const point = validation.rows[0];
    if (!point) throw new FieldOperationError("Ponto de coleta não encontrado.", 404);
    if (!point.inside) throw new FieldOperationError("A posição GPS atual está fora do talhão.", 422);
    if (point.distanceMeters > point.allowedMeters) {
      throw new FieldOperationError("A posição GPS está distante demais do ponto planejado.", 409, {
        distanceMeters: Math.round(point.distanceMeters),
        allowedMeters: Math.round(point.allowedMeters),
        pointCode: point.code,
      });
    }

    const updated = await client.query(
      `UPDATE sample_points
       SET observed_position = ST_SetSRID(ST_MakePoint($4,$5),4326),
           accuracy_m = $6,
           subsample_count = coalesce($7,subsample_count),
           notes = coalesce(nullif($8,''),notes),
           collected_at = now(),
           collected_by = $9::uuid,
           gps_source = CASE WHEN gps_source IS NULL THEN 'BROWSER_GPS' ELSE gps_source || '+BROWSER_GPS' END
       WHERE tenant_id = $1::uuid AND collection_order_id = $2::uuid AND id = $3::uuid
       RETURNING id::text, code, collected_at::text AS "collectedAt"`,
      [input.tenantId, input.orderId, input.pointId, input.longitude, input.latitude, input.accuracyM ?? null, input.subsampleCount ?? null, input.notes ?? "", input.userId],
    );

    await client.query(
      `UPDATE collection_orders co
       SET status = CASE
         WHEN NOT EXISTS (SELECT 1 FROM sample_points sp WHERE sp.tenant_id = co.tenant_id AND sp.collection_order_id = co.id AND sp.collected_at IS NULL) THEN 'DONE'
         ELSE 'IN_PROGRESS' END
       WHERE co.tenant_id = $1::uuid AND co.id = $2::uuid`,
      [input.tenantId, input.orderId],
    );

    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "SAMPLE_POINT_COLLECTED",
      entityType: "sample_point",
      entityId: input.pointId,
      metadata: { orderId: input.orderId, distanceMeters: Math.round(point.distanceMeters), accuracyM: input.accuracyM ?? null },
    });
    return { ...updated.rows[0], distanceMeters: point.distanceMeters };
  });
}
