import pg from "pg";

/**
 * Importa os laudos reais de análise de solo da Fazenda Rafael Cabeda
 * (Água Santa - RS), coletados/laboratório Mondial (Relatórios de Ensaio
 * 1414-1429/2026), com o serviço prestado por GrãoSul + AgroFértil
 * Consultoria Agrícola (técnico: Éder). Fonte: pasta "análises de solos"
 * na Área de Trabalho do diretor -- 3 PDFs (um por área) + 3 capas com
 * área real em ha + 3 imagens de layout de pontos (sem coordenadas GPS
 * reais, só esboço relativo).
 *
 * TRANSCRIÇÃO: cada valor abaixo foi lido diretamente do PDF oficial do
 * laboratório (Mondial, CNPJ 32.383.245.0001/31) via leitura de documento,
 * conferido número a número contra o texto extraído E a tabela renderizada
 * de cada página (bateram). Ainda assim, `analyses.source_human_verified`
 * fica FALSE -- confirmação humana real (o diretor ou um agrônomo
 * conferindo contra o PDF original) ainda não aconteceu, e essa é a marca
 * que o resto do sistema usa pra saber se um humano já validou.
 *
 * GPS: os documentos de origem não têm coordenada real capturada em campo
 * -- só um esboço de layout relativo dos pontos dentro do polígono da
 * área. Por isso as posições aqui são uma APROXIMAÇÃO construída (um
 * retângulo do tamanho real em hectares, perto do centro aproximado do
 * município de Água Santa-RS), não uma captura GPS real. Documentado em
 * `sample_points.gps_source` como 'ESTIMADO_SEM_CAPTURA_REAL' -- nunca deve
 * ser tratado como posição de campo real pra fins de precisão métrica.
 */

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined });

const TENANT_ID = "dc3854e1-8721-4041-ba9c-1e8c1657202f"; // Raiz Digital Demo
const ADMIN_ID = "049d3717-84f9-42fc-97d7-aacc22304f5b"; // admin@raiz.local

// Centro aproximado de Água Santa - RS (não é GPS real de campo, ver nota de topo).
const CENTER_LAT = -28.175;
const CENTER_LON = -51.90;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = 111320 * Math.cos((CENTER_LAT * Math.PI) / 180);

function offsetToLatLon(dxMeters, dyMeters) {
  return { lat: CENTER_LAT + dyMeters / M_PER_DEG_LAT, lon: CENTER_LON + dxMeters / M_PER_DEG_LON };
}

function rectanglePolygonWkt(centerX, centerY, widthM, heightM) {
  const corners = [
    [centerX - widthM / 2, centerY - heightM / 2],
    [centerX + widthM / 2, centerY - heightM / 2],
    [centerX + widthM / 2, centerY + heightM / 2],
    [centerX - widthM / 2, centerY + heightM / 2],
    [centerX - widthM / 2, centerY - heightM / 2],
  ].map(([x, y]) => offsetToLatLon(x, y));
  const ring = corners.map((c) => `${c.lon} ${c.lat}`).join(",");
  return `MULTIPOLYGON(((${ring})))`;
}

function pointWkt(centerX, centerY) {
  const { lat, lon } = offsetToLatLon(centerX, centerY);
  return `POINT(${lon} ${lat})`;
}

// [argila%, ph_h2o, smp, p_mgL, k_mgL, mo_pct, al, ca, mg, h_al, ctc_ph7, s, zn, cu, b, mn, fe]
const AREA_01_POINTS = [
  [72, 5.3, 5.6, 11.0, 229.9, 3.30, 0.10, 6.29, 2.61, 6.6, 16.1, 9.8, 4.4, 2.8, 0.3, 30.9, null],
  [62, 5.3, 5.5, 9.8, 187.7, 2.80, 0.10, 5.70, 2.51, 7.4, 16.1, 8.4, 4.1, 2.9, 0.3, 28.3, null],
  [59, 5.4, 5.8, 7.2, 151.8, 2.70, 0.10, 5.62, 2.63, 5.7, 14.4, 12.2, 2.5, 3.0, 0.2, 16.8, null],
  [67, 5.4, 5.8, 9.1, 200.0, 2.70, 0.10, 5.98, 3.01, 5.3, 14.8, 6.9, 2.8, 2.4, 0.3, 18.9, null],
  [79, 5.3, 5.8, 7.8, 189.8, 2.60, 0.10, 5.61, 2.53, 5.5, 14.2, 12.8, 2.1, 2.1, 0.6, 23.6, null],
  [72, 5.2, 5.8, 6.0, 166.1, 2.80, 0.20, 5.61, 2.51, 5.8, 14.4, 8.4, 1.9, 1.8, 0.8, 34.3, null],
  [69, 5.1, 5.7, 9.0, 233.2, 3.00, 0.20, 4.97, 2.10, 6.1, 13.8, 12.1, 2.5, 2.3, 0.4, 39.4, null],
  [58, 5.2, 5.7, 21.2, 179.3, 3.20, 0.10, 5.73, 2.68, 6.4, 15.3, 8.9, 4.1, 2.8, 0.3, 37.3, null],
];
const AREA_02_POINTS = [
  [74, 5.8, 6.0, 21.6, 216.3, 3.00, 0.00, 7.00, 4.77, 4.2, 16.5, 5.5, 2.9, 1.7, 0.4, 14.3, null],
  [77, 5.7, 6.0, 11.2, 200.2, 2.70, 0.00, 6.89, 4.67, 4.6, 16.7, 8.0, 2.1, 2.0, 0.3, 25.5, null],
  [74, 5.7, 6.0, 13.6, 210.5, 3.10, 0.00, 6.91, 4.00, 4.4, 15.8, 9.2, 2.7, 1.9, 0.5, 23.7, null],
  [79, 5.8, 6.0, 30.2, 230.5, 3.10, 0.00, 6.82, 4.23, 4.6, 16.2, 8.4, 2.7, 1.5, 0.2, 17.0, null],
];
const AREA_03_POINTS = [
  [75, 5.4, 5.7, 8.2, 160.9, 2.90, 0.20, 5.86, 2.87, 6.1, 15.2, 9.5, 1.9, 2.1, 0.2, 22.2, null],
  [77, 5.4, 5.8, 7.5, 89.4, 3.10, 0.10, 6.26, 3.09, 5.4, 15.0, 6.0, 2.1, 1.8, 0.8, 31.7, null],
  [67, 5.4, 5.8, 4.1, 126.0, 3.10, 0.10, 6.23, 3.55, 5.4, 15.5, 14.2, 2.7, 2.9, 0.8, 47.5, null],
  [56, 5.4, 5.6, 13.3, 198.1, 2.80, 0.10, 7.25, 2.70, 6.7, 17.2, 13.7, 3.9, 2.5, 0.6, 35.6, null],
];

