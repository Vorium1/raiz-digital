import pg from "pg";
import { runAgronomicEngine } from "../src/domain/agronomic-engine.ts";

/**
 * Diagnóstico read-only das 3 análises reais do Rafael Cabeda (AN-CABEDA-01/02/03).
 * NÃO altera nada no banco -- só lê e roda o motor determinístico em memória (a mesma
 * função `runAgronomicEngine` que a aplicação usa de verdade) contra o estado real E
 * contra uma simulação com um subconjunto de parâmetros marcado ACTIVE só em memória,
 * para comparar "hoje" vs "se homologado".
 */

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined });
await client.connect();

// Grupo A definido pela auditoria manual (ver docs/CABEDA_PIPELINE_DIAGNOSTICO_E_CORRECAO.md):
// método E unidade batem exatamente com o que o importador gravou -- nenhuma normalização necessária.
const GROUP_A_CODES = new Set(["CA", "MG", "MO", "CU", "ZN", "K", "P"]);

async function main() {
  const analyses = await client.query(`
    SELECT a.id::text, a.code, a.status AS analysis_status, a.crop_season_id::text,
           cs.crop_profile_id::text
    FROM analyses a JOIN crop_seasons cs ON cs.id = a.crop_season_id
    WHERE a.code LIKE 'AN-CABEDA-%' ORDER BY a.code
  `);

  const profileResult = await client.query(`SELECT id::text, code, name, status, semantic_version AS "semanticVersion", content_hash AS "contentHash" FROM crop_profiles WHERE code = 'SOJA'`);
  const profileRow = profileResult.rows[0];
  const paramsResult = await client.query(
    `SELECT id::text, parameter_code AS "parameterCode", parameter_category AS "parameterCategory", sample_type AS "sampleType",
            depth_from_cm::float8 AS "depthFromCm", depth_to_cm::float8 AS "depthToCm",
            analytical_method_allowed AS "analyticalMethodAllowed", unit_expected AS "unitExpected",
            sufficiency_ranges AS "sufficiencyRanges", criticality, status,
            condition_parameter_code AS "conditionParameterCode", condition_min::float8 AS "conditionMin", condition_max::float8 AS "conditionMax",
            derived_parameter_code AS "derivedParameterCode"
     FROM crop_profile_parameters WHERE crop_profile_id = $1::uuid`,
    [profileRow.id],
  );
  const realParams = paramsResult.rows;
  const simulatedParams = realParams.map((p) => (GROUP_A_CODES.has(p.parameterCode) ? { ...p, status: "ACTIVE" } : p));

  for (const analysis of analyses.rows) {
    const resultsResult = await client.query(
      `SELECT ls.laboratory_code AS "sampleCode", lr.parameter_code AS "parameterCode", lr.numeric_value::float8 AS "value",
              lr.unit, lr.analytical_method AS "method", lr.source, ls.sample_type AS "sampleType",
              sp.depth_from_cm::float8 AS "depthFromCm", sp.depth_to_cm::float8 AS "depthToCm"
       FROM lab_samples ls JOIN lab_results lr ON lr.lab_sample_id = ls.id
       LEFT JOIN sample_points sp ON sp.tenant_id = ls.tenant_id AND sp.id = ls.sample_point_id
       WHERE ls.analysis_id = $1::uuid ORDER BY ls.laboratory_code, lr.parameter_code`,
      [analysis.id],
    );
    const labResults = resultsResult.rows.map((r) => ({ ...r, depthFromCm: r.depthFromCm ?? null, depthToCm: r.depthToCm ?? null }));

    console.log(`\n${"=".repeat(100)}`);
    console.log(`${analysis.code}  (id=${analysis.id}, status=${analysis.analysis_status}, ${labResults.length} resultados)`);
    console.log("=".repeat(100));

    const cropProfileReal = { ...profileRow, parameters: realParams };
    const cropProfileSim = { ...profileRow, parameters: simulatedParams };

    const realEngine = runAgronomicEngine({ cropProfile: cropProfileReal, labResults });
    const simEngine = runAgronomicEngine({ cropProfile: cropProfileSim, labResults });

    // agrupa por (parameterCode, code, reason) para não listar 8x a mesma linha por amostra
    function summarize(engine) {
      const byParam = new Map();
      for (const item of engine.interpretation) {
        const key = item.parameterCode;
        if (!byParam.has(key)) byParam.set(key, { interpretable: 0, notInterpretable: 0, reasons: new Map() });
        const bucket = byParam.get(key);
        if (item.interpretable) bucket.interpretable += 1;
        else {
          bucket.notInterpretable += 1;
          const rKey = `${item.code}: ${item.reason}`;
          bucket.reasons.set(rKey, (bucket.reasons.get(rKey) ?? 0) + 1);
        }
      }
      return byParam;
    }

    const realSummary = summarize(realEngine);
    console.log(`\n-- ESTADO REAL (crop_profile_parameters como estão hoje no banco) --`);
    console.log(`interpretable (engine.interpretable): ${realEngine.interpretable}  |  status que seria salvo: ${realEngine.interpretable ? "IN_REVIEW" : "CALCULATED"}`);
    console.log(`total resultados: ${realEngine.interpretation.length}  |  interpretáveis: ${realEngine.interpretation.filter((i) => i.interpretable).length}  |  não interpretáveis: ${realEngine.interpretation.filter((i) => !i.interpretable).length}`);
    console.log(`pendencies[0] (o que a UI mostra hoje): "${realEngine.pendencies[0]}"`);
    console.log(`pendencies (todas, ${realEngine.pendencies.length} únicas):`);
    for (const p of realEngine.pendencies) console.log(`  - ${p}`);
    console.log(`\nPor parâmetro:`);
    for (const [code, bucket] of [...byCodeSorted(realSummary)]) {
      console.log(`  ${code}: ${bucket.interpretable} interpretável / ${bucket.notInterpretable} não -- ${[...bucket.reasons.entries()].map(([r, n]) => `${n}x [${r}]`).join("; ")}`);
    }

    const simSummary = summarize(simEngine);
    console.log(`\n-- SIMULAÇÃO (só em memória: ${[...GROUP_A_CODES].join(",")} marcados ACTIVE) --`);
    console.log(`interpretable: ${simEngine.interpretable}  |  status que seria salvo: ${simEngine.interpretable ? "IN_REVIEW" : "CALCULATED"}`);
    console.log(`total: ${simEngine.interpretation.length}  |  interpretáveis: ${simEngine.interpretation.filter((i) => i.interpretable).length}  |  não interpretáveis: ${simEngine.interpretation.filter((i) => !i.interpretable).length}`);
    console.log(`Por parâmetro:`);
    for (const [code, bucket] of [...byCodeSorted(simSummary)]) {
      console.log(`  ${code}: ${bucket.interpretable} interpretável / ${bucket.notInterpretable} não -- ${[...bucket.reasons.entries()].map(([r, n]) => `${n}x [${r}]`).join("; ")}`);
    }
  }
}

function byCodeSorted(map) {
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => client.end());
