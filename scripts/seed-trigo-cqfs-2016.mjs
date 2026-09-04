import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * Carrega, como RASCUNHO (status DRAFT), as faixas de suficiência de solo
 * para TRIGO. Trigo é "cultura de grãos" no mesmo Grupo 2 da CQFS-RS/SC que
 * soja e milho para P e K (mesma tabela, mesma fonte -- ver
 * `lib/cqfs-2016-grupo2-graos.mjs`), no mesmo grupo de pH de referência 6,0
 * (Tabela 5.1) e no grupo geral de enxofre (crítico >5 mg/dm³ -- trigo é
 * poácea, não está entre leguminosas/liliáceas/brássicas/arroz irrigado).
 * Nenhum dado novo "pesquisado" aqui -- reaplicação do já verificado.
 */

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

const PARAMETERS = [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL];

const SOURCE_CONTENT = `O Manual de Calagem e Adubação para os Estados do Rio Grande do Sul e de Santa Catarina (11ª ed., 2016) classifica o trigo como cultura de grãos (Grupo 2 de exigência em P e K, mesmas tabelas usadas para soja e milho) e no grupo geral de exigência em enxofre (teor crítico >5 mg/dm³). pH de referência 6,0 (Tabela 5.1, mesmo grupo de soja e milho).`;

async function main() {
  const cropResult = await pool.query("SELECT id::text FROM crop_profiles WHERE code = 'TRIGO'");
  const cropProfileId = cropResult.rows[0]?.id;
  if (!cropProfileId) throw new Error("crop_profile TRIGO não encontrado -- rode as migrations/seed antes.");

  console.log(`crop_profile TRIGO: ${cropProfileId}`);

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
  console.log(`technical_source (geral) -> ${sourceResult.rows[0].status} (${sourceResult.rows[0].id})`);

  const NPK_SOURCE_TITLE = "Manual de Calagem e Adubação para os Estados do Rio Grande do Sul e de Santa Catarina, 11ª ed. (2016) — capítulo Trigo";
  const NPK_CONTENT = `Adubação nitrogenada do trigo (semeadura + cobertura, kg de N/ha), em função da matéria orgânica do solo e da cultura antecedente (pressupõe rendimento de aproximadamente 3 t/ha de grãos): MO ≤2,5% -> 60 (antecessora leguminosa) / 80 (antecessora gramínea); MO 2,6-5,0% -> 40/60; MO >5,0% -> ≤20/≤20. Para rendimento acima de 3 t/ha, acrescentar 20 kg/ha de N (após leguminosa) ou 30 kg/ha de N (após gramínea) por tonelada adicional de grãos. Aplicar 15 a 20 kg/ha de N na semeadura e o restante em cobertura, entre o afilhamento e o alongamento do colmo (aproximadamente 30 a 45 dias após a emergência); doses elevadas podem ser parceladas em duas coberturas (início do afilhamento e início do alongamento). N aplicado após o espigamento/emborrachamento geralmente não afeta produtividade, mas pode aumentar o teor de proteína do grão. Quando a resteva de milho antecedente for alta (massa seca >4 t/ha), antecipar a cobertura, especialmente em solo arenoso ou com MO baixa. RESTRIÇÃO REGIONAL IMPORTANTE: em regiões mais quentes e de menor altitude (ex.: Região das Missões, RS), quando o trigo é semeado após soja, restringir o N total (semeadura+cobertura) a 40 kg/ha, independentemente da MO do solo, para evitar acamamento; em regiões mais frias com solo de MO alta (ex.: Campos de Cima da Serra, RS), as doses podem ser aumentadas visando o potencial de rendimento. Nabo forrageiro intercalar entre milho e trigo, com massa seca >3 t/ha, é tratado como antecessora leguminosa. Trigo de duplo-propósito (pastejo + grãos): 25 a 30 kg N/ha por tonelada de matéria seca produzida (exceto solo com MO >5%), aplicado em cobertura logo após corte/pastejo.

Adubação de fósforo e potássio do trigo (kg de P2O5/ha e kg de K2O/ha, por classe de interpretação do solo e número do cultivo, pressupõe rendimento ≤3 t/ha): Muito baixo -> P2O5 155 (1º cultivo)/95 (2º); K2O 110/70. Baixo -> 95/75; 70/50. Médio -> 85/45; 60/30. Alto -> 45/45; 30/30. Muito alto -> 0/≤45; 0/≤30. Para rendimento acima de 3 t/ha, somar 15 kg/ha de P2O5 e 10 kg/ha de K2O por tonelada adicional de grãos.`;
  await pool.query(`DELETE FROM technical_sources WHERE crop_profile_id = $1::uuid AND title = $2`, [cropProfileId, NPK_SOURCE_TITLE]);
  const r2 = await pool.query(
    `INSERT INTO technical_sources (title, institution, edition_year, crop_profile_id, content)
     VALUES ($1, $2, $3, $4::uuid, $5) RETURNING id::text, status`,
    [NPK_SOURCE_TITLE, INSTITUTION_2016, 2016, cropProfileId, NPK_CONTENT],
  );
  console.log(`technical_source (N/P2O5/K2O trigo) -> ${r2.rows[0].status} (${r2.rows[0].id})`);
}

main().finally(() => pool.end());
