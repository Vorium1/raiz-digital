import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * AMOREIRA-PRETA (Rubus spp., amora-preta/blackberry) -- capítulo 6.5.3 do
 * Manual CQFS-RS/SC 2016. Mesmo padrão: solo via Grupo 2 (S_GERAL, NÃO
 * S_GRUPO_EXIGENTE -- o texto do manual diz que a cultura "é exigente em
 * enxofre" como recomendação de FONTE de N a preferir, não uma mudança do
 * teor crítico de S no solo; a lista oficial do grupo mais exigente
 * permanece só arroz irrigado/leguminosas/brássicas/liliáceas, conferido
 * contra a Tabela 6.11), diagnose foliar (Tabela 6.5.4) automatizada.
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

const PRE_PLANTIO_CONTENT = `ADUBAÇÃO DE PRÉ-PLANTIO (Tabela 6.5.1, compartilhada por todas as frutíferas): mesma tabela de P2O5/K2O por classe de fertilidade do solo -- Muito baixo 250+150, Baixo 170+90, Médio 130+60, Alto 90+30, Muito alto 0+0 (kg P2O5/ha + kg K2O/ha). Específico pra amoreira-preta: em solos com MO<2,5%, aplicar também 40 kg/ha de N (pode usar resíduo orgânico -- cama de aves, dejeto suíno/bovino -- calculado conforme capítulo 9 do manual).`;

const NPK_CONTENT = `ADUBAÇÃO DE CRESCIMENTO: não há necessidade separada -- amoreira-preta já inicia produção no 2º ano após plantio, então cai direto na adubação de manutenção.

ADUBAÇÃO DE MANUTENÇÃO -- NITROGÊNIO, estrutura mais complexa que a maioria: cruza teor de matéria orgânica do solo × ano após plantio × produtividade esperada (t/ha, só a partir do 2º ano) × mais uma dose fixa pós-colheita:
1º ano (ano de plantio): NÃO aplicar N.
2º ano -- MO 0-2,5%: produtividade ≤10t/ha=80, >10t/ha=120 kg N/ha. MO 2,6-5,0%: 64/96. MO>5,0%: 51/77.
A partir do 3º ano -- MO 0-2,5%: ≤10t/ha=113, >10t/ha=147. MO 2,6-5,0%: 91/117. MO>5,0%: 73/94.
Após CADA colheita (dose fixa, todo ano a partir do 2º): MO 0-2,5%=100, MO 2,6-5,0%=67, MO>5,0%=33 kg N/ha.
Parcelar em até 4 vezes: 1ª no início da brotação, 2ª 30 dias depois, 3ª 60 dias depois, 4ª após a colheita.
Fonte de N preferencial: sulfato de amônio (a cultura é exigente em enxofre) -- MAS uso repetido de sulfato de amônio em safras consecutivas reduz sensivelmente o pH do solo, então monitorar pH ao longo dos anos. Aplicar na superfície do solo, ao longo da fila de plantio, ~15cm do caule.

FÓSFORO E POTÁSSIO -- por classe de solo × produtividade esperada (tabela própria, não a genérica de pré-plantio):
Muito baixo: P (≤10t/ha=82, 10-15t/ha=120, >15t/ha=159 kg P2O5/ha); K (≤10t/ha=170, 10-15t/ha=247, >15t/ha=323 kg K2O/ha).
Baixo: P (68/100/132); K (142/206/269).
Médio: P (57/84/110); K (118/171/224).
Alto: P (47/70/92); K (99/143/187).
Muito alto: P (40/58/77); K (82/119/156).
P em uma única vez (início da brotação). K parcelado em até 3 vezes (início da brotação, +30 dias, +60 dias). Aplicar na superfície, ao longo da fila, ~15cm do caule.`;

const DIAGNOSE_FOLIAR_CONTENT = `DIAGNOSE FOLIAR DA AMOREIRA-PRETA (Tabela 6.5.4) -- coletar a 6ª folha totalmente expandida a partir do ápice, com pedicelo, dos ramos emitidos no ano anterior; ~80-100 folhas da mesma cultivar, na 2ª quinzena de janeiro. Automatizada no motor (sampleType="FOLIAR").

Macronutrientes (%) -- N: Insuficiente<1,75 / Normal 2,20-3,00 / Excessivo>3,50. P: Insuficiente<0,20 / Normal 0,25-0,45 / Excessivo>0,65. K: Insuficiente<1,00 / Normal 1,25-3,00 / Excessivo>4,00. Ca: Insuficiente<0,50 / Normal 0,60-2,50 / Excessivo>3,00. Mg: Insuficiente<0,25 / Normal 0,30-1,00 / Excessivo>2,00.
Micronutrientes (mg/kg) -- Fe: Insuficiente<30 / Normal 50-150 / Excessivo>250. Cu: Insuficiente<3 / Normal 6,0-25 / Excessivo>100. Zn: Insuficiente<12 / Normal 15-50 / Excessivo>300. Mn: Insuficiente<20 / Normal 50-300 / Excessivo>1000. B: Insuficiente<25 / Normal 30-80 / Excessivo>100.`;

const FOLIAR_SOURCE = `Fonte: ${SOURCE_2016}, Tabela 6.5.4, p.199 -- classes de valores pra folha de amoreira-preta. Verificado contra o PDF oficial reextraído com \`pdftotext -table\` em 2026-09-04.`;

/** Tabela 6.5.4 -- folha de amoreira-preta. Sem profundidade (tecido, não solo). */
const FOLIAR_AMOREIRA_PRETA = [
  { parameterCode: "N", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 1.75 }, { label: "Normal", min: 2.2, max: 3.0 }, { label: "Excessivo", min: 3.5 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "P", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.2 }, { label: "Normal", min: 0.25, max: 0.45 }, { label: "Excessivo", min: 0.65 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "K", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 1.0 }, { label: "Normal", min: 1.25, max: 3.0 }, { label: "Excessivo", min: 4.0 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CA", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.5 }, { label: "Normal", min: 0.6, max: 2.5 }, { label: "Excessivo", min: 3.0 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MG", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.25 }, { label: "Normal", min: 0.3, max: 1.0 }, { label: "Excessivo", min: 2.0 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "FE", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 30 }, { label: "Normal", min: 50, max: 150 }, { label: "Excessivo", min: 250 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CU", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 3 }, { label: "Normal", min: 6.0, max: 25 }, { label: "Excessivo", min: 100 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "ZN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 12 }, { label: "Normal", min: 15, max: 50 }, { label: "Excessivo", min: 300 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 20 }, { label: "Normal", min: 50, max: 300 }, { label: "Excessivo", min: 1000 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "B", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 25 }, { label: "Normal", min: 30, max: 80 }, { label: "Excessivo", min: 100 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
];

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Frutíferas, AMOREIRA-PRETA (6.5.3)`;

async function main() {
  const cropProfileId = await ensureCropProfile("AMOREIRA_PRETA", "Amoreira-preta", "FRUTIFERA");
  console.log(`AMOREIRA_PRETA: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL, ...FOLIAR_AMOREIRA_PRETA]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — adubação de pré-plantio`, PRE_PLANTIO_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K de manutenção`, NPK_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — diagnose foliar`, DIAGNOSE_FOLIAR_CONTENT);

  console.log("NOTA: classificação de SOLO e de FOLHA (Tabela 6.5.4) automatizadas no motor -- dose de manutenção continua só como texto.");
}

main().finally(() => pool.end());
