import pg from "pg";

/**
 * Backfill idempotente de PROVENIÊNCIA, sem alterar nenhum `numeric_value`.
 *
 * Fonte primária reencontrada e conferida em 2026-09-12:
 * - Mondial Laboratório de Produtos Químicos Ltda;
 * - Relatórios de Ensaio 1414-1429/2026, Rafael Cabeda, Água Santa/RS;
 * - os laudos imprimem P e K em `mg/L` e citam Tedesco, M. J. et al., Boletim técnico n° 5,
 *   "Análises de Solo, Plantas e Outros Materiais", 2ª ed., Porto Alegre, 1995.
 *
 * A RAIZ usa `mg/dm³` como notação canônica de P/K no perfil CQFS. Como 1 L = 1 dm³, essa
 * canonização tem fator 1 e NUNCA muda o valor numérico. O texto original continua preservado aqui.
 *
 * Não promove parâmetros, não reinterpreta análise, não aprova nada e não toca geometria.
 */

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

const SOURCE_METHOD_REFERENCE = "Tedesco, M. J. et al. Boletim técnico n° 5 - Análises de Solo, Plantas e Outros Materiais. 2 ed. Porto Alegre, 1995.";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  await client.connect();
  await client.query("BEGIN");

  try {
    const before = await client.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE lr.numeric_value IS NOT NULL)::int AS numeric_count
       FROM lab_results lr
       JOIN lab_samples ls ON ls.id = lr.lab_sample_id
       JOIN analyses a ON a.id = ls.analysis_id AND a.tenant_id = lr.tenant_id
       WHERE a.code IN ('AN-CABEDA-01','AN-CABEDA-02','AN-CABEDA-03')`,
    );

    const updated = await client.query(
      `UPDATE lab_results lr
       SET original_payload = coalesce(lr.original_payload, '{}'::jsonb)
         || jsonb_build_object(
              'sourceDocument', 'Mondial Relatório de Ensaio ' || coalesce(lr.original_payload->>'relatorioEnsaio', 'não identificado') || '/2026',
              'sourceLaboratory', 'Mondial Laboratório de Produtos Químicos Ltda',
              'sourceMethodReference', $1::text,
              'provenanceReviewedAt', '2026-09-12'
            )
         || CASE
              WHEN lr.parameter_code IN ('P','K') THEN jsonb_build_object(
                'rawUnit', coalesce(lr.original_payload->>'rawUnit', 'mg/L'),
                'canonicalUnit', lr.unit,
                'unitNormalizationFactor', 1,
                'unitNormalizationReason', '1 L = 1 dm³; canonização de notação sem alteração do valor numérico'
              )
              WHEN lr.parameter_code = 'CTC' THEN jsonb_build_object(
                'rawMethod', coalesce(lr.original_payload->>'rawMethod', 'Calculado: Ca+Mg+K+(H+Al)'),
                'canonicalMethod', lr.analytical_method,
                'methodNormalizationReason', 'Mesma fórmula; notação canônica explicita CTCpH7,0 sem mudar os termos do cálculo'
              )
              ELSE '{}'::jsonb
            END
       FROM lab_samples ls, analyses a
       WHERE lr.lab_sample_id = ls.id
         AND ls.analysis_id = a.id
         AND a.tenant_id = lr.tenant_id
         AND a.code IN ('AN-CABEDA-01','AN-CABEDA-02','AN-CABEDA-03')
       RETURNING lr.id, lr.parameter_code, lr.numeric_value`,
      [SOURCE_METHOD_REFERENCE],
    );

    const after = await client.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE lr.numeric_value IS NOT NULL)::int AS numeric_count,
              count(*) FILTER (WHERE lr.parameter_code IN ('P','K') AND lr.original_payload ? 'rawUnit')::int AS pk_with_raw_unit,
              count(*) FILTER (WHERE lr.parameter_code = 'CTC' AND lr.original_payload ? 'rawMethod')::int AS ctc_with_raw_method
       FROM lab_results lr
       JOIN lab_samples ls ON ls.id = lr.lab_sample_id
       JOIN analyses a ON a.id = ls.analysis_id AND a.tenant_id = lr.tenant_id
       WHERE a.code IN ('AN-CABEDA-01','AN-CABEDA-02','AN-CABEDA-03')`,
    );

    if (before.rows[0].total !== after.rows[0].total || before.rows[0].numeric_count !== after.rows[0].numeric_count) {
      throw new Error("Falha de integridade: contagem de resultados/valores mudou durante backfill de proveniência.");
    }

    await client.query("COMMIT");
    console.log(`OK — ${updated.rowCount} resultados receberam/confirmaram proveniência documental.`);
    console.log(`P/K com rawUnit preservada: ${after.rows[0].pk_with_raw_unit}`);
    console.log(`CTC com rawMethod preservado: ${after.rows[0].ctc_with_raw_method}`);
    console.log("numeric_value: nenhuma alteração realizada por este script.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
