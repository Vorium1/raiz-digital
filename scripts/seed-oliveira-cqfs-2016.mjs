import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * OLIVEIRA (Olea europaea) -- capítulo 6.5.13 do Manual CQFS-RS/SC 2016.
 * Mesmo padrão: solo via Grupo 2, diagnose foliar (Tabela 6.5.14, adaptada
 * de Freeman et al., 2005) automatizada -- COM RESSALVA REAL IMPORTANTE.
 *
 * A Tabela 6.5.14 é a mais incompleta desta base: muitas células vêm "-"
 * (sem valor definido) no próprio manual -- não omissão nossa. Além disso,
 * duas células (K e Mg, faixa "Normal") têm notação ambígua no PDF
 * reextraído: aparece como ">0,8-1,2" e ">0,1-0,3" -- um "maior que" colado
 * com uma faixa, inconsistente com Ca/Mn que aparecem só como "maior que"
 * puro (">1,0", ">20"). Decisão tomada aqui: tratei o "> " como ruído de
 * OCR/formatação de célula (mesmo padrão de coluna que originou os bugs de
 * alinhamento já documentados neste projeto) e carreguei a faixa numérica
 * (0,8-1,2 e 0,1-0,3) como está -- MAS isso precisa ser conferido contra o
 * artigo original (Freeman et al., 2005) antes de qualquer homologação,
 * registrado explicitamente na fonte de cada parâmetro afetado.
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

const PRE_PLANTIO_CONTENT = `ADUBAÇÃO DE PRÉ-PLANTIO (Tabela 6.5.1, compartilhada por todas as frutíferas): mesma tabela de P2O5/K2O por classe de fertilidade do solo -- Muito baixo 250+150, Baixo 170+90, Médio 130+60, Alto 90+30, Muito alto 0+0 (kg P2O5/ha + kg K2O/ha). Específico pra oliveira: adicionar 2 a 4 kg/ha de B.`;

const NPK_CONTENT = `NITROGÊNIO -- ADUBAÇÃO DE CRESCIMENTO, por teor de matéria orgânica do solo e ano após o plantio (1º/2º/3º/4º): MO<2,5%: 40/50/60/80 kg N/ha. MO 2,6-5,0%: 30/35/40/50. MO>5,0%: 20/25/30/40. Parcelar em 3 vezes a cada 45 dias, a partir do final do inverno. Preferir adubo orgânico em substituição ao mineral quando disponível (capítulo 9 do manual).

ADUBAÇÃO DE MANUTENÇÃO -- oliveira inicia alguma produção no 3º ano, mas manutenção de verdade começa a partir do 4º ano, baseada na produtividade esperada: por tonelada de fruto, 16 kg N + 4,0 kg P2O5/ha + 20 kg K2O/ha. Ajustar em anos de falta/excesso de chuva, usando análise de solo E de folha como subsídio. P e K aplicados junto com a 1ª parcela de N, em uma única vez. N parcelado em 2 vezes: início da floração (primeiros racimos florais) + ~40 dias depois (endurecimento do caroço da azeitona). Aplicar na área de projeção da copa.`;

const DIAGNOSE_FOLIAR_CONTENT = `DIAGNOSE FOLIAR DA OLIVEIRA (Tabela 6.5.14, adaptada de Freeman et al., 2005) -- a tabela MAIS INCOMPLETA desta base: o próprio manual não define várias faixas (muitas células "-"), então vários nutrientes ficam SEM classificação de Insuficiente ou sem teto de Excessivo -- não é omissão nossa. Coletar folhas completas (limbo+pecíolo), parte média dos ramos emitidos no ano, diferentes lados da planta, durante janeiro; ~100 folhas. Automatizada no motor (sampleType="FOLIAR") só onde há faixa real definida.

Macronutrientes (%) -- N: Insuficiente<1,4 / Normal 1,5-2,0 (sem Excessivo definido). P: Normal 0,10-0,30 (sem Insuficiente nem Excessivo definidos). K: Insuficiente<0,4 / Normal 0,8-1,2 (ver ressalva de notação no script de seed -- conferir contra Freeman et al. 2005 antes de homologar). Ca: Normal >1,0, sem teto (sem Insuficiente definido). Mg: Normal 0,1-0,3 (ver mesma ressalva de notação do K).
Micronutrientes (mg/kg) -- Cu: Normal >5, sem teto (sem Insuficiente definido). Mn: Normal >20, sem teto (sem Insuficiente definido). B: Insuficiente<14 / Normal 19-150. Fe e Zn: SEM NENHUMA faixa definida pelo manual pra esta cultura -- não carregados (não inventar).`;

const FOLIAR_SOURCE_K_MG = `Fonte: ${SOURCE_2016}, Tabela 6.5.14, p.219 (adaptada de Freeman et al., 2005). RESSALVA DE NOTAÇÃO: a célula "Normal" no PDF reextraído aparece como "> [faixa]" (ex.: ">0,8-1,2"), notação ambígua e inconsistente com outras células da mesma tabela que só têm "> valor" sem faixa (Ca, Mn). Tratei o ">" como ruído e carreguei a faixa numérica como está -- CONFERIR CONTRA O ARTIGO ORIGINAL (Freeman et al., 2005) antes de homologar este parâmetro especificamente.`;

const FOLIAR_SOURCE = `Fonte: ${SOURCE_2016}, Tabela 6.5.14, p.219 (adaptada de Freeman et al., 2005). Verificado contra o PDF oficial reextraído com \`pdftotext -table\` em 2026-09-04 -- tabela real e legítima, mas com muitas faixas não definidas pelo manual (não omissão nossa).`;

/** Tabela 6.5.14 -- folha de oliveira. Muitas faixas incompletas, respeitadas como estão. Sem profundidade (tecido). */
const FOLIAR_OLIVEIRA = [
  { parameterCode: "N", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 1.4 }, { label: "Normal", min: 1.5, max: 2.0 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "P", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Normal", min: 0.1, max: 0.3 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "K", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.4 }, { label: "Normal", min: 0.8, max: 1.2 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE_K_MG },
  { parameterCode: "CA", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Normal", min: 1.0 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MG", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Normal", min: 0.1, max: 0.3 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE_K_MG },
  { parameterCode: "CU", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Normal", min: 5 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Normal", min: 20 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "B", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 14 }, { label: "Normal", min: 19, max: 150 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
];

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Frutíferas, OLIVEIRA (6.5.13)`;

async function main() {
  const cropProfileId = await ensureCropProfile("OLIVEIRA", "Oliveira", "FRUTIFERA");
  console.log(`OLIVEIRA: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL, ...FOLIAR_OLIVEIRA]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — adubação de pré-plantio`, PRE_PLANTIO_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K de crescimento e manutenção`, NPK_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — diagnose foliar`, DIAGNOSE_FOLIAR_CONTENT);

  console.log("NOTA: classificação de SOLO e de FOLHA (Tabela 6.5.14, com lacunas reais do manual) automatizadas no motor -- K e Mg têm ressalva de notação ambígua, conferir antes de homologar. Dose de manutenção continua só como texto.");
}

main().finally(() => pool.end());
