import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * QUIVIZEIRO (Actinidia deliciosa, kiwi) -- capítulo 6.5.17 do Manual
 * CQFS-RS/SC 2016. ÚLTIMA cultura do capítulo 6.5 (frutíferas) a ser
 * carregada nesta base -- fecha o capítulo inteiro (18 espécies + pereira
 * asiática/europeia como perfis separados = 19 crop_profiles de frutífera).
 * Mesmo padrão: solo via Grupo 2, diagnose foliar (Tabela 6.5.17, mesmo
 * número da seção -- coincidência de numeração do manual) automatizada.
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

const NPK_CONTENT = `NITROGÊNIO -- ADUBAÇÃO DE CRESCIMENTO (mudas), por teor de matéria orgânica do solo e ano após o plantio (1º/2º/3º): MO<2,5%: 40/50/60 kg N/ha. MO 2,6-5,0%: 30/40/50. MO>5,0%: 10/15/20. Parcelar em 3 vezes, a partir do início da brotação.

ADUBAÇÃO DE MANUTENÇÃO -- direto por tonelada de fruto estimada: 3,0 a 5,0 kg N/ha/ano + 4,0 a 5,0 kg K2O/ha/ano por tonelada. Pomares com adubação fosfatada de pré-plantio normalmente DISPENSAM P de manutenção. N parcelado em 2 a 3 vezes (1ª no início da primavera, demais ao longo dos estágios fenológicos). K em uma única vez, no inverno ou com a primeira aplicação de N.`;

const DIAGNOSE_FOLIAR_CONTENT = `DIAGNOSE FOLIAR DO QUIVIZEIRO (Tabela 6.5.17) -- coletar a 2ª folha normal com pecíolo, localizada depois dos frutos, em fevereiro; ~40-50 folhas de 20-30 plantas. Automatizada no motor (sampleType="FOLIAR").

Macronutrientes (%) -- N: Insuficiente<1,50 / Normal 1,80-2,80 / Excessivo>5,50. P: Insuficiente<0,12 / Normal 0,18-0,40 / Excessivo>1,00. K: Insuficiente<1,50 / Normal 1,70-2,50 (sem Excessivo definido). Ca: Insuficiente<2,00 / Normal 4,00-5,50 (sem Excessivo). Mg: Insuficiente<0,10 / Normal 0,45-0,80 (sem Excessivo).
Micronutrientes (mg/kg) -- Fe: Insuficiente<60 / Normal 80-200 (sem Excessivo). Cu: Insuficiente<3 / Normal 7-15 (sem Excessivo). Zn: Insuficiente<12 / Normal 50-100 / Excessivo>1000. Mn: Insuficiente<30 / Normal 100-200 / Excessivo>1500. B: Insuficiente<20 / Normal 50-70 / Excessivo>100.`;

const FOLIAR_SOURCE = `Fonte: ${SOURCE_2016}, Tabela 6.5.17, p.227 -- classes de valores pra folha de quivizeiro. Verificado contra o PDF oficial reextraído com \`pdftotext -table\` em 2026-09-04.`;

/** Tabela 6.5.17 -- folha de quivizeiro. Sem profundidade (tecido, não solo). */
const FOLIAR_QUIVIZEIRO = [
  { parameterCode: "N", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 1.5 }, { label: "Normal", min: 1.8, max: 2.8 }, { label: "Excessivo", min: 5.5 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "P", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.12 }, { label: "Normal", min: 0.18, max: 0.4 }, { label: "Excessivo", min: 1.0 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "K", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 1.5 }, { label: "Normal", min: 1.7, max: 2.5 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CA", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 2.0 }, { label: "Normal", min: 4.0, max: 5.5 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MG", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.1 }, { label: "Normal", min: 0.45, max: 0.8 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "FE", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 60 }, { label: "Normal", min: 80, max: 200 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CU", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 3 }, { label: "Normal", min: 7, max: 15 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "ZN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 12 }, { label: "Normal", min: 50, max: 100 }, { label: "Excessivo", min: 1000 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 30 }, { label: "Normal", min: 100, max: 200 }, { label: "Excessivo", min: 1500 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "B", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 20 }, { label: "Normal", min: 50, max: 70 }, { label: "Excessivo", min: 100 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
];

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Frutíferas, QUIVIZEIRO (6.5.17)`;

async function main() {
  const cropProfileId = await ensureCropProfile("QUIVIZEIRO", "Quivizeiro", "FRUTIFERA");
  console.log(`QUIVIZEIRO: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL, ...FOLIAR_QUIVIZEIRO]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — adubação de pré-plantio`, PRE_PLANTIO_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K de crescimento e manutenção`, NPK_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — diagnose foliar`, DIAGNOSE_FOLIAR_CONTENT);

  console.log("NOTA: classificação de SOLO e de FOLHA (Tabela 6.5.17) automatizadas no motor -- dose de manutenção continua só como texto. Capítulo 6.5 (Frutíferas) do manual CQFS-RS/SC 2016 completo nesta base.");
}

main().finally(() => pool.end());
