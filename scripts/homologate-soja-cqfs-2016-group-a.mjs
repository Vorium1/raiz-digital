import pg from "pg";

/**
 * Homologação REAL (DRAFT -> ACTIVE) do subconjunto de parâmetros da SOJA classificado como "Grupo A" na
 * auditoria de 2026-09-11 (docs/CABEDA_PIPELINE_DIAGNOSTICO_E_CORRECAO.md): método E unidade batem
 * EXATAMENTE com o texto homologado em `crop_profile_parameters` (depois da correção de normalização em
 * `fix-cabeda-analytical-methods.mjs`), sem nenhuma tradução/suposição necessária. As faixas em si já
 * foram verificadas contra o PDF oficial do Manual CQFS-RS/SC 2016 na criação do cadastro
 * (`seed-soja-cqfs-2016.mjs`, `technical_notes` de cada linha cita tabela/página exatas).
 *
 * NÃO inclui: AL, PH, SMP, H_AL, CLAY (não têm faixa estática nesta edição do manual -- deliberadamente de
 * fora do cadastro, não é uma correção pendente) nem CTC/S/B/MN (Grupo B -- normalização de método
 * corrigida separadamente, mas a REVISÃO/decisão de homologar essas 4 continua pendente de um agrônomo
 * responsável, não decidida por este script).
 *
 * Mesmo efeito que um curador clicando "homologar" um por um na Biblioteca Técnica
 * (`setCropProfileParameterStatus`, mesma tabela, mesmo texto de auditoria) -- só em lote, pelos mesmos
 * 7 parâmetros já confirmados nesta auditoria. Idempotente (WHERE já exclui o que não é mais DRAFT).
 */

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined });
await client.connect();

const TENANT_ID = "dc3854e1-8721-4041-ba9c-1e8c1657202f"; // Raiz Digital Demo
const CURATOR_ID = "049d3717-84f9-42fc-97d7-aacc22304f5b"; // admin@raiz.local, is_platform_curator=true

const GROUP_A_CODES = ["CA", "MG", "MO", "CU", "ZN", "K", "P"];

async function main() {
  await client.query("BEGIN");

  const profile = await client.query(`SELECT id::text FROM crop_profiles WHERE code = 'SOJA'`);
  const cropProfileId = profile.rows[0]?.id;
  if (!cropProfileId) throw new Error("crop_profile SOJA não encontrado.");

  const updated = await client.query(
    `UPDATE crop_profile_parameters
     SET status = 'ACTIVE', updated_at = now()
     WHERE crop_profile_id = $1::uuid AND parameter_code = ANY($2::text[]) AND status = 'DRAFT'
     RETURNING id::text, parameter_code, condition_min::float8, condition_max::float8`,
    [cropProfileId, GROUP_A_CODES],
  );

  for (const row of updated.rows) {
    await client.query(
      `INSERT INTO audit_events (tenant_id, actor_user_id, actor_type, action, entity_type, entity_id, metadata)
       VALUES ($1::uuid, $2::uuid, 'USER', 'CROP_PROFILE_PARAMETER_STATUS_CHANGED', 'crop_profile_parameter', $3::uuid, $4::jsonb)`,
      [TENANT_ID, CURATOR_ID, row.id, JSON.stringify({
        status: "ACTIVE",
        reason: "Auditoria RAIZ_2.0/Cabeda 2026-09-11 -- Grupo A: método e unidade batem exatamente com o cadastro homologado, faixa já verificada contra o PDF oficial CQFS-RS/SC 2016 na criação do cadastro.",
        parameterCode: row.parameter_code,
        conditionMin: row.condition_min,
        conditionMax: row.condition_max,
      })],
    );
  }

  await client.query("COMMIT");
  console.log(`OK -- ${updated.rowCount} linhas de crop_profile_parameters promovidas a ACTIVE:`);
  for (const row of updated.rows) console.log(`  ${row.parameter_code}${row.condition_min != null || row.condition_max != null ? ` (condição ${row.condition_min ?? "-inf"} a ${row.condition_max ?? "+inf"})` : ""}`);
}

main()
  .catch(async (e) => { await client.query("ROLLBACK"); console.error(e); process.exitCode = 1; })
  .finally(() => client.end());
