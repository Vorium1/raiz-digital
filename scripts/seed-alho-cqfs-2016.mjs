import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO1, K_GRUPO1, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * ALHO (Allium sativum) -- capítulo 6.3.4 do Manual CQFS-RS/SC 2016. Está
 * nas duas listas oficiais de Grupo 1 (P e K) -- confirmado. Sem diagnose
 * foliar, mas tem uma tabela real de dose de Zn/B condicionada à classe de
 * B/Zn no solo (que já usa a tabela geral SOLO_GERAL, Tabela 6.12, já
 * carregada nesta base) -- primeira hortaliça com micronutriente
 * explicitamente dosado por classe de solo.
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

const NPK_CONTENT = `NITROGÊNIO -- por teor de matéria orgânica do solo: MO≤2,5%=350 kg N/ha. MO 2,6-5,0%=300. MO>5,0%=≤255. Aplicar 1/3 no plantio (preferencialmente fonte orgânica), 1/3 entre 25-45 dias após o plantio, 1/3 entre 10-15 dias após a diferenciação visual em bulbilhos (última aplicação depende de vigor da planta, doenças e predisposição a superbrotamento). CUIDADO: excesso de N pode causar bacterioses e superbrotamento.

FÓSFORO E POTÁSSIO -- dose por classe de disponibilidade no solo (P e K via Grupo 1 -- ver nota no script de seed): Muito Baixo: P2O5=570, K2O=530 kg/ha. Baixo: 435/440. Médio: 370/395. Alto: 300/350. Muito Alto: ≤200/≤300. Aplicar em área total ou só na superfície dos canteiros antes do plantio; incorporar até 20cm de profundidade após aplicar.
REGRA DE DISPENSA: se P e/ou K estiver 3x acima do teor crítico, não aplicar.

MICRONUTRIENTES (Zn e B) -- dose pra aplicação no plantio, por classe de teor no solo (usa a mesma classificação geral de Zn/B já carregada nesta base, Tabela 6.12): Baixo: Zn=15, B=1,0 kg/ha. Médio: Zn=12, B=0,8. Alto: Zn=9, B=0,6. Quando necessário, também dá pra aplicar sulfato de zinco 0,5% e/ou bórax 0,2% via foliar, 4 a 6 aplicações em intervalos de 1-2 semanas.`;

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Hortaliças, ALHO (6.3.4)`;

async function main() {
  const cropProfileId = await ensureCropProfile("ALHO", "Alho", "HORTALICA");
  console.log(`ALHO: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO1, ...K_GRUPO1, ...SOLO_GERAL, S_GERAL]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K e micronutrientes (Zn, B)`, NPK_CONTENT);

  console.log("NOTA: classificação de SOLO automatizada no motor (P e K via Grupo 1) -- sem diagnose foliar. Dose continua só como texto, inclusive a dose de Zn/B por classe (já usa Tabela 6.12 automatizada).");
}

main().finally(() => pool.end());
