import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GRUPO_EXIGENTE } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * ERVILHA (Pisum sativum) -- capítulo 6.3.11 do Manual CQFS-RS/SC 2016.
 * Grupo 2 de P/K (não está nas listas de Grupo 1). MAS é leguminosa --
 * usa S_GRUPO_EXIGENTE (>10mg/dm³), não S_GERAL, mesma lógica já aplicada
 * pra soja/canola nesta base (a lista oficial do grupo mais exigente de S
 * inclui leguminosas explicitamente).
 *
 * SEM ADUBAÇÃO NITROGENADA -- igual soja, o manual explicitamente NÃO
 * recomenda N mineral pra ervilha, pela eficiência das estirpes de rizóbio
 * disponíveis -- só exige inoculação adequada.
 */

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

const NPK_CONTENT = `NITROGÊNIO -- NÃO RECOMENDADO: o manual afirma explicitamente que a adubação nitrogenada não é recomendada pra ervilha, dada a eficiência das estirpes de rizóbio disponíveis -- é necessária, no entanto, inoculação adequada (mesma lógica já usada pra soja nesta base).

FÓSFORO E POTÁSSIO -- dose por classe de disponibilidade no solo (Grupo 2 pros dois): Muito Baixo: P2O5=240, K2O=210 kg/ha. Baixo: 160/150. Médio: 120/120. Alto: 80/90. Muito Alto: ≤40/≤60. Ambos aplicados no plantio.
LIMITE: nunca mais que 60kg/ha de K2O na linha de semeadura -- doses maiores, aplicar 50% do K a lanço na semeadura + restante em cobertura antes do florescimento.
REGRA DE DISPENSA: se P e/ou K estiver 3x acima do teor crítico, não aplicar.`;

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Hortaliças, ERVILHA (6.3.11)`;

async function main() {
  const cropProfileId = await ensureCropProfile("ERVILHA", "Ervilha", "HORTALICA");
  console.log(`ERVILHA: ${cropProfileId}`);
  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GRUPO_EXIGENTE]);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K`, NPK_CONTENT);
  console.log("NOTA: classificação de SOLO automatizada no motor (Grupo 2 de P/K, S_GRUPO_EXIGENTE por ser leguminosa) -- sem diagnose foliar. Dose continua só como texto.");
}

main().finally(() => pool.end());
