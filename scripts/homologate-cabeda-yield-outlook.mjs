import { getPool } from "../src/lib/db.ts";
import { getFieldYieldOutlook } from "../src/lib/repositories/yield-outlook.ts";

const expectedGuard = "PR88_CABEDA_OFFICIAL_RESULT";

async function main() {
  const pool = getPool();
  const client = await pool.connect();
  let rows;
  try {
    const guard = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM homologation_write_guard WHERE guard_key=$1
       ) AS ok`,
      [expectedGuard],
    );
    if (!guard.rows[0]?.ok) throw new Error("READ_GUARD_REFUSED: banco não é a homologação isolada do PR #88.");

    const result = await client.query(
      `SELECT f.id::text AS "fieldId",f.name AS "fieldName",a.tenant_id::text AS "tenantId",a.created_by::text AS "userId"
       FROM fields f
       JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
       JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
       JOIN crop_seasons cs ON cs.tenant_id=f.tenant_id AND cs.field_id=f.id
       JOIN analyses a ON a.tenant_id=cs.tenant_id AND a.crop_season_id=cs.id
       WHERE c.name='Rafael Cabeda' AND f.name IN ('Área 01','Área 02','Área 03')
       ORDER BY f.name`,
    );
    rows=result.rows;
    if (rows.length !== 3) throw new Error(`Esperados 3 talhões Cabeda; encontrados ${rows.length}.`);
  } finally {
    client.release();
  }

  const results=[];
  for (const row of rows) {
    const outlook=await getFieldYieldOutlook({
      tenantId: row.tenantId,
      userId: row.userId,
      fieldId: row.fieldId,
    });
    results.push({
      fieldName: row.fieldName,
      municipality: outlook?.regional?.municipality ?? null,
      state: outlook?.regional?.state ?? null,
      municipalityCode: outlook?.regional?.municipalityCode ?? null,
      sampleYears: outlook?.regional?.sampleYears ?? 0,
      latest: outlook?.regional?.latest ?? null,
      medianKgHa: outlook?.regional?.medianKgHa ?? null,
      p75KgHa: outlook?.regional?.p75KgHa ?? null,
      scenarioScHa: outlook?.regional?.scenarioScHa ?? null,
      scenarioTotalT: outlook?.regional?.scenarioTotalT ?? null,
      scenarioTotalSacks60kg: outlook?.regional?.scenarioTotalSacks60kg ?? null,
      forecastReady: outlook?.forecastReadiness.ready ?? false,
      blockers: outlook?.forecastReadiness.blockers ?? [],
      sourceError: outlook?.sourceError ?? null,
    });
  }

  console.log(JSON.stringify({
    environment:"isolated-homologation-read-only",
    source:"IBGE/PAM SIDRA 5457",
    results,
  },null,2));
}

main()
  .catch((error)=>{ console.error(error instanceof Error?error.message:String(error)); process.exitCode=1; })
  .finally(async()=>{ await getPool().end().catch(()=>{}); });
