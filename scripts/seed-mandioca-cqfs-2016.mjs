import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * MANDIOCA (Manihot esculenta) -- capítulo 6.4.3 do Manual CQFS-RS/SC 2016,
 * capítulo Tubérculos e Raízes. Confirmado que NÃO está em nenhuma das duas
 * listas oficiais de Grupo 1 (nem P nem K) -- usa Grupo 2 pros dois, igual
 * grãos. Fecha o capítulo de Tubérculos e Raízes nesta base (só 3 culturas
 * no manual: batata, batata-doce, mandioca).
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

const NPK_CONTENT = `NITROGÊNIO -- por teor de matéria orgânica do solo: MO≤2,5%=70 kg N/ha. MO 2,6-5,0%=50. MO>5,0%=≤30. Em solos com MO>5%, observar histórico local da cultura (produtividade, desenvolvimento, cultivar) pra decidir cobertura. Cobertura, quando necessária, aos 45 dias após o plantio, coincidindo com uma capina -- parcelamento pode ser importante em solo arenoso e/ou MO<2,5%.

FÓSFORO E POTÁSSIO -- dose por classe de disponibilidade no solo (Grupo 2 pros dois nutrientes): Muito Baixo: P2O5=105, K2O=110 kg/ha. Baixo: 65/70. Médio: 45/50. Alto: 25/30. Muito Alto: ≤25/15.
REGRA DE DISPENSA: se P e/ou K estiver "Muito alto" E 3x acima do teor crítico, não aplicar.

MANEJO -- adubação de plantio no sulco, incorporada com antecedência (evita queima das manivas). Doses baixas de P/K → efeito residual mínimo esperado; reamostrar o solo a cada novo cultivo. Se a área for convertida pra cultivo de grãos depois da mandioca, usar a coluna "1º cultivo" da tabela de grãos (capítulo 6.1) pra próxima cultura.

MICRONUTRIENTES: mesmo padrão do capítulo -- resposta rara no Sul do Brasil, recomendação preventiva via adubo orgânico, não diagnose foliar dedicada.`;

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Tubérculos e Raízes, MANDIOCA (6.4.3)`;

async function main() {
  const cropProfileId = await ensureCropProfile("MANDIOCA", "Mandioca", "TUBERCULO");
  console.log(`MANDIOCA: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K`, NPK_CONTENT);

  console.log("NOTA: classificação de SOLO automatizada no motor (P e K via Grupo 2) -- sem diagnose foliar. Dose continua só como texto. Fecha o capítulo Tubérculos e Raízes (batata, batata-doce, mandioca).");
}

main().finally(() => pool.end());
