import pg from "pg";

/**
 * Correção de dado ÚNICA (não migração de schema) -- as 3 análises AN-CABEDA-01/02/03 já foram importadas
 * por `scripts/import-cabeda-solo-2026.mjs` ANTES da correção de normalização de método existir (ver
 * `src/domain/lab-method-normalization.ts`). Este script corrige só os `lab_results` já inseridos, pro
 * único método com equivalência DEFENSÁVEL sem o PDF original (CTC -- mesma fórmula, notação abreviada) +
 * a normalização de unidade de P/K (mg/L -> mg/dm³, mesma grandeza, sem conversão de valor, alta confiança
 * mas pendente de confirmação documental -- ver `UNIT_ALIASES`). Preserva o texto exatamente como
 * importado em `original_payload.rawMethod`/`rawUnit` -- rastreabilidade completa, nunca perde o dado
 * original. Idempotente: rodar de novo não muda nada (WHERE já exclui linhas corrigidas).
 *
 * ATUALIZAÇÃO (fechamento técnico, item 5, 2026-09-11): S/B/MN foram REMOVIDOS deste script -- a correção
 * original presumia a técnica mais específica do que o laboratório escreveu, nunca confirmado contra o
 * documento original. As 48 linhas que este script já tinha corrigido pra essas 3 foram revertidas pro
 * texto bruto por `scripts/revert-cabeda-pending-method-normalization.mjs`. Rodar este script de novo é
 * seguro (idempotente, só toca CTC/P/K) -- mas não reaplica mais S/B/MN.
 */

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined });
await client.connect();

const METHOD_FIXES = [
  { parameterCode: "CTC", rawMethod: "Calculado: Ca+Mg+K+(H+Al)", canonicalMethod: "Calculado: CTCpH7,0 = Ca + Mg + K + (H+Al)" },
];
const UNIT_FIXES = [
  { parameterCode: "P", rawUnit: "mg/L", canonicalUnit: "mg/dm³" },
  { parameterCode: "K", rawUnit: "mg/L", canonicalUnit: "mg/dm³" },
];

async function main() {
  await client.query("BEGIN");

  let methodFixed = 0;
  for (const fix of METHOD_FIXES) {
    const result = await client.query(
      `UPDATE lab_results lr
       SET analytical_method = $3,
           original_payload = coalesce(lr.original_payload, '{}'::jsonb) || jsonb_build_object('rawMethod', $2::text)
       FROM lab_samples ls, analyses a
       WHERE lr.lab_sample_id = ls.id AND ls.analysis_id = a.id
         AND a.code LIKE 'AN-CABEDA-%'
         AND lr.parameter_code = $1 AND lr.analytical_method = $2
       RETURNING lr.id`,
      [fix.parameterCode, fix.rawMethod, fix.canonicalMethod],
    );
    console.log(`método ${fix.parameterCode} "${fix.rawMethod}" -> "${fix.canonicalMethod}": ${result.rowCount} linhas`);
    methodFixed += result.rowCount;
  }

  let unitFixed = 0;
  for (const fix of UNIT_FIXES) {
    const result = await client.query(
      `UPDATE lab_results lr
       SET unit = $3,
           original_payload = coalesce(lr.original_payload, '{}'::jsonb) || jsonb_build_object('rawUnit', $2::text)
       FROM lab_samples ls, analyses a
       WHERE lr.lab_sample_id = ls.id AND ls.analysis_id = a.id
         AND a.code LIKE 'AN-CABEDA-%'
         AND lr.parameter_code = $1 AND lr.unit = $2
       RETURNING lr.id`,
      [fix.parameterCode, fix.rawUnit, fix.canonicalUnit],
    );
    console.log(`unidade ${fix.parameterCode} "${fix.rawUnit}" -> "${fix.canonicalUnit}": ${result.rowCount} linhas`);
    unitFixed += result.rowCount;
  }

  await client.query("COMMIT");
  console.log(`\nOK -- ${methodFixed} linhas de método corrigidas, ${unitFixed} linhas de unidade corrigidas.`);
}

main()
  .catch(async (e) => { await client.query("ROLLBACK"); console.error(e); process.exitCode = 1; })
  .finally(() => client.end());
