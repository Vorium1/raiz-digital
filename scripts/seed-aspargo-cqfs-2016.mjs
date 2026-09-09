import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * ASPARGO (Asparagus officinalis) -- capítulo 6.3.5 do Manual CQFS-RS/SC
 * 2016. Não está em lista de Grupo 1 -- Grupo 2 pros dois nutrientes. Sem
 * diagnose foliar. Cultura PERENE (única hortaliça perene carregada até
 * agora) -- dose estruturada em 3 fases (instalação/formação/manutenção)
 * ao longo de vários anos, mais parecida com o padrão de frutífera do que
 * com o resto do capítulo de hortaliças (que é majoritariamente anual).
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

const NPK_CONTENT = `NITROGÊNIO -- 3 fases, por teor de matéria orgânica do solo: Instalação: MO≤2,5%=120, 2,6-5,0%=100, >5,0%=≤80 kg N/ha. Formação: mesmos valores da instalação (120/100/≤80). Manutenção: MO≤2,5%=60, 2,6-5,0%=60, >5,0%=≤60. Em MO>5,0%, reduzir 10kg N/ha pra cada 1% adicional de MO acima de 5%.

FÓSFORO E POTÁSSIO -- 3 fases, por classe de disponibilidade no solo (Grupo 2 pros dois):
Pré-plantio -- P2O5: Muito Baixo=300, Baixo=220, Médio=180, Alto=140, Muito Alto≤100. K2O: Muito Baixo=220, Baixo=160, Médio=130, Alto=100, Muito Alto≤70.
Formação -- P2O5: 0 (não aplicar) em todas as classes. K2O: 150 em todas as classes (≤150 se Muito Alto).
Manutenção -- P2O5: 120 em todas as classes. K2O: 180 em todas as classes (≤180 se Muito Alto).
REGRA DE DISPENSA: se P e/ou K estiver 3x acima do teor crítico, não aplicar.

MANEJO POR FASE (cultura perene, ciclo de anos):
Pré-plantio: metade do P/K a lanço + incorporado por aração, restante no fundo das valetas no plantio.
Instalação (plantio): metade do N no fundo das valetas no plantio; restante em cobertura nov-dez. Se usar adubo orgânico, NÃO adicionar N mineral no plantio -- só metade da dose em cobertura.
Formação (1º e 2º anos, antes da fase produtiva): metade de N e K em ago-set, restante em nov-dez, em faixas nos dois lados da linha.
Manutenção (3º e 4º anos): dose dividida em 2 parcelas -- antes da confecção dos camalhões + no término da colheita.
No 5º ano: nova amostragem de solo, reavaliar necessidade de correção, usar doses de "pré-plantio" se necessário. Do 6º ano em diante, usar doses de manutenção.
Incorporação a pelo menos 10cm de profundidade, no período de dormência -- evitar aração profunda (prejudica raiz). Adubo orgânico recomendado a cada 2 anos no mínimo.`;

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Hortaliças, ASPARGO (6.3.5)`;

async function main() {
  const cropProfileId = await ensureCropProfile("ASPARGO", "Aspargo", "HORTALICA");
  console.log(`ASPARGO: ${cropProfileId}`);
  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL]);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K por fase (instalação, formação, manutenção)`, NPK_CONTENT);
  console.log("NOTA: classificação de SOLO automatizada no motor (Grupo 2) -- sem diagnose foliar. Dose por fase continua só como texto.");
}

main().finally(() => pool.end());
