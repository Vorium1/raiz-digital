import assert from "node:assert/strict";
import pg from "pg";
import { runAgronomicEngine } from "../src/domain/agronomic-engine.ts";

/**
 * Teste de aceitação reproduzível pro dado REAL do Cabeda (item 11 da auditoria RAIZ_2.0, 2026-09-11) --
 * não é fixture do e2e global (dado real de cliente, não recriável em outro ambiente), mas prova, contra
 * o banco de verdade, que:
 *  1) as 3 análises têm a contagem exata de resultados classificados esperada;
 *  2) as classificações batem com as faixas reais da fonte (CQFS-RS/SC 2016), não um valor inventado;
 *  3) as pendências restantes são só as legítimas (parâmetro sem faixa estática nesta edição do manual, ou
 *     ainda em Grupo B/revisão), nunca uma pendência nova/inesperada.
 * Roda só leitura (não muda nada no banco) -- `node --env-file=.env --experimental-strip-types
 * scripts/acceptance-cabeda.mjs`.
 */

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined });
await client.connect();

const EXPECTED = {
  "AN-CABEDA-01": { total: 128, interpretable: 56 },
  "AN-CABEDA-02": { total: 64, interpretable: 28 },
  "AN-CABEDA-03": { total: 64, interpretable: 28 },
};
const EXPECTED_PENDING_CODES = new Set(["AL", "B", "CLAY", "CTC", "H_AL", "MN", "PH", "S", "SMP"]);
const INTERPRETABLE_CODES = new Set(["CA", "MG", "MO", "CU", "ZN", "K", "P"]);

async function main() {
  const profile = await client.query(`SELECT id::text, code, name, status, semantic_version AS "semanticVersion", content_hash AS "contentHash" FROM crop_profiles WHERE code = 'SOJA'`);
  const profileRow = profile.rows[0];
  assert.ok(profileRow, "crop_profile SOJA não encontrado.");
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
  const cropProfile = { ...profileRow, parameters: paramsResult.rows };

  for (const code of INTERPRETABLE_CODES) {
    const active = cropProfile.parameters.some((p) => p.parameterCode === code && p.status === "ACTIVE");
    assert.ok(active, `esperava ${code} ACTIVE no perfil SOJA -- homologação do Grupo A não está mais aplicada.`);
  }

  const analyses = await client.query(`SELECT id::text, code FROM analyses WHERE code LIKE 'AN-CABEDA-%' ORDER BY code`);
  assert.equal(analyses.rows.length, 3, "esperava exatamente 3 análises AN-CABEDA-*.");

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
    const engine = runAgronomicEngine({ cropProfile, labResults });

    const expected = EXPECTED[analysis.code];
    assert.ok(expected, `sem expectativa cadastrada pra ${analysis.code}.`);
    const total = engine.interpretation.length;
    const interpretable = engine.interpretation.filter((i) => i.interpretable).length;
    assert.equal(total, expected.total, `${analysis.code}: total de resultados esperado ${expected.total}, veio ${total}.`);
    assert.equal(interpretable, expected.interpretable, `${analysis.code}: interpretáveis esperado ${expected.interpretable}, veio ${interpretable}.`);
    assert.equal(engine.interpretable, true, `${analysis.code}: engine.interpretable deveria ser true (pelo menos 1 parâmetro classificado).`);

    // Nenhum item interpretável fora do Grupo A -- prova que só os parâmetros homologados classificaram.
    for (const item of engine.interpretation) {
      if (item.interpretable) assert.ok(INTERPRETABLE_CODES.has(item.parameterCode), `${analysis.code}: ${item.parameterCode} classificou mas não é Grupo A -- inesperado.`);
      else assert.ok(EXPECTED_PENDING_CODES.has(item.parameterCode), `${analysis.code}: pendência inesperada em ${item.parameterCode} (${item.reason}).`);
    }

    // Sanity check manual: CA sempre classifica "Alto" quando >=4.0 cmolc/dm³ (todos os pontos reais do
    // Cabeda têm Ca entre 4.67 e 7.25 -- nenhum ponto cai em Baixo/Médio nesta safra específica).
    const caItems = engine.interpretation.filter((i) => i.parameterCode === "CA" && i.interpretable);
    for (const item of caItems) {
      const fact = engine.facts.find((f) => f.sampleCode === item.sampleCode && f.parameterCode === "CA");
      assert.ok(fact.value >= 4.0, `${analysis.code}/${item.sampleCode}: CA=${fact.value} classificou Alto mas é <4.0 -- regra quebrada.`);
      assert.equal(item.classification, "Alto", `${analysis.code}/${item.sampleCode}: CA=${fact.value} deveria classificar Alto.`);
    }

    console.log(`${analysis.code}: OK -- ${interpretable}/${total} interpretados, ${engine.pendencies.length} pendências (todas esperadas).`);
  }

  console.log("\nOK -- todas as asserções passaram.");
}

main()
  .catch((e) => { console.error("\nFALHOU:", e.message); process.exitCode = 1; })
  .finally(() => client.end());
