import assert from "node:assert/strict";
import { getPool } from "../src/lib/db.ts";
import { auxiliaryParameterCodesFor } from "../src/domain/crop-profile-auxiliary-parameters.ts";
import { runAgronomicEngine } from "../src/domain/agronomic-engine.ts";
import { normalizeAnalyticalMethod, normalizeUnit } from "../src/domain/lab-method-normalization.ts";
import { evaluateSoybeanLimingFromEvidence } from "../src/domain/soybean-liming-evidence.ts";

const analysisCodes = ["AN-CABEDA-01", "AN-CABEDA-02", "AN-CABEDA-03"];
const protocolResolvedParameters = ["B", "MN", "S", "CU", "ZN"];
const canonicalizedParameters = ["CTC", "P", "K"];

function requireEnv(name, value) {
  if (!value) throw new Error(`${name} não configurado no environment de homologação.`);
}

function compactCounts(items) {
  const counts = {};
  for (const item of items) {
    const key = item.interpretable ? "INTERPRETABLE" : item.code;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function main() {
  requireEnv(
    "DATABASE_URL/APP_DATABASE_URL",
    (process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL)?.trim() ?? "",
  );

  const client = await getPool().connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN READ ONLY");
    transactionOpen = true;

    const analysesResult = await client.query(
      `SELECT
         a.id::text,
         a.code,
         a.tenant_id::text AS "tenantId",
         cs.crop_profile_id::text AS "cropProfileId",
         cs.management_system AS "managementSystem",
         a.analysis_context->'draft'->>'tillageSystem' AS "analysisTillageSystem",
         p.state
       FROM analyses a
       JOIN crop_seasons cs
         ON cs.tenant_id = a.tenant_id
        AND cs.id = a.crop_season_id
       JOIN fields f
         ON f.tenant_id = cs.tenant_id
        AND f.id = cs.field_id
       JOIN properties p
         ON p.tenant_id = f.tenant_id
        AND p.id = f.property_id
       WHERE a.code = ANY($1::text[])
       ORDER BY a.code`,
      [analysisCodes],
    );

    assert.equal(
      analysesResult.rows.length,
      analysisCodes.length,
      `Esperadas ${analysisCodes.length} análises Cabeda na homologação isolada.`,
    );

    const tenantIds = [...new Set(analysesResult.rows.map((row) => row.tenantId))];
    assert.equal(tenantIds.length, 1, "As análises Cabeda precisam pertencer ao mesmo tenant.");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantIds[0]]);

    const results = [];

    for (const analysis of analysesResult.rows) {
      assert.ok(analysis.cropProfileId, `${analysis.code}: crop_profile_id ausente.`);

      const profileResult = await client.query(
        `SELECT
           id::text,
           code,
           name,
           status,
           semantic_version AS "semanticVersion",
           content_hash AS "contentHash"
         FROM crop_profiles
         WHERE id = $1::uuid`,
        [analysis.cropProfileId],
      );
      const profileRow = profileResult.rows[0];
      assert.ok(profileRow, `${analysis.code}: perfil agronômico não encontrado.`);

      const paramsResult = await client.query(
        `SELECT
           id::text,
           parameter_code AS "parameterCode",
           parameter_category AS "parameterCategory",
           sample_type AS "sampleType",
           depth_from_cm::float8 AS "depthFromCm",
           depth_to_cm::float8 AS "depthToCm",
           analytical_method_allowed AS "analyticalMethodAllowed",
           unit_expected AS "unitExpected",
           sufficiency_ranges AS "sufficiencyRanges",
           criticality,
           status,
           condition_parameter_code AS "conditionParameterCode",
           condition_min::float8 AS "conditionMin",
           condition_max::float8 AS "conditionMax",
           derived_parameter_code AS "derivedParameterCode"
         FROM crop_profile_parameters
         WHERE crop_profile_id = $1::uuid`,
        [analysis.cropProfileId],
      );

      const labResult = await client.query(
        `SELECT
           ls.laboratory_code AS "sampleCode",
           lr.parameter_code AS "parameterCode",
           lr.numeric_value::float8 AS value,
           lr.unit,
           lr.analytical_method AS method,
           lr.original_payload->>'protocol' AS protocol,
           lr.source,
           ls.sample_type AS "sampleType",
           sp.depth_from_cm::float8 AS "depthFromCm",
           sp.depth_to_cm::float8 AS "depthToCm"
         FROM lab_samples ls
         JOIN lab_results lr
           ON lr.tenant_id = ls.tenant_id
          AND lr.lab_sample_id = ls.id
         LEFT JOIN sample_points sp
           ON sp.tenant_id = ls.tenant_id
          AND sp.id = ls.sample_point_id
         WHERE ls.tenant_id = $1::uuid
           AND ls.analysis_id = $2::uuid
         ORDER BY ls.laboratory_code, lr.parameter_code`,
        [analysis.tenantId, analysis.id],
      );

      assert.ok(labResult.rows.length > 0, `${analysis.code}: nenhum resultado laboratorial encontrado.`);

      const rawByParameter = new Map();
      for (const row of labResult.rows) {
        if (!rawByParameter.has(row.parameterCode)) rawByParameter.set(row.parameterCode, []);
        rawByParameter.get(row.parameterCode).push(row);
      }

      const labResults = labResult.rows.map((row) => ({
        ...row,
        unit: normalizeUnit(row.parameterCode, row.unit),
        method: normalizeAnalyticalMethod(row.parameterCode, row.method, row.protocol),
        depthFromCm: row.depthFromCm ?? null,
        depthToCm: row.depthToCm ?? null,
      }));

      const limingParameterCodes = new Set(["PH", "SMP", "V", "AL", "CA", "MG", "K", "CTC", "H_AL"]);
      const limingBySample = new Map();
      for (const row of labResults) {
        if (!limingParameterCodes.has(row.parameterCode)) continue;
        const entry = limingBySample.get(row.sampleCode) ?? {
          sampleCode: row.sampleCode,
          depthFromCm: row.depthFromCm,
          depthToCm: row.depthToCm,
          parameters: {},
        };
        entry.parameters[row.parameterCode] = {
          value: row.value,
          unit: row.unit,
          method: row.method,
        };
        limingBySample.set(row.sampleCode, entry);
      }

      const cropProfile = {
        ...profileRow,
        parameters: paramsResult.rows,
        auxiliaryParameterCodes: auxiliaryParameterCodesFor(profileRow.code),
      };

      const engineResult = runAgronomicEngine({ cropProfile, labResults });

      const limingSystems = [
        "CONVENTIONAL",
        "NO_TILL_ESTABLISHMENT",
        "NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS",
        "NO_TILL_CONSOLIDATED_WITH_10_20_RESTRICTIONS",
      ];
      const limingScenarios = Object.fromEntries(
        limingSystems.map((managementSystem) => {
          const decision = evaluateSoybeanLimingFromEvidence({
            cropCode: profileRow.code,
            state: analysis.state,
            managementSystem,
            results: labResults,
          });
          return [managementSystem, {
            status: decision.status,
            automaticUniformDoseAllowed: decision.automaticUniformDoseAllowed,
            uniformDoseTonHaPrnt100: decision.uniformDoseTonHaPrnt100,
            automaticGeneralDoseAllowed: decision.automaticGeneralDoseAllowed,
            operationalGeneralDoseTonHaPrnt100: decision.operationalGeneralDoseTonHaPrnt100,
            generalDoseBasis: decision.generalDoseBasis,
            doseRangeTonHaPrnt100: decision.doseRangeTonHaPrnt100,
            applicationMode: decision.applicationMode,
            blockers: decision.blockers,
            samples: decision.sampleDecisions.map((item) => ({
              sampleCode: item.sampleCode,
              decision: item.decision,
              doseTonHaPrnt100: item.recommendedDoseTonHaPrnt100,
              baseSaturationPct: item.baseSaturationPct,
              aluminumSaturationPct: item.aluminumSaturationPct,
              blockers: item.blockers,
            })),
          }];
        }),
      );

      const checks = {};
      for (const parameterCode of protocolResolvedParameters) {
        const rawRows = rawByParameter.get(parameterCode) ?? [];
        assert.ok(rawRows.length > 0, `${analysis.code}: faltam resultados reais de ${parameterCode} para validar o protocolo.`);

        assert.ok(
          rawRows.every((row) => row.protocol?.includes("Tedesco") && row.protocol?.includes("1995")),
          `${analysis.code}/${parameterCode}: protocolo Tedesco 1995 não foi persistido em todas as linhas.`,
        );

        const items = engineResult.interpretation.filter(
          (item) => item.parameterCode === parameterCode && item.classificationRole === "TARGET",
        );
        assert.equal(
          items.length,
          rawRows.length,
          `${analysis.code}/${parameterCode}: quantidade de interpretações divergiu dos resultados laboratoriais.`,
        );
        assert.ok(
          items.every((item) => item.interpretable),
          `${analysis.code}/${parameterCode}: protocolo declarado ainda deixou resultado sem interpretação.`,
        );
        checks[parameterCode] = compactCounts(items);
      }

      for (const parameterCode of canonicalizedParameters) {
        const rawRows = rawByParameter.get(parameterCode) ?? [];
        assert.ok(rawRows.length > 0, `${analysis.code}: faltam resultados reais de ${parameterCode}.`);
        const items = engineResult.interpretation.filter(
          (item) => item.parameterCode === parameterCode && item.classificationRole === "TARGET",
        );
        assert.ok(
          items.length > 0 && items.every((item) => item.interpretable),
          `${analysis.code}/${parameterCode}: normalização segura deixou de produzir classificação interpretável.`,
        );
        checks[parameterCode] = compactCounts(items);
      }

      results.push({
        code: analysis.code,
        cropProfile: profileRow.code,
        profileVersion: profileRow.semanticVersion,
        sampleCount: new Set(labResults.map((row) => row.sampleCode)).size,
        resultCount: labResults.length,
        engineInterpretable: engineResult.interpretable,
        confidence: engineResult.confidence.level,
        managementSystem: analysis.managementSystem ?? null,
        analysisTillageSystem: analysis.analysisTillageSystem ?? null,
        limingInputs: [...limingBySample.values()],
        limingScenarios,
        checks,
      });
    }

    await client.query("ROLLBACK");
    transactionOpen = false;

    console.log(JSON.stringify({
      environment: "isolated-homologation-read-only",
      mode: "BEGIN READ ONLY + ROLLBACK",
      assertions: {
        protocolResolvedParameters,
        safeCanonicalizationParameters: canonicalizedParameters,
      },
      results,
    }, null, 2));
  } finally {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => {});
    client.release();
    await getPool().end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
