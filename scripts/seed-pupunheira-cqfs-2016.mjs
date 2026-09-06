import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * PUPUNHEIRA (Bactris gasipaes, palmito pupunha) -- capítulo 6.3.18 do
 * Manual CQFS-RS/SC 2016. Grupo 2 pros dois nutrientes. Sem diagnose
 * foliar. Cultura perene, densidade de referência 5.000 plantas/ha,
 * estrutura de fases (formação/produção) igual aspargo/palmeira real.
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

const NPK_CONTENT = `Recomendações consideram densidade de 5.000 plantas/ha.

NITROGÊNIO -- por teor de matéria orgânica do solo, 2 fases: Formação -- MO≤2,5%=200, 2,6-5,0%=175, >5,0%=75 kg N/ha (dose dos primeiros 12 meses, 1ª aplicação 30 dias após o plantio, parcelar em pelo menos 2 vezes). Produção -- MO≤2,5%=300, 2,6-5,0%=225, >5,0%=150 kg N/ha/ano (dose anual a partir dos 12 meses, parcelar em 3 aplicações/ano).

FÓSFORO -- por classe de disponibilidade no solo, 2 fases: Pré-plantio (kg P2O5/ha) -- Muito Baixo=185, Baixo=105, Médio=65, Alto=25, Muito Alto=0. Incorporar ao solo; preferir fonte orgânica (solubilização lenta + micronutrientes) ou, se mineral, adubo simples com outros nutrientes (ex.: superfosfato simples em vez de triplo, porque o simples tem enxofre). Produção (kg P2O5/ha/ano) -- Muito Baixo=125, Baixo=100, Médio=75, Alto=50, Muito Alto=25. Anual a partir de 12 meses, parcelar em 3 aplicações/ano.

POTÁSSIO -- por classe de disponibilidade no solo, 2 fases: NÃO aplicar K em pré-plantio. Formação (kg K2O/ha, primeiros 12 meses) -- Muito Baixo=160, Baixo=100, Médio=70, Alto=40, Muito Alto=0. Parcelar em pelo menos 2 vezes, 1ª aplicação 30 dias após o plantio. Produção (kg K2O/ha/ano) -- Muito Baixo=175, Baixo=150, Médio=100, Alto=75, Muito Alto=50. Anual a partir de 12 meses, parcelar em 3 aplicações/ano.

OBSERVAÇÕES: se MO do solo for baixa, aplicar 1-2 kg B/ha/ano. Recomenda-se que alguma aplicação anual de N use fonte com enxofre (ex.: sulfato de amônio, adubo orgânico), visando 20-50 kg S/ha/ano.`;

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Hortaliças, PUPUNHEIRA (6.3.18)`;

async function main() {
  const cropProfileId = await ensureCropProfile("PUPUNHEIRA", "Pupunheira", "HORTALICA");
  console.log(`PUPUNHEIRA: ${cropProfileId}`);
  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL]);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K por fase (formação, produção)`, NPK_CONTENT);
  console.log("NOTA: classificação de SOLO automatizada no motor (Grupo 2) -- sem diagnose foliar. Dose por fase continua só como texto.");
}

main().finally(() => pool.end());
