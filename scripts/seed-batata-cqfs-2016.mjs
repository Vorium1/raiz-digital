import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO1, K_GRUPO1, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * BATATA (Solanum tuberosum) -- capítulo 6.4.1 do Manual CQFS-RS/SC 2016,
 * capítulo Tubérculos e Raízes. Está na lista oficial do Grupo 1 tanto pra
 * P (Tabela 6.2: alho/beterraba/cenoura/batata/roseira de corte) quanto
 * pra K (Tabela 6.7: alho/beterraba/cenoura/mandioquinha-salsa/tomateiro/
 * BATATA/batata-doce/roseira de corte) -- confirmado nas duas listas.
 *
 * SEM DIAGNOSE FOLIAR: o próprio capítulo (intro de Tubérculos e Raízes)
 * afirma que raramente se observa resposta à aplicação de micronutrientes
 * nessas culturas no Sul do Brasil -- recomendação é preventiva via
 * adubo orgânico, não diagnose foliar.
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

const NPK_CONTENT = `NITROGÊNIO -- por teor de matéria orgânica do solo: MO≤2,5%=120 kg N/ha. MO 2,6-5,0%=100. MO>5,0%=80. Ajuste: +5kg N/ha por tonelada de rendimento esperado acima de 30t/ha. Metade no plantio, restante ~30 dias após a emergência.
CASOS ESPECIAIS: produção de batata-semente -- reduzir a dose de N em 20%. Safrinha (fevereiro-março), variedades precoces ou antecipação de colheita -- reduzir N em 10-20% e aplicar em cobertura após início da tuberização (3-4 semanas pós-emergência).

FÓSFORO E POTÁSSIO -- dose por classe de disponibilidade no solo (P e K classificados pelo Grupo 1 -- ver nota no script de seed): Muito Baixo: P2O5=395, K2O=280 kg/ha. Baixo: 260/190. Médio: 195/145. Alto: 125/100. Muito Alto: ≤75/≤50. Ajuste: +15kg P2O5/ha e +10kg K2O/ha por tonelada de rendimento esperado acima de 30t/ha. Ambos aplicados no plantio.
REGRA DE DISPENSA: se P e/ou K estiver classificado "Muito alto" E 3x acima do teor crítico, não aplicar. Recomenda-se nova amostragem de solo a cada novo cultivo (não reaproveitar análise antiga).

MICRONUTRIENTES: resposta rara no Sul do Brasil pra tubérculos/raízes -- recomendação é preventiva, suprir parte do N ou P (o que atingir 20kg/ha primeiro) com adubo orgânico, não diagnose foliar dedicada.`;

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Tubérculos e Raízes, BATATA (6.4.1)`;

async function main() {
  const cropProfileId = await ensureCropProfile("BATATA", "Batata", "TUBERCULO");
  console.log(`BATATA: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO1, ...K_GRUPO1, ...SOLO_GERAL, S_GERAL]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K`, NPK_CONTENT);

  console.log("NOTA: classificação de SOLO automatizada no motor (P e K via Grupo 1) -- sem diagnose foliar (manual não recomenda, resposta rara a micronutriente nesta cultura no Sul do Brasil). Dose continua só como texto.");
}

main().finally(() => pool.end());