const AREAS = [
  { name: "Área 01", areaHa: 4.32, sqcStart: 1136, relatorioStart: 1414, points: AREA_01_POINTS, offsetX: -400 },
  { name: "Área 02", areaHa: 2.13, sqcStart: 1144, relatorioStart: 1422, points: AREA_02_POINTS, offsetX: 0 },
  { name: "Área 03", areaHa: 2.0, sqcStart: 1148, relatorioStart: 1426, points: AREA_03_POINTS, offsetX: 400 },
];

function toRow(point) {
  const [clay, ph, smp, p, k, mo, al, ca, mg, hAl, ctc, s, zn, cu, b, mn] = point;
  return [
    { code: "CLAY", value: clay, unit: "%", method: "Densímetro" },
    { code: "PH", value: ph, unit: "", method: "H2O" },
    { code: "SMP", value: smp, unit: "", method: "Índice SMP" },
    { code: "P", value: p, unit: "mg/L", method: "Mehlich-1" },
    { code: "K", value: k, unit: "mg/L", method: "Mehlich-1" },
    { code: "MO", value: mo, unit: "%", method: "Oxidação sulfocrômica" },
    { code: "AL", value: al, unit: "cmolc/dm³", method: "KCl 1 mol/L" },
    { code: "CA", value: ca, unit: "cmolc/dm³", method: "KCl 1 mol/L" },
    { code: "MG", value: mg, unit: "cmolc/dm³", method: "KCl 1 mol/L" },
    { code: "H_AL", value: hAl, unit: "cmolc/dm³", method: "SMP" },
    { code: "CTC", value: ctc, unit: "cmolc/dm³", method: "Calculado: Ca+Mg+K+(H+Al)" },
    { code: "S", value: s, unit: "mg/dm³", method: "Turbidimetria" },
    { code: "ZN", value: zn, unit: "mg/dm³", method: "Mehlich-1" },
    { code: "CU", value: cu, unit: "mg/dm³", method: "Mehlich-1" },
    { code: "B", value: b, unit: "mg/dm³", method: "Água quente" },
    { code: "MN", value: mn, unit: "mg/dm³", method: "KCl 1 mol/L" },
  ];
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT_ID]);
    await client.query("SELECT set_config('app.user_id', $1, true)", [ADMIN_ID]);

    const clientResult = await client.query(
      `INSERT INTO clients (tenant_id, name, notes) VALUES ($1::uuid, 'Rafael Cabeda', 'Produtor rural, Água Santa - RS. Serviço de mapeamento de fertilidade prestado por GrãoSul + AgroFértil Consultoria Agrícola (técnico Éder).')
       RETURNING id::text`,
      [TENANT_ID],
    );
    const clientId = clientResult.rows[0].id;
    console.log("client:", clientId);

    const propertyResult = await client.query(
      `INSERT INTO properties (tenant_id, client_id, name, municipality, state)
       VALUES ($1::uuid, $2::uuid, 'Propriedade Rafael Cabeda', 'Água Santa', 'RS') RETURNING id::text`,
      [TENANT_ID, clientId],
    );
    const propertyId = propertyResult.rows[0].id;
    console.log("property:", propertyId);

    const laboratoryResult = await client.query(
      `INSERT INTO laboratories (tenant_id, name, tax_id, active) VALUES ($1::uuid, 'Mondial Laboratório de Produtos Químicos Ltda', '32.383.245.0001/31', true) RETURNING id::text`,
      [TENANT_ID],
    );
    const laboratoryId = laboratoryResult.rows[0].id;
    console.log("laboratory:", laboratoryId);

    for (const area of AREAS) {
      const widthM = Math.sqrt(area.areaHa * 10000 * 2.2);
      const heightM = (area.areaHa * 10000) / widthM;
      const boundaryWkt = rectanglePolygonWkt(area.offsetX, 0, widthM, heightM);

      const fieldResult = await client.query(
        `INSERT INTO fields (tenant_id, property_id, name, area_ha, boundary)
         VALUES ($1::uuid, $2::uuid, $3, $4, ST_SetSRID(ST_GeomFromText($5), 4326)) RETURNING id::text`,
        [TENANT_ID, propertyId, area.name, area.areaHa, boundaryWkt],
      );
      const fieldId = fieldResult.rows[0].id;
      console.log(`field ${area.name}:`, fieldId);

      const seasonResult = await client.query(
        `INSERT INTO crop_seasons (tenant_id, field_id, season_label, current_crop, next_crop)
         VALUES ($1::uuid, $2::uuid, '2026/27', NULL, 'Soja') RETURNING id::text`,
        [TENANT_ID, fieldId],
      );
      const seasonId = seasonResult.rows[0].id;

      const subsamplePerPoint = area.name === "Área 01" ? 12 : 12; // 96/8 e 48/4 -- consistente nas 3 áreas
      const orderResult = await client.query(
        `INSERT INTO collection_orders (tenant_id, crop_season_id, assigned_to, code, grid_area_ha, depth_from_cm, depth_to_cm, planned_at, status, sampling_strategy)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 0.5, 0, 20, '2026-07-01', 'DONE', 'GRID')
         RETURNING id::text`,
        [TENANT_ID, seasonId, ADMIN_ID, `CO-CABEDA-${area.name.replace(/\D/g, "")}`],
      );
      const orderId = orderResult.rows[0].id;

      const analysisResult = await client.query(
        `INSERT INTO analyses (tenant_id, crop_season_id, collection_order_id, laboratory_id, code, status, source_type, source_human_verified, created_by)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'IMPORTED', 'PDF_OCR', false, $6::uuid)
         RETURNING id::text`,
        [TENANT_ID, seasonId, orderId, laboratoryId, `AN-CABEDA-${area.name.replace(/\D/g, "")}`, ADMIN_ID],
      );
      const analysisId = analysisResult.rows[0].id;
      console.log(`  analysis ${area.name}:`, analysisId);

      const pointsPerRow = 5;
      const spacingX = widthM / (pointsPerRow + 1);
      const spacingY = heightM / 3;

      for (let i = 0; i < area.points.length; i++) {
        const pointCode = String(i + 1).padStart(2, "0");
        const col = i % pointsPerRow;
        const row = Math.floor(i / pointsPerRow);
        const px = area.offsetX - widthM / 2 + spacingX * (col + 1);
        const py = -heightM / 2 + spacingY * (row + 1);

        const spResult = await client.query(
          `INSERT INTO sample_points (tenant_id, collection_order_id, code, position, collected_at, collected_by, depth_from_cm, depth_to_cm, subsample_count, gps_source, notes)
           VALUES ($1::uuid, $2::uuid, $3, ST_SetSRID(ST_GeomFromText($4), 4326), '2026-07-01', $5::uuid, 0, 20, $6, 'ESTIMADO_SEM_CAPTURA_REAL', 'Posição aproximada -- documento de origem não trouxe coordenada GPS real, só esboço relativo de layout.')
           RETURNING id::text`,
          [TENANT_ID, orderId, pointCode, pointWkt(px, py), ADMIN_ID, subsamplePerPoint],
        );
        const samplePointId = spResult.rows[0].id;

        const sqc = `SQC${area.sqcStart + i}/2026`;
        const labSampleResult = await client.query(
          `INSERT INTO lab_samples (tenant_id, analysis_id, sample_point_id, laboratory_code, sampled_at, received_at, sample_type)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, '2026-07-01', '2026-07-10', 'SOLO') RETURNING id::text`,
          [TENANT_ID, analysisId, samplePointId, sqc],
        );
        const labSampleId = labSampleResult.rows[0].id;

        const rows = toRow(area.points[i]);
        for (const r of rows) {
          if (r.value == null) continue;
          await client.query(
            `INSERT INTO lab_results (tenant_id, lab_sample_id, parameter_code, numeric_value, unit, analytical_method, source, original_payload)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, 'MEASURED', $7::jsonb)`,
            [TENANT_ID, labSampleId, r.code, r.value, r.unit, r.method, JSON.stringify({ relatorioEnsaio: area.relatorioStart + i, sqc })],
          );
        }
      }
      console.log(`  ${area.points.length} pontos importados para ${area.name}`);
    }

    await client.query("COMMIT");
    console.log("OK -- importação concluída.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
