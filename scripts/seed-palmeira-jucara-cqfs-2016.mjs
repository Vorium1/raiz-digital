import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * PALMEIRA JUÇARA (Euterpe edulis) -- capítulo 6.5.14 do Manual CQFS-RS/SC
 * 2016. Mesmo padrão de solo (Grupo 2) -- mas SEM diagnose foliar: o manual
 * não traz tabela de classificação foliar pra essa cultura (nativa,
 * palmito), só uma tabela de dose por idade da planta. Nenhuma pendência
 * de sample_type aqui, é ausência real da fonte.
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

const PRE_PLANTIO_CONTENT = `ADUBAÇÃO DE PRÉ-PLANTIO (Tabela 6.5.1, compartilhada por todas as frutíferas): mesma tabela de P2O5/K2O por classe de fertilidade do solo -- Muito baixo 250+150, Baixo 170+90, Médio 130+60, Alto 90+30, Muito alto 0+0 (kg P2O5/ha + kg K2O/ha).`;

const NPK_CONTENT = `ADUBAÇÃO DE CRESCIMENTO E PRODUÇÃO -- baseada na IDADE das plantas (não em teor de solo ou folha, estrutura própria desta cultura), doses de referência pra produtividade de 4t/ha e densidade de 830 plantas/ha (ajustar proporcionalmente pra produtividade maior):
Idade 0-1 ano: N=20, P2O5=não aplicar, K2O=20 (kg/ha).
1-2 anos: N=30, P2O5=25, K2O=35.
2-3 anos: N=50, P2O5=35, K2O=55.
3-4 anos: N=60, P2O5=45, K2O=70.
4-5 anos: N=80, P2O5=60, K2O=85.
5-6 anos: N=115, P2O5=95, K2O=125.
6-7 anos: N=115, P2O5=95, K2O=125.
N e K parcelados em 3 vezes ao longo do ano -- 1ª aplicação 45-60 dias após o plantio, as outras duas depois desse período. Aplicar sobre a superfície do solo da fila de plantio, sem incorporação, na área de projeção da copa.

NOTA: esta cultura NÃO TEM tabela de diagnose foliar no manual (única frutífera desta base sem essa tabela) -- não é omissão nossa, a fonte não traz classificação foliar pra palmeira juçara, provavelmente por ser espécie nativa menos estudada nesse aspecto que as frutíferas comerciais tradicionais.`;

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Frutíferas, PALMEIRA JUÇARA (6.5.14)`;

async function main() {
  const cropProfileId = await ensureCropProfile("PALMEIRA_JUCARA", "Palmeira juçara", "FRUTIFERA");
  console.log(`PALMEIRA_JUCARA: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — adubação de pré-plantio`, PRE_PLANTIO_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K por idade da planta`, NPK_CONTENT);

  console.log("NOTA: classificação de SOLO automatizada no motor -- esta cultura não tem tabela de diagnose foliar no manual (única desta base), então não há FOLIAR pra automatizar aqui. Dose por idade continua só como texto.");
}

main().finally(() => pool.end());
