import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO1, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * BATATA-DOCE (Ipomoea batatas) -- capítulo 6.4.2 do Manual CQFS-RS/SC
 * 2016, capítulo Tubérculos e Raízes. Mesma combinação assimétrica do
 * tomateiro: Grupo 2 de P (não está na lista oficial do Grupo 1: alho/
 * beterraba/cenoura/batata/roseira de corte), mas Grupo 1 de K (está na
 * lista oficial: alho/beterraba/cenoura/mandioquinha-salsa/tomateiro/
 * batata/BATATA-DOCE/roseira de corte) -- conferido nas duas listas.
 * Sem diagnose foliar, mesmo padrão do capítulo de tubérculos/raízes.
 */

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

async function ensureCropProfile(code, name, cropGroup) {
  const existing = await pool.query("SELECT id::text FROM crop_profiles WHERE code = $1", [code]);
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await pool.query(
    `INSERT INTO crop_profiles (code, name, status, crop_group, technical_notes)
     VALUES ($1, $2, 'DRAFT', $3, 'Catálogo de cultura criado automaticamente. Faixas de suficiência aguardando homologação técnica.')
     RETURNING id::text`,
    [code, name, cropGroup],
  );
  return inserted.rows[0].id;
}

async function seedParameters(cropProfileId, parameters) {
  const codes = [...new Set(parameters.map((p) => p.parameterCode))];
  const sampleTypes = [...new Set(parameters.map((p) => p.sampleType ?? "SOLO"))];
  await pool.query(`DELETE FROM crop_profile_parameters WHERE crop_profile_id = $1::uuid AND parameter_code = ANY($2::text[]) AND sample_type = ANY($3::text[])`, [cropProfileId, codes, sampleTypes]);
  for (const p of parameters) {
    const result = await pool.query(
      `INSERT INTO crop_profile_parameters
       (crop_profile_id, parameter_code, parameter_category, sample_type, depth_from_cm, depth_to_cm, analytical_method_allowed, unit_expected, sufficiency_ranges, criticality, technical_notes, condition_parameter_code, condition_min, condition_max)
       VALUES ($1::uuid, $2, $3::lab_parameter_category, $4, $5, $6, $7::text[], $8, $9::jsonb, $10::parameter_criticality, $11, $12, $13, $14)
       RETURNING id::text, parameter_code, sample_type, status`,
      [cropProfileId, p.parameterCode, p.parameterCategory, p.sampleType ?? "SOLO", p.depthFromCm, p.depthToCm, p.analyticalMethodAllowed, p.unitExpected, JSON.stringify(p.sufficiencyRanges), p.criticality, p.technicalNotes, p.conditionParameterCode ?? null, p.conditionMin ?? null, p.conditionMax ?? null],
    );
    console.log(`  ${result.rows[0].parameter_code} (${result.rows[0].sample_type}) -> ${result.rows[0].status} (${result.rows[0].id})`);
  }
}

async function seedSource(cropProfileId, title, content, editionYear = 2016) {
  await pool.query(`DELETE FROM technical_sources WHERE crop_profile_id = $1::uuid AND title = $2`, [cropProfileId, title]);
  const r = await pool.query(
    `INSERT INTO technical_sources (title, institution, edition_year, crop_profile_id, content)
     VALUES ($1, $2, $3, $4::uuid, $5) RETURNING id::text, status`,
    [title, INSTITUTION_2016, editionYear, cropProfileId, content],
  );
  console.log(`  technical_source "${title}" -> ${r.rows[0].status} (${r.rows[0].id})`);
}

const NPK_CONTENT = `NITROGÊNIO -- por teor de matéria orgânica do solo: MO≤2,5%=70 kg N/ha. MO 2,6-5,0%=40. MO>5,0%=≤30. Aplicar 10 kg/ha no plantio, restante em cobertura ~30 dias após a brotação (batata-semente) ou ~30 dias após o transplante (mudas).

FÓSFORO E POTÁSSIO -- dose por classe de disponibilidade no solo (P via Grupo 2, K via Grupo 1 -- ver nota no script de seed): Muito Baixo: P2O5=140, K2O=260 kg/ha. Baixo: 100/170. Médio: 80/125. Alto: 60/80. Muito Alto: ≤40/≤40. Ambos aplicados no plantio.
REGRA DE DISPENSA: se P e/ou K estiver "Muito alto" E 3x acima do teor crítico, não aplicar. Reamostrar o solo a cada novo cultivo.

MICRONUTRIENTES: mesmo padrão do capítulo de tubérculos/raízes -- resposta rara no Sul do Brasil, recomendação preventiva via adubo orgânico (parte do N ou P, o que atingir 20kg/ha primeiro), não diagnose foliar dedicada.`;

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Tubérculos e Raízes, BATATA-DOCE (6.4.2)`;

async function main() {
  const cropProfileId = await ensureCropProfile("BATATA_DOCE", "Batata-doce", "TUBERCULO");
  console.log(`BATATA_DOCE: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO1, ...SOLO_GERAL, S_GERAL]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K`, NPK_CONTENT);

  console.log("NOTA: classificação de SOLO automatizada no motor (P via Grupo 2, K via Grupo 1) -- sem diagnose foliar. Dose continua só como texto.");
}

main().finally(() => pool.end());
