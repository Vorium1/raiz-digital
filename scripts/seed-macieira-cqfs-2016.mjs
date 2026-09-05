import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * MACIEIRA (Malus domestica) -- capítulo 6.5.8 do Manual CQFS-RS/SC 2016,
 * segunda frutífera carregada nesta base (depois de VIDEIRA), mesmo padrão:
 * classificação de SOLO automatizada (reaproveita Grupo 2, já testado),
 * diagnose foliar e doses ficam como technical_source em texto (mesma
 * pendência de schema já registrada pra videira: sample_type solo vs.
 * tecido). Conferido direto contra o PDF oficial, reextraído com
 * `pdftotext -table` (não `-layout` -- ver PROJECT_STATE.md pra histórico
 * de por que essa opção é obrigatória neste manual).
 *
 * RS é o maior produtor de maçã do Brasil -- economicamente mais relevante
 * pro público real da RAIZ do que a maioria das frutíferas do capítulo 6.5.
 *
 * ESTRUTURA MAIS COMPLEXA QUE VIDEIRA, registrar: a dose de manutenção de
 * macieira cruza TRÊS variáveis pro N (teor foliar × produtividade ×
 * crescimento de ramos em cm) e DUAS pro P e pro K, mas cada uma delas
 * cruzando um dado de FOLHA com um dado de SOLO ao mesmo tempo (P: teor
 * foliar × classe de P no solo; K: teor foliar × teor de K no solo em
 * mg/dm³, não por classe). Isso reforça que a decisão de schema pendente
 * (sample_type) não é um detalhe pequeno -- pra automatizar dose real de
 * macieira, o motor vai precisar combinar leitura de folha E de solo na
 * mesma regra, não só uma ou outra.
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

const PRE_PLANTIO_CONTENT = `ADUBAÇÃO DE PRÉ-PLANTIO (Tabela 6.5.1, compartilhada por TODAS as frutíferas do manual) -- mesma tabela de P2O5/K2O por classe de fertilidade do solo já usada pra videira: Muito baixo 250+150, Baixo 170+90, Médio 130+60, Alto 90+30, Muito alto 0+0 (kg P2O5/ha + kg K2O/ha). Específico pra macieira: adicionar também 3 a 5 kg/ha de boro E 6 a 10 kg/ha de zinco (videira só pede B, macieira pede B e Zn).`;

const NPK_CONTENT = `NITROGÊNIO -- ADUBAÇÃO DE CRESCIMENTO (mudas), por teor de matéria orgânica do solo e ano após o plantio (1º/2º/3º): MO<2,5%: 40/50/60 kg N/ha. MO 2,6-5,0%: 30/40/50. MO>5,0%: 15/25/30. Parcelar em 3 aplicações, a cada 45 dias, a partir do início da brotação.

NITROGÊNIO -- ADUBAÇÃO DE MANUTENÇÃO (pomar em produção), cruza teor de N na folha × produtividade (t/ha) × crescimento dos ramos emitidos no último ano (cm) -- estrutura de TRÊS variáveis, mais complexa que a de qualquer grão ou da videira:
Teor foliar de N <2,0% -- produtividade ≤50t/ha: ramos <15cm=50, 15-25cm=40, >25cm=30 kg N/ha. Produtividade >50t/ha: <15cm=35, 15-25cm=20, >25cm=15.
Teor foliar de N 2,0-2,5% -- produtividade ≤50t/ha: <15cm=30, 15-25cm=20, >25cm=0. Produtividade >50t/ha: <15cm=10, 15-25cm=0, >25cm=0.
NUNCA aplicar N se o teor foliar for maior que 2,5%. Em regiões mais frias com solos rasos (ex.: São Joaquim/SC) as quantidades podem ser aumentadas em 50%.
Aplicar 60-80% na primavera (inchamento das gemas, uma ou duas vezes) e 20-40% em pós-colheita -- maior percentual em pós-colheita em anos de alta produção ou clima desfavorável à absorção de N (seca ou excesso de chuva), pra aumentar reservas da planta; em pomares com excesso de vigor (principalmente anos de alternância de safra) a aplicação pós-colheita pode ser dispensada.

FÓSFORO -- ADUBAÇÃO DE MANUTENÇÃO, cruza teor de P na folha × classificação do teor de P no solo × produtividade (t/ha):
Teor foliar de P <0,15% -- solo Muito baixo/Baixo/Médio: produtividade <50t/ha=30, >50t/ha=50 kg P2O5/ha. Solo Alto/Muito alto: <50t/ha=20, >50t/ha=30.
Teor foliar de P ≥0,15% -- solo Muito baixo/Baixo/Médio: <50t/ha=0, >50t/ha=20. Solo Alto/Muito alto: <50t/ha=0, >50t/ha=0.
Pomares bem corrigidos com P na implantação têm baixa necessidade de fosfatado nos 10 anos seguintes.

POTÁSSIO -- ADUBAÇÃO DE MANUTENÇÃO, cruza teor de K na folha × teor de K no solo (mg/dm³, valor direto, não por classe):
Teor foliar de K <1,20% -- solo K<150mg/dm³: 100 kg K2O/ha (mais 2,5kg K2O por tonelada de fruto produzida acima de 50t/ha). Solo K 150-200: 60. Solo K>200: 40.
Teor foliar de K ≥1,20% -- solo K<150: 30. Solo K 150-200: 20. Solo K>200: 0.
P e K podem ser aplicados de uma única vez, no inverno ou junto com a primeira aplicação anual de N. Fertilizantes aplicados na fila de plantio, sobre a superfície do solo, na área de projeção da copa.

PULVERIZAÇÕES FOLIARES COM CÁLCIO -- recomendadas mesmo com boa disponibilidade de Ca no solo, pra prevenir/minimizar distúrbios fisiológicos do fruto relacionados a deficiência de cálcio (ex.: bitter pit) e melhorar capacidade de armazenamento. Número de pulverizações varia com cultivar, histórico de distúrbio na área, situação nutricional, produção e crescimento das plantas e clima da safra. Geral: 5 a 10 pulverizações quinzenais de CaCl2 0,4 a 0,5%, a partir do final de outubro (outras fontes líquidas de cálcio servem, desde que a quantidade de nutriente seja equivalente e o preço seja compatível).`;

