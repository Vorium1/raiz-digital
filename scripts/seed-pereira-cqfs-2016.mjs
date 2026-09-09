import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * PEREIRA (Pyrus spp.) -- capítulo 6.5.15 do Manual CQFS-RS/SC 2016.
 *
 * DECISÃO DE MODELAGEM real, registrar: o manual traz DUAS tabelas de
 * diagnose foliar pra pereira -- asiática (Pyrus pyrifolia, Tabela 6.5.15)
 * e europeia (Pyrus communis, Tabela 6.5.16) -- com faixas DIFERENTES pro
 * mesmo nutriente. Isso não cabe no mecanismo de condição existente
 * (`condition_parameter_code`/min/max, feito pra condição NUMÉRICA de solo
 * tipo classe de argila/CTC, não pra "tipo de cultivar" categórico). Por
 * isso carreguei DOIS crop_profiles separados -- PEREIRA_ASIATICA e
 * PEREIRA_EUROPEIA -- em vez de forçar um perfil só com faixas ambíguas.
 * Ambos compartilham a mesma classificação de solo (Grupo 2) e as mesmas
 * doses de N/P/K (o manual não diferencia isso por tipo de pereira), só a
 * diagnose foliar difere de verdade.
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

const PRE_PLANTIO_CONTENT = `ADUBAÇÃO DE PRÉ-PLANTIO (Tabela 6.5.1, compartilhada por todas as frutíferas): mesma tabela de P2O5/K2O por classe de fertilidade do solo -- Muito baixo 250+150, Baixo 170+90, Médio 130+60, Alto 90+30, Muito alto 0+0 (kg P2O5/ha + kg K2O/ha). Em solos com MO<2,5%, adicionar também 2 a 3 kg/ha de B.`;

