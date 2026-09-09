import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO1, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * MANDIOQUINHA-SALSA (Arracacia xanthorrhiza, batata-baroa) -- capítulo
 * 6.3.12 do Manual CQFS-RS/SC 2016. Mesma assimetria de tomateiro/batata-
 * doce: Grupo 2 de P, mas Grupo 1 de K (está na lista oficial: alho/
 * beterraba/cenoura/MANDIOQUINHA-SALSA/tomateiro/batata/batata-doce/
 * roseira de corte). Sem diagnose foliar.
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

const NPK_CONTENT = `NITROGÊNIO -- por teor de matéria orgânica do solo: MO≤2,5%=180 kg N/ha. MO 2,6-5,0%=160. MO>5,0%=≤140. Aplicar 20kg N/ha no plantio (fonte orgânica preferencial). Restante: 20/20/30/15/15% aos 90/135/190/235/290 dias após o plantio.

FÓSFORO E POTÁSSIO -- dose por classe de disponibilidade no solo (P via Grupo 2, K via Grupo 1 -- ver nota no script de seed): Muito Baixo: P2O5=220, K2O=340 kg/ha. Baixo: 140/250. Médio: 100/205. Alto: 60/160. Muito Alto: ≤40/≤60. P2O5 todo no plantio. K2O: mesmo cronograma do N (20/20/30/15/15% aos 90-290 dias).
REGRA DE DISPENSA: se P e/ou K estiver 3x acima do teor crítico, não aplicar.`;

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Hortaliças, MANDIOQUINHA-SALSA (6.3.12)`;

async function main() {
  const cropProfileId = await ensureCropProfile("MANDIOQUINHA_SALSA", "Mandioquinha-salsa", "HORTALICA");
  console.log(`MANDIOQUINHA_SALSA: ${cropProfileId}`);
  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO1, ...SOLO_GERAL, S_GERAL]);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K`, NPK_CONTENT);
  console.log("NOTA: classificação de SOLO automatizada no motor (P via Grupo 2, K via Grupo 1) -- sem diagnose foliar. Dose continua só como texto.");
}

main().finally(() => pool.end());
