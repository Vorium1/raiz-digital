import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * CITROS (Citrus spp.) -- capítulo 6.5.6 do Manual CQFS-RS/SC 2016, terceira
 * frutífera carregada nesta base (depois de VIDEIRA e MACIEIRA), mesmo
 * padrão: classificação de SOLO automatizada (reaproveita Grupo 2, já
 * testado), doses e diagnose foliar ficam como technical_source em texto
 * (mesma pendência de schema: sample_type solo vs. tecido). Conferido
 * direto contra o PDF oficial, reextraído com `pdftotext -table`.
 *
 * Estrutura de dose mais simples que macieira (sem cruzamento folha×solo
 * na manutenção -- é direto por kg de nutriente/tonelada de fruto colhida),
 * mais parecida com o padrão já visto em quivizeiro/videira.
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
     VALUES ($1, $2, 'DRAFT', $3, 'Catálogo de cultura criado automaticamente. Faixas de suficiência de solo aguardando homologação técnica; diagnose foliar ainda não automatizada no motor (ver nota no script de seed).')
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

const PRE_PLANTIO_CONTENT = `ADUBAÇÃO DE PRÉ-PLANTIO (Tabela 6.5.1, compartilhada por todas as frutíferas): mesma tabela de P2O5/K2O por classe de fertilidade do solo já usada pras outras frutíferas -- Muito baixo 250+150, Baixo 170+90, Médio 130+60, Alto 90+30, Muito alto 0+0 (kg P2O5/ha + kg K2O/ha).`;

const NPK_CONTENT = `NITROGÊNIO -- ADUBAÇÃO DE CRESCIMENTO (mudas), por teor de matéria orgânica do solo e ano após o plantio (1º/2º/3º/4º -- citros é a única frutífera desta base com tabela de 4 anos, não 2 ou 3): MO<2,5%: 45/75/110/155 kg N/ha. MO 2,6-5,0%: 30/50/75/110. MO>5,0%: 30/30/30/30. Parcelar em 3 a 4 aplicações a partir do início da primavera. Aplicar ao longo da fila de plantio, na área de projeção da copa, afastado do tronco pelo menos 30cm.

ADUBAÇÃO DE MANUTENÇÃO (pomar em produção) -- mais simples que macieira, direto por tonelada de fruto estimada a colher, sem cruzar com classe foliar: 3,0 a 4,0 kg N/ha/ano + 1,0 kg P2O5/ha/ano + 3,0 a 4,0 kg K2O/ha/ano por tonelada estimada de fruto. N parcelado em 3 vezes, primeira aplicação no início do florescimento (primavera). P e K em uma única vez, no inverno ou junto com a primeira aplicação anual de N. EXCEÇÃO IMPORTANTE: em pomares adubados com P em pré-plantio cujas folhas tenham mais que 0,12% de P (ver diagnose foliar), não há necessidade de adubação de manutenção com fósforo -- citros é a única frutífera desta base com essa regra explícita de dispensa de P por critério foliar.
Excesso de N pode induzir baixa frutificação e queda de frutos -- em pomares com plantas muito vigorosas, reduzir ou suprimir a adubação nitrogenada.`;

const DIAGNOSE_FOLIAR_CONTENT = `DIAGNOSE FOLIAR DO CITROS (Tabela 6.5.7) -- coletar folhas com 6 meses de idade, de ramos frutíferos emitidos nas brotações primaveris, entre janeiro e março; 100 a 200 folhas, a ~1,5m do solo, nos quatro quadrantes da copa. ATUALIZAÇÃO 2026-09-04: a classificação agora está automatizada no motor (sampleType="FOLIAR") -- pra citros essa tabela é especialmente importante porque decide diretamente se a adubação de manutenção com P é dispensada (ver nota acima), embora essa regra de dispensa em si (condicional, "se P então pule esta etapa") ainda não esteja automatizada, só a classificação do teor.

Macronutrientes (%) -- N: Baixo<2,3 / Adequado 2,3-2,7 / Excessivo>3,0. P: Baixo<0,12 / Adequado 0,12-0,16 / Excessivo>0,20. K: Baixo<1,0 / Adequado 1,0-1,5 / Excessivo>2,0. Ca: Baixo<3,5 / Adequado 3,5-4,5 / Excessivo>5,0. Mg: Baixo<0,3 / Adequado 0,3-0,4 / Excessivo>0,5.
Micronutrientes (mg/kg) -- Fe: Baixo<49 / Adequado 50-120 / Excessivo>200. Cu: Baixo<4,0 / Adequado 4,1-10,0 / Excessivo>15. Zn: Baixo<34 / Adequado 35-50 / Excessivo>100. Mn: Baixo<34 / Adequado 35-50 / Excessivo>100. B: Baixo<50 / Adequado 50-100 / Excessivo>150.`;

const FOLIAR_SOURCE = `Fonte: ${SOURCE_2016}, Tabela 6.5.7, p.204 -- classes de valores pra folha de citros (folhas com 6 meses, ramos frutíferos das brotações primaveris, jan-mar, 100-200 folhas, ~1,5m do solo, 4 quadrantes da copa). Verificado contra o PDF oficial reextraído com \`pdftotext -table\` em 2026-09-04. Labels do próprio manual (Baixo/Adequado/Excessivo), preservados como estão -- não normalizados pra "Insuficiente/Normal".`;

/** Tabela 6.5.7 -- folha de citros. Sem profundidade (tecido, não solo). */
const FOLIAR_CITROS = [
  { parameterCode: "N", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Baixo", max: 2.3 }, { label: "Adequado", min: 2.3, max: 2.7 }, { label: "Excessivo", min: 3.0 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "P", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Baixo", max: 0.12 }, { label: "Adequado", min: 0.12, max: 0.16 }, { label: "Excessivo", min: 0.2 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "K", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Baixo", max: 1.0 }, { label: "Adequado", min: 1.0, max: 1.5 }, { label: "Excessivo", min: 2.0 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CA", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Baixo", max: 3.5 }, { label: "Adequado", min: 3.5, max: 4.5 }, { label: "Excessivo", min: 5.0 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MG", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Baixo", max: 0.3 }, { label: "Adequado", min: 0.3, max: 0.4 }, { label: "Excessivo", min: 0.5 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "FE", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Baixo", max: 49 }, { label: "Adequado", min: 50, max: 120 }, { label: "Excessivo", min: 200 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CU", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Baixo", max: 4.0 }, { label: "Adequado", min: 4.1, max: 10.0 }, { label: "Excessivo", min: 15 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "ZN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Baixo", max: 34 }, { label: "Adequado", min: 35, max: 50 }, { label: "Excessivo", min: 100 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Baixo", max: 34 }, { label: "Adequado", min: 35, max: 50 }, { label: "Excessivo", min: 100 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "B", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Baixo", max: 50 }, { label: "Adequado", min: 50, max: 100 }, { label: "Excessivo", min: 150 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
];

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Frutíferas, CITROS (6.5.6)`;

async function main() {
  const cropProfileId = await ensureCropProfile("CITROS", "Citros", "FRUTIFERA");
  console.log(`CITROS: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL, ...FOLIAR_CITROS]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — adubação de pré-plantio`, PRE_PLANTIO_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K de crescimento e manutenção`, NPK_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — diagnose foliar`, DIAGNOSE_FOLIAR_CONTENT);

  console.log("NOTA: classificação de SOLO e de FOLHA (Tabela 6.5.7) automatizadas no motor -- dose de manutenção e a regra de dispensa de P por critério foliar continuam só como texto.");
}

main().finally(() => pool.end());
