import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * ABACATEIRO (Persea americana) -- capítulo 6.5.1 do Manual CQFS-RS/SC 2016.
 * Mesmo padrão de baixo risco das outras frutíferas: solo automatizado via
 * Grupo 2, diagnose foliar (Tabela 6.5.2) automatizada desde o início (não
 * como pendência -- já aprendemos o padrão com videira/macieira/citros/
 * pessegueiro/morangueiro), dose de manutenção como texto (padrão simples,
 * direto por tonelada de fruto, sem cruzar com classe foliar -- igual
 * citros/quivizeiro). Conferido direto contra o PDF oficial reextraído com
 * `pdftotext -table`.
 *
 * PRIMEIRA CULTURA COM MOLIBDÊNIO (Mo) na diagnose foliar -- micronutriente
 * que nenhuma outra cultura desta base classificou até agora.
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

const PRE_PLANTIO_CONTENT = `ADUBAÇÃO EM PRÉ-PLANTIO (Tabela 6.5.1, compartilhada por todas as frutíferas): mesma tabela de P2O5/K2O por classe de fertilidade do solo -- Muito baixo 250+150, Baixo 170+90, Médio 130+60, Alto 90+30, Muito alto 0+0 (kg P2O5/ha + kg K2O/ha). Específico pra abacateiro: adicionar 2 a 3 kg/ha de B. Devido ao grande espaçamento entre filas, aplicar numa faixa de ~2,0m ao longo da fila (não a lanço em toda a área).`;

const NPK_CONTENT = `NITROGÊNIO -- ADUBAÇÃO DE CRESCIMENTO (mudas), por teor de matéria orgânica do solo e ano após o plantio (1º/2º/3º/4º): MO<2,5%: 30/40/50/60 kg N/ha. MO 2,6-5,0%: 15/30/40/50. MO>5,0%: ≤15/≤20/≤30/≤40. Parcelar em 3 vezes, preferencialmente agosto/setembro, novembro/dezembro e fevereiro. NÃO aplicar N após fevereiro em regiões sujeitas a geada de outono.

ADUBAÇÃO DE MANUTENÇÃO (pomar em produção) -- direto por tonelada de fruto estimada a colher, sem cruzar com classe foliar (padrão simples, igual citros): 3,0 a 4,0 kg N/ha/ano + 1,0 kg P2O5/ha/ano + 4,0 a 5,0 kg K2O/ha/ano por tonelada estimada de fruto. N parcelado em 3 vezes, primeira aplicação no início da primavera. P e K em uma única vez, no final do inverno ou junto com a primeira aplicação anual de N. Fertilizantes aplicados ao longo da fila de plantio, na área de projeção da copa.`;

const FOLIAR_SOURCE = `Fonte: ${SOURCE_2016}, Tabela 6.5.2, p.194 -- classes de valores pra folha de abacateiro (folhas completas, 5-7 meses, brotações primaveris, jan-mar, 4-6 folhas/árvore, 10-15 árvores, 1,5-2,0m do solo, 4 quadrantes; coletar a cada 3 anos). Verificado contra o PDF oficial reextraído com \`pdftotext -table\` em 2026-09-04. Primeira cultura desta base com faixa de molibdênio na diagnose foliar -- gravado como parameter_code "MOLIBDENIO" (não "MO"), de propósito: "MO" já é o código usado nesta base pra matéria orgânica do solo, usar o símbolo químico "Mo" aqui criaria ambiguidade real de leitura mesmo com sample_type diferente.`;

/** Tabela 6.5.2 -- folha de abacateiro. Sem profundidade (tecido, não solo). */
const FOLIAR_ABACATEIRO = [
  { parameterCode: "N", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 1.5 }, { label: "Normal", min: 1.6, max: 2.0 }, { label: "Excessivo", min: 3.0 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "P", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.1 }, { label: "Normal", min: 0.1, max: 0.3 }, { label: "Excessivo", min: 0.4 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "K", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.8 }, { label: "Normal", min: 0.8, max: 2.0 }, { label: "Excessivo", min: 3.0 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CA", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 1.0 }, { label: "Normal", min: 1.0, max: 3.0 }, { label: "Excessivo", min: 5.0 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MG", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.3 }, { label: "Normal", min: 0.2, max: 0.8 }, { label: "Excessivo", min: 1.0 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "S", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.2 }, { label: "Normal", min: 0.2, max: 0.6 }, { label: "Excessivo", min: 0.8 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "FE", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 35 }, { label: "Normal", min: 50, max: 200 }, { label: "Excessivo", min: 300 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CU", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 4 }, { label: "Normal", min: 4, max: 20 }, { label: "Excessivo", min: 30 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "ZN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 40 }, { label: "Normal", min: 30, max: 100 }, { label: "Excessivo", min: 200 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 30 }, { label: "Normal", min: 30, max: 250 }, { label: "Excessivo", min: 300 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "B", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 25 }, { label: "Normal", min: 40, max: 80 }, { label: "Excessivo", min: 100 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MOLIBDENIO", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 0.1 }, { label: "Normal", min: 0.05, max: 0.1 }, { label: "Excessivo", min: 0.2 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
];

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Frutíferas, ABACATEIRO (6.5.1)`;

async function main() {
  const cropProfileId = await ensureCropProfile("ABACATEIRO", "Abacateiro", "FRUTIFERA");
  console.log(`ABACATEIRO: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL, ...FOLIAR_ABACATEIRO]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — adubação de pré-plantio`, PRE_PLANTIO_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K de crescimento e manutenção`, NPK_CONTENT);

  console.log("NOTA: classificação de SOLO e de FOLHA (Tabela 6.5.2) automatizadas no motor -- dose de manutenção continua só como texto.");
}

main().finally(() => pool.end());
