import pg from "pg";

/**
 * Correção de dado ÚNICA (não migração) -- reverte a normalização de método de S/B/MN nos `lab_results`
 * já importados do Cabeda de volta ao texto BRUTO exatamente como o laboratório Mondial escreveu.
 * Fechamento técnico (auditoria RAIZ_2.0/Cabeda, 2026-09-11, item 5): a normalização anterior presumia a
 * técnica mais específica do que o laboratório escreveu de forma abreviada -- nunca confirmado contra o
 * PDF original (fora deste repositório). "Não inventar detalhe de método pra fazer cadastro bater".
 *
 * CTC NÃO é revertido -- essa normalização continua aplicada (defensável sem o PDF: mesma fórmula, só
 * notação abreviada, nenhum termo muda).
 *
 * Não muda `numeric_value`. Preserva `original_payload.rawMethod` (não remove -- continua documentando a
 * tentativa de normalização, sem prejuízo). Idempotente.
 */

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined });
await client.connect();

const REVERTS = [
  { parameterCode: "S", currentMethod: "Ca(H2PO4)2 500mg P/L, turbidimetria", rawMethod: "Turbidimetria" },
  { parameterCode: "B", currentMethod: "Água quente, colorimetria com curcumina", rawMethod: "Água quente" },
  { parameterCode: "MN", currentMethod: "KCl 1 mol/L (acidificado com HCl 2%)", rawMethod: "KCl 1 mol/L" },
];

async function main() {
  await client.query("BEGIN");
  let total = 0;
  for (const r of REVERTS) {
    const result = await client.query(
      `UPDATE lab_results lr
       SET analytical_method = $3
       FROM lab_samples ls, analyses a
       WHERE lr.lab_sample_id = ls.id AND ls.analysis_id = a.id
         AND a.code LIKE 'AN-CABEDA-%'
         AND lr.parameter_code = $1 AND lr.analytical_method = $2
       RETURNING lr.id`,
      [r.parameterCode, r.currentMethod, r.rawMethod],
    );
    console.log(`${r.parameterCode}: "${r.currentMethod}" -> "${r.rawMethod}" (revertido): ${result.rowCount} linhas`);
    total += result.rowCount;
  }
  await client.query("COMMIT");
  console.log(`\nOK -- ${total} linhas revertidas pro texto bruto do laboratório.`);
}

main()
  .catch(async (e) => { await client.query("ROLLBACK"); console.error(e); process.exitCode = 1; })
  .finally(() => client.end());
