import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * NOGUEIRA-PECÃ (Carya illinoinensis, pecã) -- capítulo 6.5.12 do Manual
 * CQFS-RS/SC 2016. Mesmo padrão: solo via Grupo 2, diagnose foliar (Tabela
 * 6.5.13) automatizada -- faixa única "Adequado".
 *
 * DETALHE REAL: doses de N estabelecidas pra espaçamento 10m x 10m (100
 * plantas/ha) -- ajuste pra outro espaçamento fica a critério do técnico,
 * não automatizado (não é cálculo do motor, é julgamento profissional).
 * Também tem regra de adubação FOLIAR condicional (pulverização de Zn/B
 * disparada por limiar de teor foliar) -- registrada em texto, o motor
 * ainda não modela "ação disparada por limiar de outro parâmetro" fora do
 * mecanismo de derivação/condição já existente pra classificação de solo.
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

const NPK_CONTENT = `NITROGÊNIO -- ADUBAÇÃO DE CRESCIMENTO, por teor de matéria orgânica do solo e ano após o plantio (1º a 6º ano) -- doses estabelecidas pra espaçamento 10m×10m (100 plantas/ha); ajuste pra outro espaçamento/densidade fica a critério do técnico responsável: MO<2,5%: 15/20/30/40/50/60 kg N/ha (anos 1-6). MO 2,6-5,0%: 10/15/25/35/45/55. MO>5,0%: 5/10/15/20/25/30. Parcelar em 3 vezes: setembro, novembro e janeiro. Preferir resíduo orgânico como fonte de N quando possível.

ADUBAÇÃO DE MANUTENÇÃO -- NITROGÊNIO por produtividade esperada: <1,5t/ha=100, 1,5-3,0t/ha=200, >3,0t/ha=300 kg N/ha. Parcelar em até 3 vezes (setembro, novembro, janeiro). Em anos de baixa produtividade esperada por alternância de cultivares (Barton, Cheyenne, Elliott, Jackson, Mahan, Moneymaker, Shoshoni, Shawnee, Success), reduzir a dose de N em 50% (evita vigor excessivo de ramos improdutivos).
FÓSFORO E POTÁSSIO -- direto por tonelada de fruto: 4,6 kg P2O5/ha/ano + 4,8 kg K2O/ha/ano por tonelada, aplicados em julho. Em pomares com 8+ anos, os adubos podem ser aplicados a lanço em toda a área (antes, só na fila de plantio).

ADUBAÇÃO FOLIAR CONDICIONAL (disparada por limiar de teor foliar, não é classificação, é regra de ação): se teor foliar de Zn <50mg/kg, fazer 4 pulverizações foliares de zinco (início após a brotação, quando folíolos tiverem ≥5cm, intervalo de 14 dias entre aplicações; 400g de sulfato de zinco + 0,5kg de ureia por 100L de água). Se teor foliar de B <50mg/kg, aplicar ácido bórico (300g/100L de água, 1ª aplicação 3 semanas antes da floração + 2ª aplicação 14 dias depois; NUNCA ultrapassar 1,0kg/ha/ano de boro).`;

const DIAGNOSE_FOLIAR_CONTENT = `DIAGNOSE FOLIAR DA NOGUEIRA-PECÃ (Tabela 6.5.13) -- faixa única "Adequado" por nutriente. Coletar folíolos completos (limbo+pecíolo) e normais, parte mediana das brotações do ano, em fevereiro, ramos a 1,5-2,0m do solo, 4 quadrantes da copa, 8-10 plantas representativas por até 4ha; ~100 folíolos por amostra. Automatizada no motor (sampleType="FOLIAR").

Macronutrientes -- N: 2,5-3,0%. P: 0,14-0,30%. K: 1,3-2,5%. Ca: 1,3-1,7%. Mg: 0,3-0,6%.
Micronutrientes (mg/kg) -- Fe: 80-300. Cu: 6-30. Zn: 50-100. Mn: 100-800. B: 50-100.`;

const FOLIAR_SOURCE = `Fonte: ${SOURCE_2016}, Tabela 6.5.13, p.217 -- intervalo considerado adequado por nutriente no folíolo de nogueira-pecã. Verificado contra o PDF oficial reextraído com \`pdftotext -table\` em 2026-09-04.`;

/** Tabela 6.5.13 -- folíolo de nogueira-pecã, faixa única "Adequado". Sem profundidade (tecido). */
const FOLIAR_NOGUEIRA_PECA = [
  { parameterCode: "N", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Adequado", min: 2.5, max: 3.0 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "P", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Adequado", min: 0.14, max: 0.3 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "K", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Adequado", min: 1.3, max: 2.5 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CA", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Adequado", min: 1.3, max: 1.7 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MG", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Adequado", min: 0.3, max: 0.6 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "FE", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Adequado", min: 80, max: 300 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CU", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Adequado", min: 6, max: 30 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "ZN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Adequado", min: 50, max: 100 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Adequado", min: 100, max: 800 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "B", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Adequado", min: 50, max: 100 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
];

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Frutíferas, NOGUEIRA-PECÃ (6.5.12)`;

async function main() {
  const cropProfileId = await ensureCropProfile("NOGUEIRA_PECA", "Nogueira-pecã", "FRUTIFERA");
  console.log(`NOGUEIRA_PECA: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL, ...FOLIAR_NOGUEIRA_PECA]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — adubação de pré-plantio`, PRE_PLANTIO_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K de crescimento e manutenção + adubação foliar condicional`, NPK_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — diagnose foliar`, DIAGNOSE_FOLIAR_CONTENT);

  console.log("NOTA: classificação de SOLO e de FOLHA (Tabela 6.5.13, faixa única) automatizadas no motor -- dose de manutenção e a regra de adubação foliar condicional continuam só como texto.");
}

main().finally(() => pool.end());
