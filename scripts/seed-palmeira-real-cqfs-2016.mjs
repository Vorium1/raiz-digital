import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * PALMEIRA REAL AUSTRALIANA (Archontophoenix alexandrae, palmito) --
 * capítulo 6.3.15 do Manual CQFS-RS/SC 2016. Grupo 2 pros dois nutrientes.
 * Sem diagnose foliar.
 *
 * ESTRUTURA DE DOSE MAIS COMPLEXA desta base até agora: TRÊS densidades de
 * plantio (10.000/15.000/20.000 plantas/ha) × TRÊS fases (cobertura+
 * formação / produção) × classe de solo -- 3 dimensões cruzadas, mais que
 * qualquer outra cultura já carregada. Igual aspargo e pupunheira, é
 * cultura perene com estrutura de fases plurianuais.
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

const NPK_CONTENT = `NITROGÊNIO -- cruza teor de matéria orgânica × densidade de plantio (10.000/15.000/20.000 plantas/ha) × fase (cobertura/formação/produção):
COBERTURA E FORMAÇÃO (kg N/ha) -- MO≤2,5%: cobertura 50/60/70, formação 130/140/150 (pras 3 densidades). MO 2,6-5,0%: cobertura 40/50/60, formação 100/110/120. MO>5,0%: cobertura 30/40/50, formação 80/90/100.
Cobertura aplicada 30-40 dias após o transplante das mudas. Formação parcelada em 2 vezes (5º e 9º mês após o plantio). Recomenda-se que alguma aplicação de N use fonte com enxofre (ex.: sulfato de amônio, adubo orgânico).
PRODUÇÃO (kg N/ha/ano) -- MO≤2,5%: 200/210/230 (pras 3 densidades). MO 2,6-5,0%: 170/190/200. MO>5,0%: 120/140/160. Anual, a partir do 2º ano (13º mês) e 3º ano (25º mês) após o plantio. Parcelar em pelo menos 3 aplicações anuais (a cada 4 meses), primeira no 13º mês.

FÓSFORO -- cruza classe de disponibilidade no solo × densidade × fase:
PRÉ-PLANTIO (kg P2O5/ha) -- Muito Baixo: 200/210/220 (pras 3 densidades). Baixo: 120/130/140. Médio: 80/90/100. Alto: 40/50/60. Muito Alto: 0. Incorporar ao solo.
PRODUÇÃO (kg P2O5/ha/ano) -- Muito Baixo: 70/80/90. Baixo: 60/70/80. Médio: 50/60/70. Alto: 30/30/40. Muito Alto: 20. Sem adubação de formação pra P (dose de pré-plantio já é suficiente). Anual, a partir do 2º/3º ano.

POTÁSSIO -- cruza classe de disponibilidade no solo × densidade × fase:
PRÉ-PLANTIO E FORMAÇÃO (kg K2O/ha) -- Muito Baixo: pré-plantio 120/130/140, formação 80/90/100. Baixo: pré-plantio 80/90/100, formação 60/70/80. Médio: pré-plantio 70/80/90, formação 40/50/60. Alto: pré-plantio 40/50/60, formação 40/50/60. Muito Alto: pré-plantio 0, formação 20/20/30.
NÃO aplicar K em pré-plantio isoladamente sem P -- incorporar junto. Formação parcelada em 2 vezes (5º e 9º mês).
PRODUÇÃO (kg K2O/ha/ano) -- Muito Baixo: 110/120/130. Baixo: 100/110/120. Médio: 80/90/100. Alto: 40/60/70. Muito Alto: 20/30/40. Anual a partir do 2º/3º ano, parcelado em pelo menos 3 aplicações (a cada 4 meses), primeira no 13º mês.

OBSERVAÇÕES: se MO do solo for baixa, aplicar 1-2 kg B/ha/ano. Recomenda-se que alguma aplicação anual de N use fonte com enxofre.
REGRA DE DISPENSA: se P e/ou K estiver 3x acima do teor crítico, não aplicar (mesma regra geral do capítulo).`;

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Hortaliças, PALMEIRA REAL AUSTRALIANA (6.3.15)`;

async function main() {
  const cropProfileId = await ensureCropProfile("PALMEIRA_REAL", "Palmeira real australiana", "HORTALICA");
  console.log(`PALMEIRA_REAL: ${cropProfileId}`);
  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL]);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K por densidade de plantio e fase`, NPK_CONTENT);
  console.log("NOTA: classificação de SOLO automatizada no motor (Grupo 2) -- sem diagnose foliar. Dose (mais complexa desta base -- densidade x fase x classe de solo) continua só como texto.");
}

main().finally(() => pool.end());
