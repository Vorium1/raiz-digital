import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * AMEIXEIRA (Prunus salicina/domestica) -- capítulo 6.5.2 do Manual CQFS-RS/SC
 * 2016. Mesmo padrão de baixo risco: solo automatizado via Grupo 2, diagnose
 * foliar (Tabela 6.5.3) automatizada desde o início. Conferido direto contra
 * o PDF oficial reextraído com `pdftotext -table`.
 *
 * ACHADO REAL: as tabelas de dose de N/P/K de crescimento e manutenção da
 * ameixeira são NUMERICAMENTE IDÊNTICAS às do pessegueiro/nectarineira
 * (mesma família Prunus) -- conferido número a número contra o PDF, não é
 * suposição. Só a diagnose foliar (Tabela 6.5.3) é específica da ameixeira.
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

const PRE_PLANTIO_CONTENT = `ADUBAÇÃO DE PRÉ-PLANTIO (Tabela 6.5.1, compartilhada por todas as frutíferas): mesma tabela de P2O5/K2O por classe de fertilidade do solo -- Muito baixo 250+150, Baixo 170+90, Médio 130+60, Alto 90+30, Muito alto 0+0 (kg P2O5/ha + kg K2O/ha). Específico pra ameixeira: adicionar também 2 a 3 kg/ha de B.`;

const NPK_CONTENT = `NITROGÊNIO -- ADUBAÇÃO DE CRESCIMENTO (mudas), por teor de matéria orgânica do solo e ano após o plantio (1º/2º/3º): MO 0-2,5%: 50/60/80 kg N/ha. MO 2,6-5,0%: 40/50/60. MO>5,0%: 20/30/40. Parcelar em 3 vezes, a partir do início da brotação, intervalos de 45 dias -- no 1º ano, a primeira dose só 30 dias após o início da brotação das mudas. (NOTA: essas tabelas de dose são numericamente idênticas às do pessegueiro/nectarineira, mesma família Prunus -- conferido contra o PDF, não é suposição.)

ADUBAÇÃO DE MANUTENÇÃO (a partir do 4º ano), baseada só no teor foliar do nutriente e na produtividade esperada:
NITROGÊNIO -- teor foliar de N: <1,90%=110 kg N/ha. 1,90-2,57%=90. 2,58-3,25%=70. 3,26-3,90%=50. 3,91-4,53%=30. >4,53%=0. Ajuste: +2kg N/ha por tonelada de fruto produzida acima de 20t/ha.
FÓSFORO -- teor foliar de P: <0,04%=80-120 kg P2O5/ha. 0,04-0,09%=40-60. >0,09%=0.
POTÁSSIO -- teor foliar de K: <0,54%=100 kg K2O/ha. 0,54-0,92%=80. 0,93-1,30%=60. 1,31-1,68%=40. 1,69-2,07%=30. 2,07-2,82%=20. >2,82%=0. Ajuste: +4kg K2O/ha por tonelada de fruto produzida acima de 20t/ha.
N parcelado em 3 vezes: 50% no início da floração, 25% após o raleio dos frutos, 25% após a colheita (dispensável em anos de baixa produção/vigor excessivo). P em uma única vez, com a primeira aplicação de N. K em uma vez ou fracionado em duas pra cultivares de ciclo tardio/solo arenoso. Após raleio, poda verde pra arejamento (controle de podridões de fruto).`;

const DIAGNOSE_FOLIAR_CONTENT = `DIAGNOSE FOLIAR DA AMEIXEIRA (Tabela 6.5.3) -- coletar ~100 folhas completas (limbo+pecíolo), parte média dos ramos emitidos no ano, diferentes lados da planta, entre a 13ª e a 15ª semana após a plena floração. Se essa época coincidir com a colheita de algum cultivar, antecipar a coleta pra antes da colheita. Automatizada no motor (sampleType="FOLIAR").

Macronutrientes (%) -- N: Insuficiente<1,80 / Normal 2,31-2,80 / Excessivo>3,30. P: Insuficiente<0,04 / Normal 0,15-0,28 / Excessivo>0,40. K: Insuficiente<0,54 / Normal 1,30-2,10 / Excessivo>2,80. Ca: Insuficiente<0,66 / Normal 1,60-2,60 / Excessivo>3,50. Mg: Insuficiente<0,19 / Normal 0,50-0,80 / Excessivo>1,10.
Micronutrientes (mg/kg) -- Fe: Insuficiente<50 / Normal 100-230 / Excessivo>300. Cu: Normal 6,0-30 / Excessivo>50 (sem faixa de insuficiência definida). Zn: Insuficiente<10 / Normal 20-40 / Excessivo>50. Mn: Insuficiente<20 / Normal 39-160 / Excessivo>400. B: Insuficiente<3 / Normal 30-60 / Excessivo>90.`;

const FOLIAR_SOURCE = `Fonte: ${SOURCE_2016}, Tabela 6.5.3, p.197 -- classes de valores pra folha de ameixeira. Verificado contra o PDF oficial reextraído com \`pdftotext -table\` em 2026-09-04. Cu sem faixa de insuficiência definida no manual -- não inventada aqui.`;

/** Tabela 6.5.3 -- folha de ameixeira. Sem profundidade (tecido, não solo). */
const FOLIAR_AMEIXEIRA = [
  { parameterCode: "N", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 1.8 }, { label: "Normal", min: 2.31, max: 2.8 }, { label: "Excessivo", min: 3.3 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "P", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.04 }, { label: "Normal", min: 0.15, max: 0.28 }, { label: "Excessivo", min: 0.4 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "K", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.54 }, { label: "Normal", min: 1.3, max: 2.1 }, { label: "Excessivo", min: 2.8 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CA", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.66 }, { label: "Normal", min: 1.6, max: 2.6 }, { label: "Excessivo", min: 3.5 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MG", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.19 }, { label: "Normal", min: 0.5, max: 0.8 }, { label: "Excessivo", min: 1.1 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "FE", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 50 }, { label: "Normal", min: 100, max: 230 }, { label: "Excessivo", min: 300 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CU", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Normal", min: 6.0, max: 30 }, { label: "Excessivo", min: 50 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "ZN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 10 }, { label: "Normal", min: 20, max: 40 }, { label: "Excessivo", min: 50 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 20 }, { label: "Normal", min: 39, max: 160 }, { label: "Excessivo", min: 400 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "B", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 3 }, { label: "Normal", min: 30, max: 60 }, { label: "Excessivo", min: 90 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
];

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Frutíferas, AMEIXEIRA (6.5.2)`;

async function main() {
  const cropProfileId = await ensureCropProfile("AMEIXEIRA", "Ameixeira", "FRUTIFERA");
  console.log(`AMEIXEIRA: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL, ...FOLIAR_AMEIXEIRA]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — adubação de pré-plantio`, PRE_PLANTIO_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K de crescimento e manutenção`, NPK_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — diagnose foliar`, DIAGNOSE_FOLIAR_CONTENT);

  console.log("NOTA: classificação de SOLO e de FOLHA (Tabela 6.5.3) automatizadas no motor -- dose de manutenção continua só como texto.");
}

main().finally(() => pool.end());