const NPK_CONTENT = `NITROGÊNIO -- ADUBAÇÃO DE CRESCIMENTO (mudas), por teor de matéria orgânica do solo e ano após o plantio (1º/2º/3º): MO<2,5%: 40/50/60 kg N/ha. MO 2,6-5,0%: 30/40/50. MO>5,0%: 20/30/40. Parcelar em 3 vezes, a partir do início da brotação.

ADUBAÇÃO DE MANUTENÇÃO -- direto por tonelada de fruto estimada: 2,0 kg N/ha/ano + 2,5 kg K2O/ha/ano por tonelada. Pomares com adubação fosfatada de pré-plantio DISPENSAM adubação de manutenção com fósforo. N parcelado em até 3 vezes (3x na primavera, OU 2x na primavera + 1x pós-colheita -- dispensável em anos de baixa produção/vigor excessivo). K em uma única vez, no inverno ou com a primeira aplicação de N.

ADUBAÇÃO FOLIAR (cálcio) -- em plantas com diagnose foliar de Ca insuficiente: 3 a 5 pulverizações quinzenais de CaCl2 0,4-0,5%, em plantas em produção, a partir do final de outubro. Em plantas com N foliar insuficiente: nitrato de cálcio 0,6%, mesmo esquema. Objetivo: melhorar conservação dos frutos e evitar distúrbios fisiológicos.`;

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Frutíferas, PEREIRA (6.5.15)`;

// -- PEREIRA ASIÁTICA (Pyrus pyrifolia) -- Tabela 6.5.15 --
const FOLIAR_SOURCE_ASIATICA = `Fonte: ${SOURCE_2016}, Tabela 6.5.15, p.222 -- classes de valores pra folha de pereira asiática (Pyrus pyrifolia). Verificado contra o PDF oficial reextraído com \`pdftotext -table\` em 2026-09-04.`;
const FOLIAR_PEREIRA_ASIATICA = [
  { parameterCode: "N", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 2.0 }, { label: "Normal", min: 2.3, max: 2.7 }, { label: "Excessivo", min: 3.0 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE_ASIATICA },
  { parameterCode: "P", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.1 }, { label: "Normal", min: 0.13, max: 0.2 }, { label: "Excessivo", min: 0.25 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE_ASIATICA },
  { parameterCode: "K", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.8 }, { label: "Normal", min: 1.2, max: 1.6 }, { label: "Excessivo", min: 2.0 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE_ASIATICA },
  { parameterCode: "CA", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 1.0 }, { label: "Normal", min: 2.0, max: 2.5 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE_ASIATICA },
  { parameterCode: "MG", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.25 }, { label: "Normal", min: 0.3, max: 0.5 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE_ASIATICA },
  { parameterCode: "FE", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 30 }, { label: "Normal", min: 60, max: 80 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE_ASIATICA },
  { parameterCode: "CU", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Normal", min: 10, max: 100 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE_ASIATICA },
  { parameterCode: "ZN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 15 }, { label: "Normal", min: 50, max: 90 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE_ASIATICA },
  { parameterCode: "MN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 20 }, { label: "Normal", min: 60, max: 200 }, { label: "Excessivo", min: 300 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE_ASIATICA },
  { parameterCode: "B", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Normal", min: 30, max: 90 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE_ASIATICA },
];
const DIAGNOSE_FOLIAR_ASIATICA = `DIAGNOSE FOLIAR DA PEREIRA ASIÁTICA (Tabela 6.5.15, Pyrus pyrifolia) -- coletar folhas completas e normais da parte mediana das brotações do ano, 15/jan a 15/fev; ~100 folhas de 20-30 plantas. Automatizada no motor (sampleType="FOLIAR"). Várias faixas de Excessivo/Insuficiente não definidas pelo manual (Ca/Mg/Fe/Cu/Zn/B) -- não inventadas aqui.

Macronutrientes (%) -- N: Insuf<2,00 / Normal 2,30-2,70 / Excess>3,00. P: Insuf<0,10 / Normal 0,13-0,20 / Excess>0,25. K: Insuf<0,80 / Normal 1,20-1,60 / Excess>2,00. Ca: Insuf<1,00 / Normal 2,00-2,50 (sem Excess). Mg: Insuf<0,25 / Normal 0,30-0,50 (sem Excess).
Micronutrientes (mg/kg) -- Fe: Insuf<30 / Normal 60-80 (sem Excess). Cu: Normal 10-100 (sem Insuf/Excess). Zn: Insuf<15 / Normal 50-90 (sem Excess). Mn: Insuf<20 / Normal 60-200 / Excess>300. B: Normal 30-90 (sem Insuf/Excess).`;

// -- PEREIRA EUROPEIA (Pyrus communis) -- Tabela 6.5.16 --
const FOLIAR_SOURCE_EUROPEIA = `Fonte: ${SOURCE_2016}, Tabela 6.5.16, p.223 -- classes de valores pra folha de pereira europeia (Pyrus communis). Verificado contra o PDF oficial reextraído com \`pdftotext -table\` em 2026-09-04.`;
const FOLIAR_PEREIRA_EUROPEIA = [
  { parameterCode: "N", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 1.7 }, { label: "Normal", min: 2.1, max: 2.5 }, { label: "Excessivo", min: 3.0 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE_EUROPEIA },
  { parameterCode: "P", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.1 }, { label: "Normal", min: 0.15, max: 0.3 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE_EUROPEIA },
  { parameterCode: "K", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.8 }, { label: "Normal", min: 1.3, max: 1.5 }, { label: "Excessivo", min: 2.0 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE_EUROPEIA },
  { parameterCode: "CA", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.8 }, { label: "Normal", min: 1.2, max: 1.7 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE_EUROPEIA },
  { parameterCode: "MG", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.2 }, { label: "Normal", min: 0.25, max: 0.45 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE_EUROPEIA },
  { parameterCode: "FE", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Normal", min: 50, max: 250 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE_EUROPEIA },
  { parameterCode: "CU", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 3.0 }, { label: "Normal", min: 5, max: 30 }, { label: "Excessivo", min: 50 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE_EUROPEIA },
  { parameterCode: "ZN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 15 }, { label: "Normal", min: 20, max: 100 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE_EUROPEIA },
  { parameterCode: "MN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 20 }, { label: "Normal", min: 30, max: 130 }, { label: "Excessivo", min: 200 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE_EUROPEIA },
  { parameterCode: "B", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 20 }, { label: "Normal", min: 30, max: 50 }, { label: "Excessivo", min: 140 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE_EUROPEIA },
];
const DIAGNOSE_FOLIAR_EUROPEIA = `DIAGNOSE FOLIAR DA PEREIRA EUROPEIA (Tabela 6.5.16, Pyrus communis) -- mesma metodologia de coleta da pereira asiática (folhas completas e normais, parte mediana das brotações do ano, 15/jan a 15/fev; ~100 folhas de 20-30 plantas). Automatizada no motor (sampleType="FOLIAR"). Várias faixas não definidas pelo manual (Fe insuf/excess, Ca/Mg excess, Zn excess) -- não inventadas aqui.

Macronutrientes (%) -- N: Insuf<1,70 / Normal 2,10-2,50 / Excess>3,00. P: Insuf<0,10 / Normal 0,15-0,30 (sem Excess). K: Insuf<0,80 / Normal 1,30-1,50 / Excess>2,00. Ca: Insuf<0,80 / Normal 1,20-1,70 (sem Excess). Mg: Insuf<0,20 / Normal 0,25-0,45 (sem Excess).
Micronutrientes (mg/kg) -- Fe: Normal 50-250 (sem Insuf/Excess). Cu: Insuf<3,0 / Normal 5-30 / Excess>50. Zn: Insuf<15 / Normal 20-100 (sem Excess). Mn: Insuf<20 / Normal 30-130 / Excess>200. B: Insuf<20 / Normal 30-50 / Excess>140.`;

async function seedPereira(code, name, foliarParams, diagnoseFoliarContent) {
  const cropProfileId = await ensureCropProfile(code, name, "FRUTIFERA");
  console.log(`${code}: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL, ...foliarParams]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — adubação de pré-plantio`, PRE_PLANTIO_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K de crescimento e manutenção + adubação foliar de cálcio`, NPK_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — diagnose foliar (${name})`, diagnoseFoliarContent);
}

async function main() {
  await seedPereira("PEREIRA_ASIATICA", "Pereira asiática", FOLIAR_PEREIRA_ASIATICA, DIAGNOSE_FOLIAR_ASIATICA);
  await seedPereira("PEREIRA_EUROPEIA", "Pereira europeia", FOLIAR_PEREIRA_EUROPEIA, DIAGNOSE_FOLIAR_EUROPEIA);

  console.log("NOTA: duas culturas separadas (asiática/europeia) porque o manual traz faixas foliares DIFERENTES pro mesmo nutriente -- schema hoje não modela 'tipo de cultivar' como dimensão condicional (só numérica). Classificação de SOLO e de FOLHA automatizadas em ambas -- dose de manutenção continua só como texto.");
}

main().finally(() => pool.end());
