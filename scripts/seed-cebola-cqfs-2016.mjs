import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * CEBOLA (Allium cepa) -- capítulo 6.3.9 do Manual CQFS-RS/SC 2016. Não
 * está em nenhuma lista oficial de Grupo 1 (P ou K) -- usa Grupo 2 pros
 * dois, confirmado.
 *
 * PRIMEIRA HORTALIÇA COM DIAGNOSE FOLIAR AUTOMATIZADA nesta base: o manual
 * traz uma tabela real de "faixa adequada" de nutriente na folha mais
 * jovem totalmente desenvolvida, na metade do ciclo (início da
 * bulbificação) -- mesmo padrão de faixa única "Adequado" já usado em
 * várias frutíferas (bananeira, morangueiro, etc.), agora numa hortaliça.
 * Valores macro convertidos de g/kg (unidade original do manual) pra %
 * (g/kg ÷ 10 = %) pra manter consistência com o resto da base -- conversão
 * de unidade, não de valor, documentada explicitamente na fonte.
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

const NPK_CONTENT = `NITROGÊNIO -- por teor de matéria orgânica do solo: MO≤2,5%=120 kg N/ha. MO 2,6-5,0%=100. MO>5,0%=≤80. Ajuste: +4kg N/ha por tonelada de bulbo esperado acima de 30t/ha.
Transplante: 15% no plantio + restante em 3 parcelas (25/35/25%) aos 35/60/85 dias após o transplante.
Semeadura direta: acrescentar 20% à dose da tabela; 20kg/ha na semeadura + restante em 4 parcelas aos 45/80/110/140 dias.
Plantio direto consolidado ou armazenamento longo: reduzir dose em até 25%.

FÓSFORO E POTÁSSIO -- dose por classe de disponibilidade no solo (Grupo 2 pros dois): Muito Baixo: P2O5=280, K2O=210 kg/ha. Baixo: 200/150. Médio: 160/120. Alto: 120/90. Muito Alto: ≤80/≤60. Ajuste: +3kg P2O5/ha e +3kg K2O/ha por tonelada de bulbo esperado acima de 30t/ha.
REGRA DE DISPENSA: se P e/ou K estiver 3x acima do teor crítico, não aplicar.
LIMITE: nunca mais que 60kg/ha de K2O na linha de semeadura/transplante. Doses média/alta: 50% do K a lanço no transplante/semeadura + restante em cobertura com o N (aos 60/85 dias pós-transplante ou 110/140 dias pós-semeadura direta).

ENXOFRE -- em solo arenoso/pobre em MO ou área com histórico de cultivo intensivo de cebola (ou outra espécie exigente em S), aplicar 30 a 60 kg/ha de S (dose maior em solo arenoso/pobre em MO).

MICRONUTRIENTES -- Zinco: 3-4 kg/ha via solo no transplante/semeadura -- IMPORTANTE: a cultura responde a Zn mesmo em solo com teor >2mg/dm³ (achado real, Kurtz & Ernani, 2010), com efeito residual de pelo menos 2 anos. Boro: 1,5-2 kg/ha via solo a cada cultivo. Manganês: em área deficiente, 2-4 pulverizações foliares de sulfato de manganês 1%. Alternativa foliar geral pra Zn/B/Mn: sulfato de zinco 0,5% + ácido bórico (ou bórax) 0,25% + sulfato de manganês 1%, 2-4 aplicações em intervalos de 1-2 semanas.`;

const DIAGNOSE_FOLIAR_CONTENT = `DIAGNOSE FOLIAR DA CEBOLA -- faixa "adequada" por nutriente na folha mais jovem totalmente desenvolvida, coletada na metade do ciclo (início da bulbificação), de pelo menos 20 plantas. Automatizada no motor (sampleType="FOLIAR") -- primeira hortaliça desta base com diagnose foliar estruturada.

Macronutrientes (originalmente em g/kg no manual, convertido pra % dividindo por 10) -- N: 2,5-4,0%. P: 0,2-0,4%. K: 2,0-5,0%. Ca: 0,7-3,0%. Mg: 0,2-0,4%. S: 0,5-0,8%.
Micronutrientes (mg/kg) -- Fe: 60-300. Cu: 6-20. Zn: 10-50. B: 10-50. Mn: 30-200.

Tabela também traz dados de extração/exportação de nutrientes por tonelada produzida (não é classificação, é referência de balanço de nutrientes) -- registrado aqui como contexto, não carregado como parâmetro classificável: Extração (kg/t, planta inteira): N=2,7 P=0,9 K=2,3 Ca=1,3 Mg=0,3 S=0,5 | Fe=20,4 Cu=0,9 Zn=2,3 B=5,9 Mn=4,0 (g/t). Exportação (kg/t, só bulbo): N=1,6 P=0,6 K=1,2 Ca=0,5 Mg=0,2 S=0,3 | Fe=7,7 Cu=0,6 Zn=1,7 Mn=4,2 (g/t) -- nota do manual: geralmente a planta inteira é retirada na colheita, não só o bulbo, então na prática tudo que a planta extrai é exportado.`;

const FOLIAR_SOURCE = `Fonte: ${SOURCE_2016}, capítulo Hortaliças, CEBOLA (6.3.9), tabela "Extração, exportação e faixa adequada de nutrientes em cebola" -- faixa adequada = teor de nutriente na folha mais jovem totalmente desenvolvida na metade do ciclo (início da bulbificação), amostra de pelo menos 20 plantas. Verificado contra o PDF oficial reextraído com \`pdftotext -table\` em 2026-09-05. Valores macro originais em g/kg, convertidos pra % (÷10) nesta base.`;

/** Faixa adequada de cebola. Sem profundidade (tecido, não solo). */
const FOLIAR_CEBOLA = [
  { parameterCode: "N", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Adequado", min: 2.5, max: 4.0 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "P", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Adequado", min: 0.2, max: 0.4 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "K", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Adequado", min: 2.0, max: 5.0 }], criticality: "ALTA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CA", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Adequado", min: 0.7, max: 3.0 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MG", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Adequado", min: 0.2, max: 0.4 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "S", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Adequado", min: 0.5, max: 0.8 }], criticality: "MEDIA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "FE", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Adequado", min: 60, max: 300 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "CU", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Adequado", min: 6, max: 20 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "ZN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Adequado", min: 10, max: 50 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "B", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Adequado", min: 10, max: 50 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
  { parameterCode: "MN", parameterCategory: "QUIMICO", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Adequado", min: 30, max: 200 }], criticality: "BAIXA", technicalNotes: FOLIAR_SOURCE },
];

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Hortaliças, CEBOLA (6.3.9)`;

async function main() {
  const cropProfileId = await ensureCropProfile("CEBOLA", "Cebola", "HORTALICA");
  console.log(`CEBOLA: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL, ...FOLIAR_CEBOLA]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K/S e micronutrientes`, NPK_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — diagnose foliar e extração/exportação de nutrientes`, DIAGNOSE_FOLIAR_CONTENT);

  console.log("NOTA: classificação de SOLO e de FOLHA automatizadas no motor -- primeira hortaliça com diagnose foliar estruturada nesta base. Dose continua só como texto.");
}

main().finally(() => pool.end());
