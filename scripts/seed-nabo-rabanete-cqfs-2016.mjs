import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/** NABO e RABANETE -- capítulo 6.3.14 do Manual CQFS-RS/SC 2016. Bundle intencional, Grupo 2 pros dois nutrientes. Sem diagnose foliar. */

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined });

async function ensureCropProfile(code, name, cropGroup) {
  const existing = await pool.query("SELECT id::text FROM crop_profiles WHERE code = $1", [code]);
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await pool.query(
    `INSERT INTO crop_profiles (code, name, status, crop_group, technical_notes) VALUES ($1, $2, 'DRAFT', $3, 'Catálogo de cultura criado automaticamente. Faixas de suficiência aguardando homologação técnica.') RETURNING id::text`,
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
      `INSERT INTO crop_profile_parameters (crop_profile_id, parameter_code, parameter_category, sample_type, depth_from_cm, depth_to_cm, analytical_method_allowed, unit_expected, sufficiency_ranges, criticality, technical_notes, condition_parameter_code, condition_min, condition_max)
       VALUES ($1::uuid, $2, $3::lab_parameter_category, $4, $5, $6, $7::text[], $8, $9::jsonb, $10::parameter_criticality, $11, $12, $13, $14) RETURNING id::text, parameter_code, sample_type, status`,
      [cropProfileId, p.parameterCode, p.parameterCategory, p.sampleType ?? "SOLO", p.depthFromCm, p.depthToCm, p.analyticalMethodAllowed, p.unitExpected, JSON.stringify(p.sufficiencyRanges), p.criticality, p.technicalNotes, p.conditionParameterCode ?? null, p.conditionMin ?? null, p.conditionMax ?? null],
    );
    console.log(`  ${result.rows[0].parameter_code} (${result.rows[0].sample_type}) -> ${result.rows[0].status} (${result.rows[0].id})`);
  }
}

async function seedSource(cropProfileId, title, content, editionYear = 2016) {
  await pool.query(`DELETE FROM technical_sources WHERE crop_profile_id = $1::uuid AND title = $2`, [cropProfileId, title]);
  const r = await pool.query(`INSERT INTO technical_sources (title, institution, edition_year, crop_profile_id, content) VALUES ($1, $2, $3, $4::uuid, $5) RETURNING id::text, status`, [title, INSTITUTION_2016, editionYear, cropProfileId, content]);
  console.log(`  technical_source "${title}" -> ${r.rows[0].status} (${r.rows[0].id})`);
}

const NPK_CONTENT = `NITROGÊNIO -- por teor de matéria orgânica do solo: MO≤2,5%=40 kg N/ha. MO 2,6-5,0%=30. MO>5,0%=≤20. Aplicar TODO o N no plantio (única cultura desta base sem parcelamento algum de N -- ciclo curto). Em MO>5,0%, pode reduzir em até 50% a dose.

FÓSFORO E POTÁSSIO -- dose por classe de disponibilidade no solo (Grupo 2 pros dois): Muito Baixo: P2O5=260, K2O=210 kg/ha. Baixo: 180/150. Médio: 140/120. Alto: 100/90. Muito Alto: ≤60/≤60. Ambos aplicados no plantio.
LIMITE: nunca mais que 60kg/ha de K2O na linha de semeadura -- doses maiores, 50% do K a lanço na semeadura + restante em cobertura (15 dias após o plantio pro rabanete, antes do florescimento pro nabo).
REGRA DE DISPENSA: se P e/ou K estiver 3x acima do teor crítico, não aplicar.`;

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Hortaliças, NABO e RABANETE (6.3.14)`;

async function main() {
  const cropProfileId = await ensureCropProfile("NABO_RABANETE", "Nabo e rabanete", "HORTALICA");
  console.log(`NABO_RABANETE: ${cropProfileId}`);
  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL]);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K`, NPK_CONTENT);
  console.log("NOTA: classificação de SOLO automatizada no motor (Grupo 2) -- sem diagnose foliar. Dose continua só como texto.");
}

main().finally(() => pool.end());
