import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * BANANEIRA (Musa spp.) -- capítulo 6.5.4 do Manual CQFS-RS/SC 2016. Mesmo
 * padrão: solo via Grupo 2, diagnose foliar (Tabela 6.5.5) automatizada.
 * Estrutura de faixa única "Adequado" por nutriente (igual morangueiro) --
 * o manual não define Insuficiente/Excessivo pra esta cultura.
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

const NPK_CONTENT = `NITROGÊNIO -- ADUBAÇÃO DE CRESCIMENTO, feita no 1º ciclo (30 dias após plantio até a colheita do 1º cacho, ~16 meses depois), por teor de matéria orgânica do solo: MO<2,5%=300 kg N/ha. MO 2,6-5,0%=200. MO>5,0%=100. Parcelar em 4 a 5 aplicações, ao redor das mudas.

ADUBAÇÃO DE MANUTENÇÃO -- direto por tonelada de fruto estimada a colher: 3,0 a 5,0 kg N/ha/ano + 1,0 kg P2O5/ha/ano + 8,0 a 13 kg K2O/ha/ano por tonelada. P em uma única vez; N e K parcelados em 4 a 5 vezes. Aplicar ao redor das mudas, a lanço, ~40cm do caule.`;

const DIAGNOSE_FOLIAR_CONTENT = `DIAGNOSE FOLIAR DA BANANEIRA (Tabela 6.5.5) -- estrutura de faixa única "Adequado" por nutriente (igual morangueiro, o manual não define Insuficiente/Excessivo pra esta cultura). Coletar no início do florescimento (da emissão da inflorescência até 3 pencas abertas); 3ª folha mais jovem, ~20 plantas, subamostra da parte mediana com 10cm de comprimento (descartando 1/4 de cada lateral). Automatizada no motor (sampleType="FOLIAR").

Macronutrientes -- N: 2,7-3,6%. P: 0,18-0,27%. K: 3,5-5,4%. Ca: 0,3-1,2%. Mg: 0,3-0,6%.
Micronutrientes (mg/kg) -- Fe: 80-360. Cu: 6-30. Zn: 20-50. Mn: 200-2000. B: 10-25.`;

const FOLIAR_SOURCE = `Fonte: ${SOURCE_2016}, Tabela 6.5.5, p.201 -- intervalo considerado adequado por nutriente na folha de bananeira. Verificado contra o PDF oficial reextraído com \`pdftotext -table\` em 2026-09-04. Sem faixa Insuficiente/Excessivo definida pelo manual -- valor fora da faixa fica sem classificação, não vira "baixo"/"alto" inventado.`;

/** Tabela 6.5.5 -- folha de bananeira, faixa única "Adequado". Sem profundidade (tecido). */
const FOLIAR_BANANEIRA = [
  { parameterCode: "N", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Adequado", min: 2.7, max: 3.6 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "P", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Adequado", min: 0.18, max: 0.27 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "K", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Adequado", min: 3.5, max: 5.4 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CA", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Adequado", min: 0.3, max: 1.2 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MG", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Adequado", min: 0.3, max: 0.6 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "FE", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Adequado", min: 80, max: 360 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CU", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Adequado", min: 6, max: 30 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "ZN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Adequado", min: 20, max: 50 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Adequado", min: 200, max: 2000 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "B", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Adequado", min: 10, max: 25 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
];

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Frutíferas, BANANEIRA (6.5.4)`;

async function main() {
  const cropProfileId = await ensureCropProfile("BANANEIRA", "Bananeira", "FRUTIFERA");
  console.log(`BANANEIRA: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL, ...FOLIAR_BANANEIRA]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — adubação de pré-plantio`, PRE_PLANTIO_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K de crescimento e manutenção`, NPK_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — diagnose foliar`, DIAGNOSE_FOLIAR_CONTENT);

  console.log("NOTA: classificação de SOLO e de FOLHA (Tabela 6.5.5, faixa única) automatizadas no motor -- dose de manutenção continua só como texto.");
}

main().finally(() => pool.end());
