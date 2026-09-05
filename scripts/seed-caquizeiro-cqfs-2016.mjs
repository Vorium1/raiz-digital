import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * CAQUIZEIRO (Diospyros kaki, caqui/persimmon) -- capítulo 6.5.5 do Manual
 * CQFS-RS/SC 2016. Mesmo padrão: solo via Grupo 2, diagnose foliar (Tabela
 * 6.5.6) automatizada. ÚNICA cultura desta base cuja tabela foliar só
 * classifica MACRONUTRIENTES -- o manual não traz tabela de micronutrientes
 * pra esta cultura (não é omissão nossa, é a fonte mesmo).
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

const NPK_CONTENT = `NITROGÊNIO -- ADUBAÇÃO DE CRESCIMENTO (mudas), por teor de matéria orgânica do solo e ano após o plantio (1º/2º/3º): MO<2,5%: 30/45/60 kg N/ha. MO 2,6-5,0%: 20/30/40. MO>5,0%: 10/20/30. Parcelar em 3 a 4 vezes, a partir do início da primavera.

ADUBAÇÃO DE MANUTENÇÃO -- direto por tonelada de fruto estimada (padrão simples, sem cruzar com classe foliar): 3,0 a 4,0 kg N/ha/ano + 1,0 kg P2O5/ha/ano + 4,0 a 5,0 kg K2O/ha/ano por tonelada. N em duas vezes (50% início da primavera, restante pós-colheita). P e K em uma única vez, no inverno ou com a primeira aplicação de N. Excesso de N pode induzir baixa frutificação e queda de frutos -- reduzir/suprimir em plantas muito vigorosas.`;

const DIAGNOSE_FOLIAR_CONTENT = `DIAGNOSE FOLIAR DO CAQUIZEIRO (Tabela 6.5.6) -- ÚNICA cultura desta base cuja tabela foliar só classifica macronutrientes (o manual não traz tabela de micronutrientes pra esta cultura). Coletar folhas completas da parte mediana das brotações emitidas no ano, 15/jan a 15/fev; ~100 folhas de 20-30 plantas. Automatizada no motor (sampleType="FOLIAR").

Macronutrientes (%) -- N: Insuficiente<1,0 / Normal 2,1-2,8 / Excessivo>3,0. P: Insuficiente<0,08 / Normal 0,12-0,15 / Excessivo>0,20. K: Insuficiente<1,0 / Normal 2,1-3,7 / Excessivo>4,0. Ca: Insuficiente<0,5 / Normal 1,1-1,5 / Excessivo>1,8. Mg: Insuficiente<0,10 / Normal 0,19-0,30 / Excessivo>0,5.`;

const FOLIAR_SOURCE = `Fonte: ${SOURCE_2016}, Tabela 6.5.6, p.202 -- classes de valores pra folha de caquizeiro (só macronutrientes, sem tabela de micronutrientes no manual). Verificado contra o PDF oficial reextraído com \`pdftotext -table\` em 2026-09-04.`;

/** Tabela 6.5.6 -- folha de caquizeiro. Só macronutrientes (sem micro no manual). Sem profundidade (tecido). */
const FOLIAR_CAQUIZEIRO = [
  { parameterCode: "N", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 1.0 }, { label: "Normal", min: 2.1, max: 2.8 }, { label: "Excessivo", min: 3.0 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "P", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.08 }, { label: "Normal", min: 0.12, max: 0.15 }, { label: "Excessivo", min: 0.2 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "K", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 1.0 }, { label: "Normal", min: 2.1, max: 3.7 }, { label: "Excessivo", min: 4.0 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CA", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.5 }, { label: "Normal", min: 1.1, max: 1.5 }, { label: "Excessivo", min: 1.8 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MG", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.1 }, { label: "Normal", min: 0.19, max: 0.3 }, { label: "Excessivo", min: 0.5 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
];

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Frutíferas, CAQUIZEIRO (6.5.5)`;

async function main() {
  const cropProfileId = await ensureCropProfile("CAQUIZEIRO", "Caquizeiro", "FRUTIFERA");
  console.log(`CAQUIZEIRO: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL, ...FOLIAR_CAQUIZEIRO]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — adubação de pré-plantio`, PRE_PLANTIO_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K de crescimento e manutenção`, NPK_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — diagnose foliar`, DIAGNOSE_FOLIAR_CONTENT);

  console.log("NOTA: classificação de SOLO e de FOLHA (Tabela 6.5.6, só macronutrientes) automatizadas no motor -- dose de manutenção continua só como texto.");
}

main().finally(() => pool.end());
