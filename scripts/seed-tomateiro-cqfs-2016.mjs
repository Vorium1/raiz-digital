import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO1, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * TOMATEIRO (Solanum lycopersicum) -- capítulo 6.3.20 do Manual CQFS-RS/SC
 * 2016. Primeira cultura desta base do capítulo HORTALIÇAS (6.3), abrindo
 * essa frente depois de fechar Frutíferas.
 *
 * CLASSIFICAÇÃO DE SOLO -- combinação real, não uniforme: tomateiro está no
 * Grupo 2 de P (não está na lista oficial do Grupo 1: alho/beterraba/
 * cenoura/batata/roseira de corte) MAS no Grupo 1 de K (está na lista
 * oficial do Grupo 1 de K: alho/beterraba/cenoura/mandioquinha-salsa/
 * TOMATEIRO/batata/batata-doce/roseira de corte) -- conferido nas duas
 * listas oficiais (Tabelas 6.2 e 6.7) antes de decidir, não assumido.
 *
 * SEM DIAGNOSE FOLIAR: diferente de toda frutífera já carregada, o
 * capítulo de hortaliças/tubérculos não traz tabela de classificação
 * foliar pra tomateiro -- a recomendação é só por análise de solo. Não é
 * omissão nossa.
 *
 * ESTRUTURA DE DOSE NOVA: cronograma semanal de parcelamento (%  do N e do
 * K2O recomendado aplicado em cada uma das 17 semanas após o plantio) --
 * mais granular que qualquer "parcelar em X vezes" já visto até agora.
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

const NPK_CONTENT = `NITROGÊNIO -- por teor de matéria orgânica do solo (direto, sem estratificar por ano/idade -- cultura anual): MO≤2,5%=190 kg N/ha. MO 2,6-5,0%=140. MO>5,0%=90. Ajuste: +3kg N/ha por tonelada de rendimento esperado acima de 80t/ha.
Aplicar 20kg N/ha no plantio (preferencialmente fonte orgânica). O RESTANTE segue cronograma semanal detalhado -- 4, 2, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 8, 7, 6, 5 e 4% do N restante recomendado, aplicados respectivamente na 1ª a 17ª semana após o plantio.

FÓSFORO E POTÁSSIO -- dose por classe de disponibilidade no solo (P classificado pelo Grupo 2, K pelo Grupo 1 -- ver nota no script de seed):
Muito Baixo: P2O5=230, K2O=270 kg/ha. Baixo: 150/180. Médio: 110/135. Alto: 70/90. Muito Alto: ≤40/≤60.
Ajuste: +3kg P2O5/ha e +3kg K2O/ha por tonelada de rendimento esperado acima de 80t/ha.
P2O5 todo no plantio. K2O segue o MESMO cronograma semanal do N (4,2,2,3,4,5,6,7,8,9,9,9,8,7,6,5,4% nas 17 semanas).
REGRA DE DISPENSA: se o teor de P e/ou K no solo for 3x maior que o teor crítico, NÃO aplicar P2O5 e/ou K2O -- regra condicional numérica, ainda não automatizada no motor.`;

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Hortaliças, TOMATEIRO (6.3.20)`;

async function main() {
  const cropProfileId = await ensureCropProfile("TOMATEIRO", "Tomateiro", "HORTALICA");
  console.log(`TOMATEIRO: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO1, ...SOLO_GERAL, S_GERAL]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K e cronograma semanal de parcelamento`, NPK_CONTENT);

  console.log("NOTA: classificação de SOLO automatizada no motor (P via Grupo 2, K via Grupo 1) -- sem diagnose foliar (manual não traz tabela pra esta cultura). Dose e cronograma semanal continuam só como texto.");
}

main().finally(() => pool.end());
