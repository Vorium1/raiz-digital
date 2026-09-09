import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * Carrega, como RASCUNHO (status DRAFT), as faixas de suficiência de solo
 * para MILHO. Milho é "cultura de grãos" no mesmo Grupo 2 da CQFS-RS/SC que
 * a soja para P e K (mesma tabela, mesmo texto de definição de grupo -- ver
 * `lib/cqfs-2016-grupo2-graos.mjs`), e usa o grupo geral de enxofre (crítico
 * >5 mg/dm³, não >10 como a soja, que é leguminosa). Nenhum dado novo
 * "pesquisado" aqui -- é o mesmo dado já verificado contra o PDF oficial
 * pra soja, reaplicado onde a própria fonte diz que se aplica.
 */

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

const PARAMETERS = [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL];

const SOURCE_CONTENT = `O Manual de Calagem e Adubação para os Estados do Rio Grande do Sul e de Santa Catarina (11ª ed., 2016) classifica o milho como cultura de grãos (Grupo 2 de exigência em P e K, mesmas tabelas usadas para soja) e no grupo geral de exigência em enxofre (teor crítico >5 mg/dm³ -- diferente da soja, que por ser leguminosa exige >10 mg/dm³). As faixas de fósforo (por classe de argila) e potássio (por CTC) são as mesmas usadas para qualquer cultura de grãos da região. Cálcio, magnésio, matéria orgânica, CTC e micronutrientes (B, Cu, Zn, Mn) seguem as tabelas gerais do manual, sem distinção por cultura.`;

async function main() {
  const cropResult = await pool.query("SELECT id::text FROM crop_profiles WHERE code = 'MILHO'");
  const cropProfileId = cropResult.rows[0]?.id;
  if (!cropProfileId) throw new Error("crop_profile MILHO não encontrado -- rode as migrations/seed antes.");

  console.log(`crop_profile MILHO: ${cropProfileId}`);

  const codes = [...new Set(PARAMETERS.map((p) => p.parameterCode))];
  await pool.query(
    `DELETE FROM crop_profile_parameters WHERE crop_profile_id = $1::uuid AND parameter_code = ANY($2::text[])`,
    [cropProfileId, codes],
  );

  for (const p of PARAMETERS) {
    const result = await pool.query(
      `INSERT INTO crop_profile_parameters
       (crop_profile_id, parameter_code, parameter_category, depth_from_cm, depth_to_cm, analytical_method_allowed, unit_expected, sufficiency_ranges, criticality, technical_notes, condition_parameter_code, condition_min, condition_max)
       VALUES ($1::uuid, $2, $3::lab_parameter_category, $4, $5, $6::text[], $7, $8::jsonb, $9::parameter_criticality, $10, $11, $12, $13)
       RETURNING id::text, parameter_code, status`,
      [
        cropProfileId, p.parameterCode, p.parameterCategory, p.depthFromCm, p.depthToCm, p.analyticalMethodAllowed,
        p.unitExpected, JSON.stringify(p.sufficiencyRanges), p.criticality, p.technicalNotes,
        p.conditionParameterCode ?? null, p.conditionMin ?? null, p.conditionMax ?? null,
      ],
    );
    console.log(`  ${result.rows[0].parameter_code} -> ${result.rows[0].status} (${result.rows[0].id})`);
  }

  await pool.query(`DELETE FROM technical_sources WHERE crop_profile_id = $1::uuid AND title = $2`, [cropProfileId, SOURCE_2016]);
  const sourceResult = await pool.query(
    `INSERT INTO technical_sources (title, institution, edition_year, crop_profile_id, region_code, content)
     VALUES ($1, $2, $3, $4::uuid, $5, $6)
     RETURNING id::text, title, status`,
    [SOURCE_2016, INSTITUTION_2016, 2016, cropProfileId, null, SOURCE_CONTENT],
  );
  console.log(`technical_source -> ${sourceResult.rows[0].status} (${sourceResult.rows[0].id})`);
}

main().finally(() => pool.end());
