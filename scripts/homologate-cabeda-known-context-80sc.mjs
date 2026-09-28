import pg from "pg";

/**
 * Homologação isolada do contexto operacional já confirmado para Cabeda.
 *
 * Valores confirmados pelo diretor do projeto:
 * - manejo: plantio direto consolidado;
 * - meta produtiva: 80 sc/ha de soja = 4,8 t/ha;
 * - primeiro cultivo após a análise;
 * - horizonte de planejamento: 5 anos;
 * - aplicação operacional uniforme por talhão, calculada a partir das doses por ponto.
 *
 * Importante: "plantio direto consolidado" NÃO resolve sozinho a condição de 10–20 cm para calagem.
 * Por isso persistimos NO_TILL_CONSOLIDATED_UNSPECIFIED, sem inventar "com" ou "sem restrições".
 *
 * Este script é somente para banco isolado de homologação. Não deve rodar em produção.
 */
const { Client } = pg;
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL ausente.");
if (process.env.ALLOW_HOMOLOGATION_WRITE !== "CABEDA_CONTEXT_80SC") {
  throw new Error("Fail-closed: defina ALLOW_HOMOLOGATION_WRITE=CABEDA_CONTEXT_80SC somente na homologação isolada.");
}

const client = new Client({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});
await client.connect();

const ANALYSIS_CODES = ["AN-CABEDA-01", "AN-CABEDA-02", "AN-CABEDA-03"];

async function main() {
  await client.query("BEGIN");
  try {
    const analyses = await client.query(
      `SELECT a.id::text, a.code, a.tenant_id::text AS "tenantId", a.crop_season_id::text AS "seasonId"
       FROM analyses a
       WHERE a.code = ANY($1::text[])
       ORDER BY a.code`,
      [ANALYSIS_CODES],
    );
    if (analyses.rows.length !== ANALYSIS_CODES.length) {
      throw new Error(`Esperadas ${ANALYSIS_CODES.length} análises Cabeda, encontradas ${analyses.rows.length}.`);
    }

    const tenantIds = [...new Set(analyses.rows.map((row) => row.tenantId))];
    if (tenantIds.length !== 1) throw new Error("Análises Cabeda não pertencem a um único tenant.");
    const tenantId = tenantIds[0];
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

    for (const analysis of analyses.rows) {
      await client.query(
        `UPDATE crop_seasons
         SET yield_goal = 4.8,
             yield_goal_unit = 't/ha',
             cultivation_order_after_soil_analysis = 1,
             management_system = 'NO_TILL_CONSOLIDATED_UNSPECIFIED',
             updated_at = clock_timestamp()
         WHERE tenant_id = $1::uuid AND id = $2::uuid`,
        [tenantId, analysis.seasonId],
      );

      await client.query(
        `UPDATE analyses
         SET analysis_context = jsonb_set(
               jsonb_set(
                 jsonb_set(
                   jsonb_set(
                     coalesce(analysis_context, '{}'::jsonb),
                     '{draft,tillageSystem}',
                     to_jsonb('NO_TILL_CONSOLIDATED_UNSPECIFIED'::text),
                     true
                   ),
                   '{draft,fertilityPlanningHorizonYears}',
                   '5'::jsonb,
                   true
                 ),
                 '{draft,plannedManagementNotes}',
                 to_jsonb('Meta operacional confirmada: soja 80 sc/ha; regulagem uniforme por talhão a partir das doses determinísticas por ponto.'::text),
                 true
               ),
               '{draft,fertilityCyclePlanNotes}',
               to_jsonb('Planejar manutenção para a meta de 80 sc/ha. Reavaliar P/K com nova análise após dois cultivos antes de congelar doses dos anos seguintes.'::text),
               true
             ),
             updated_at = clock_timestamp()
         WHERE tenant_id = $1::uuid AND id = $2::uuid`,
        [tenantId, analysis.id],
      );
    }

    await client.query(
      `INSERT INTO audit_events
       (tenant_id, actor_type, action, entity_type, entity_id, metadata)
       VALUES (
         $1::uuid,
         'SYSTEM',
         'CABEDA_CONTEXT_80SC_HOMOLOGATED',
         'tenant',
         $1::uuid,
         $2::jsonb
       )`,
      [
        tenantId,
        JSON.stringify({
          analyses: ANALYSIS_CODES,
          yieldGoalTonPerHa: 4.8,
          yieldGoalScPerHa: 80,
          cultivationOrderAfterSoilAnalysis: 1,
          managementSystem: "NO_TILL_CONSOLIDATED_UNSPECIFIED",
          fertilityPlanningHorizonYears: 5,
          source: "contexto confirmado pelo diretor do projeto RAIZ",
          productionWriteAllowed: false,
        }),
      ],
    );

    await client.query("COMMIT");
    console.log(JSON.stringify({
      ok: true,
      analyses: ANALYSIS_CODES,
      yieldGoalTonPerHa: 4.8,
      managementSystem: "NO_TILL_CONSOLIDATED_UNSPECIFIED",
      fertilityPlanningHorizonYears: 5,
    }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.end());