const DIAGNOSE_FOLIAR_CONTENT = `DIAGNOSE FOLIAR DA MACIEIRA (Tabela 6.5.9, adaptada de Suzuki & Basso et al., 2002) -- amostra de ~100 folhas completas da parte mediana das brotações emitidas na estação de crescimento, coletadas de 20 a 30 plantas representativas, no período de 15 de janeiro a 15 de fevereiro. Igual à videira, este é o método PRINCIPAL de avaliação nutricional da cultura e alimenta diretamente as tabelas de dose de manutenção acima. ATUALIZAÇÃO 2026-09-04: a classificação em si (não a dose 3D de manutenção, que continua só texto) agora está automatizada no motor (sampleType="FOLIAR").

Macronutrientes (%) -- N: Insuficiente<1,70 / Normal 2,0-2,5 / Excessivo>3,0. P: Insuficiente<0,10 / Normal 0,15-0,30 / sem faixa de excesso definida no manual. K: Insuficiente<0,80 / Normal 1,2-1,5 / Excessivo>2,0. Ca: Insuficiente<0,80 / Normal 1,1-1,7 / sem faixa de excesso definida. Mg: Insuficiente<0,20 / Normal 0,25-0,45 / sem faixa de excesso definida.
Micronutrientes (mg/kg) -- Fe: Insuficiente<20 / Normal 50-250 / sem faixa de excesso definida. Cu: Insuficiente<3 / Normal 5-30 / Excessivo>50. Zn: Insuficiente<15 / Normal 20-100 / sem faixa de excesso definida. Mn: Insuficiente<20 / Normal 30-130 / Excessivo>300. B: Insuficiente<20 / Normal 30-50 / Excessivo>140.`;

const FOLIAR_SOURCE = `Fonte: ${SOURCE_2016}, Tabela 6.5.9, p.209 -- adaptada de Suzuki & Basso et al. (2002), classes de valores pra folha completa de macieira (~100 folhas, parte mediana das brotações, 20-30 plantas, 15/jan a 15/fev). Verificado contra o PDF oficial reextraído com \`pdftotext -table\` em 2026-09-04. Alguns nutrientes não têm faixa "Excessivo" definida no manual (P, Ca, Mg, Fe, Zn) -- não inventada aqui, valor acima do "Normal" fica simplesmente sem faixa homologada, não "Excessivo" adivinhado.`;

/** Tabela 6.5.9 -- folha completa de macieira. Sem profundidade (tecido, não solo). */
const FOLIAR_MACIEIRA = [
  { parameterCode: "N", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 1.7 }, { label: "Normal", min: 2.0, max: 2.5 }, { label: "Excessivo", min: 3.0 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "P", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.1 }, { label: "Normal", min: 0.15, max: 0.3 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "K", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.8 }, { label: "Normal", min: 1.2, max: 1.5 }, { label: "Excessivo", min: 2.0 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CA", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.8 }, { label: "Normal", min: 1.1, max: 1.7 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MG", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.2 }, { label: "Normal", min: 0.25, max: 0.45 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "FE", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 20 }, { label: "Normal", min: 50, max: 250 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CU", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 3 }, { label: "Normal", min: 5, max: 30 }, { label: "Excessivo", min: 50 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "ZN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 15 }, { label: "Normal", min: 20, max: 100 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 20 }, { label: "Normal", min: 30, max: 130 }, { label: "Excessivo", min: 300 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "B", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 20 }, { label: "Normal", min: 30, max: 50 }, { label: "Excessivo", min: 140 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
];

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Frutíferas, MACIEIRA (6.5.8)`;

async function main() {
  const cropProfileId = await ensureCropProfile("MACIEIRA", "Macieira", "FRUTIFERA");
  console.log(`MACIEIRA: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL, ...FOLIAR_MACIEIRA]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — adubação de pré-plantio`, PRE_PLANTIO_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K de crescimento e manutenção`, NPK_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — diagnose foliar`, DIAGNOSE_FOLIAR_CONTENT);

  console.log("NOTA: classificação de SOLO e de FOLHA COMPLETA (Tabela 6.5.9) automatizadas no motor -- dose de manutenção (cruza folha x solo x produtividade) continua só como texto.");
}

main().finally(() => pool.end());
