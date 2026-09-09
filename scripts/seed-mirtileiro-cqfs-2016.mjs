import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * MIRTILEIRO (Vaccinium spp., mirtilo/blueberry) -- capítulo 6.5.10 do
 * Manual CQFS-RS/SC 2016. Mesmo padrão: solo via Grupo 2, diagnose foliar
 * (Tabela 6.5.11) automatizada.
 *
 * RESTRIÇÃO AGRONÔMICA REAL, IMPORTANTE: mirtileiro é MUITO sensível a
 * cloreto (KCl) -- o manual instrui usar sulfato de potássio como fonte de
 * K, tanto em pré-plantio quanto em manutenção, e evitar cloreto de potássio
 * explicitamente. Isso é uma restrição de FONTE de fertilizante mais forte
 * que qualquer outra cultura já carregada nesta base -- registrada em texto,
 * já que o motor hoje não modela "fonte de fertilizante proibida".
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

const PRE_PLANTIO_CONTENT = `ADUBAÇÃO DE PRÉ-PLANTIO (Tabela 6.5.1, compartilhada por todas as frutíferas): mesma tabela de P2O5/K2O por classe de fertilidade do solo -- Muito baixo 250+150, Baixo 170+90, Médio 130+60, Alto 90+30, Muito alto 0+0 (kg P2O5/ha + kg K2O/ha). RESTRIÇÃO IMPORTANTE: mirtileiro é muito sensível ao KCl (cloreto de potássio) -- usar SULFATO DE POTÁSSIO como fonte de K, tanto em pré-plantio quanto em manutenção. Evitar cloreto de potássio nesta cultura.`;

const NPK_CONTENT = `NITROGÊNIO -- ADUBAÇÃO DE CRESCIMENTO E MANUTENÇÃO, cruza teor de matéria orgânica do solo × produtividade esperada (t/ha): MO<2,5%: <1,0t/ha=20, 1-3t/ha=55, >3t/ha=90 kg N/ha. MO 2,6-5,0%: 10/30/60. MO>5,0%: 0/20/40. Parcelar em 2 vezes por ano: início da floração + ~45 dias depois. Fonte preferencial: ureia ou sulfato de amônio. Aplicar ao longo da fila de plantio, faixa de ~1,0m de cada lado.

FÓSFORO E POTÁSSIO -- por classe de solo × produtividade esperada: Muito baixo: P (<1,0t/ha=10, 1-3t/ha=30, >3t/ha=50 kg P2O5/ha); K (30/80/130 kg K2O/ha). Baixo: P (7/20/40); K (15/45/75). Médio: P (5/15/30); K (10/30/50). Alto: P (0/10/20); K (5/15/25). Muito alto: P (0/0/0); K (0/0/0). Podem ser aplicados em qualquer época do ano, a lanço, sem incorporação -- MAS para produtividade acima de 3,0t/ha, parcelar o K em duas vezes (junto com N, início da floração + 45 dias depois). NUNCA usar cloreto de potássio -- só sulfato de potássio (ver restrição de pré-plantio).`;

const DIAGNOSE_FOLIAR_CONTENT = `DIAGNOSE FOLIAR DO MIRTILEIRO (Tabela 6.5.11) -- coletar 5 folhas completas, plenamente desenvolvidas, de cada 10 arbustos, no 5º ou 6º nó, a partir da extremidade dos ramos frutíferos jovens, 2ª quinzena de novembro; ~80-100 folhas por amostra. Automatizada no motor (sampleType="FOLIAR").

Macronutrientes (%) -- N: Insuficiente<1,50 / Normal 1,90-2,10 / Excessivo>2,50. P: Insuficiente<0,08 / Normal 0,12-0,40 / Excessivo>0,80. K: Insuficiente<0,30 / Normal 0,35-0,65 / Excessivo>0,95. Ca: Insuficiente<0,13 / Normal 0,40-0,80 / Excessivo>1,00. Mg: Insuficiente<0,08 / Normal 0,12-0,25 / Excessivo>0,45.
Micronutrientes (mg/kg) -- Fe: Insuficiente<60 / Normal 80-200 / Excessivo>400. Cu: Insuficiente<5 / Normal 10-20 / Excessivo>100. Zn: Insuficiente<8 / Normal 15-30 / Excessivo>80. Mn: Insuficiente<230 / Normal 350-450 / Excessivo>450. B: Insuficiente<20 / Normal 30-70 / Excessivo>200.`;

const FOLIAR_SOURCE = `Fonte: ${SOURCE_2016}, Tabela 6.5.11, p.213 -- classes de valores pra folha de mirtileiro. Verificado contra o PDF oficial reextraído com \`pdftotext -table\` em 2026-09-04.`;

/** Tabela 6.5.11 -- folha de mirtileiro. Sem profundidade (tecido, não solo). */
const FOLIAR_MIRTILEIRO = [
  { parameterCode: "N", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 1.5 }, { label: "Normal", min: 1.9, max: 2.1 }, { label: "Excessivo", min: 2.5 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "P", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.08 }, { label: "Normal", min: 0.12, max: 0.4 }, { label: "Excessivo", min: 0.8 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "K", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.3 }, { label: "Normal", min: 0.35, max: 0.65 }, { label: "Excessivo", min: 0.95 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CA", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.13 }, { label: "Normal", min: 0.4, max: 0.8 }, { label: "Excessivo", min: 1.0 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MG", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.08 }, { label: "Normal", min: 0.12, max: 0.25 }, { label: "Excessivo", min: 0.45 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "FE", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 60 }, { label: "Normal", min: 80, max: 200 }, { label: "Excessivo", min: 400 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CU", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 5 }, { label: "Normal", min: 10, max: 20 }, { label: "Excessivo", min: 100 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "ZN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 8 }, { label: "Normal", min: 15, max: 30 }, { label: "Excessivo", min: 80 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 230 }, { label: "Normal", min: 350, max: 450 }, { label: "Excessivo", min: 450 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "B", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 20 }, { label: "Normal", min: 30, max: 70 }, { label: "Excessivo", min: 200 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
];

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Frutíferas, MIRTILEIRO (6.5.10)`;

async function main() {
  const cropProfileId = await ensureCropProfile("MIRTILEIRO", "Mirtileiro", "FRUTIFERA");
  console.log(`MIRTILEIRO: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL, ...FOLIAR_MIRTILEIRO]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — adubação de pré-plantio`, PRE_PLANTIO_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K de crescimento e manutenção`, NPK_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — diagnose foliar`, DIAGNOSE_FOLIAR_CONTENT);

  console.log("NOTA: classificação de SOLO e de FOLHA (Tabela 6.5.11) automatizadas no motor -- dose de manutenção continua só como texto. Restrição de fonte de K (sem KCl) registrada em texto, motor ainda não modela isso.");
}

main().finally(() => pool.end());
