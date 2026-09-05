import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * VIDEIRA (Vitis spp.) -- primeira cultura perene/frutífera carregada nesta
 * base, capítulo 6.5.18 do Manual CQFS-RS/SC 2016, conferido direto contra
 * o PDF oficial (re-extraído com `pdftotext -table`, que resolveu problemas
 * de alinhamento de coluna que a extração original com `-layout` tinha
 * apresentado -- ver nota no PROJECT_STATE.md sobre a Tabela 5.2 de calagem,
 * mesmo problema, resolvido aqui pra este capítulo específico).
 *
 * ATUALIZAÇÃO (2026-09-04): o diretor decidiu explicitamente que a RAIZ deve
 * ter "tipo de amostra" (sample_type) como dimensão de primeira classe --
 * migration 022 e o motor (`agronomic-engine.ts`) já suportam isso. Como
 * prova de conceito real (não só a peça de infraestrutura), a classificação
 * de PECÍOLO (Tabela 6.5.18) foi convertida de texto (technical_source) pra
 * `crop_profile_parameters` estruturado de verdade, sampleType="PECIOLO" --
 * é a primeira classificação por tecido (não solo) automatizada nesta base.
 * A tabela de FOLHA COMPLETA (6.5.19) e as tabelas de dose (N/P/K de
 * manutenção indexadas pela classificação foliar × produtividade) continuam
 * só como texto por enquanto -- fica pra uma próxima rodada, cultura por
 * cultura, não é limitação técnica, é só ainda não ter sido feito.
 *
 * CLASSIFICAÇÃO DE SOLO (P/K/Ca/Mg/MO/B/Cu/Zn/Mn/S) -- reaproveitada, NÃO
 * inventada: o manual confirma explicitamente (Tabela 6.2 e Tabela 6.7,
 * capítulo 6) que frutíferas estão no MESMO "Grupo 2" de exigência de P e
 * de K que as culturas de grãos já carregadas (P_GRUPO2/K_GRUPO2, já
 * testado/verificado nesta base) -- e no grupo "geral" de enxofre (S_GERAL,
 * >5mg/dm³), não no grupo mais exigente (esse é só arroz irrigado,
 * leguminosas, brássicas e liliáceas). Ca/Mg/MO/micronutrientes usam as
 * mesmas tabelas gerais (SOLO_GERAL) de todas as outras culturas.
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

const PRE_PLANTIO_CONTENT = `ADUBAÇÃO DE PRÉ-PLANTIO (Tabela 6.5.1, compartilhada por TODAS as frutíferas do manual) -- doses de P2O5 e K2O aplicadas uma única vez, incorporadas, conforme a classe de fertilidade do solo (mesma classificação Muito Baixo/Baixo/Médio/Alto/Muito Alto já usada pra grãos, capítulo 6): Muito baixo: 250 kg P2O5/ha + 150 kg K2O/ha. Baixo: 170 + 90. Médio: 130 + 60. Alto: 90 + 30. Muito alto: não aplicar (0 + 0). Doses podem ser ajustadas pelo técnico responsável conforme tipo de solo, espécie e sistema de produção. Específico pra videira: aplicar também 3 a 5 kg/ha de B em pré-plantio.`;

const NPK_CONTENT = `NITROGÊNIO -- ADUBAÇÃO DE CRESCIMENTO (mudas, antes do início de produção significativa), por teor de matéria orgânica do solo e ano após o plantio (1º ano = ano de plantio do porta-enxerto; pra muda enxertada, contar a partir do 2º ano):
Uva para vinho -- MO<2,5%: 30/40/50 kg N/ha (1º/2º/3º ano). MO 2,6-5,0%: 20/20/30. MO>5,0%: ≤10/≤10/0.
Uva de mesa -- MO<2,5%: 50/60/70 kg N/ha. MO 2,6-5,0%: 30/30/40. MO>5,0%: ≤10/≤10/≤20.
Doses acima de 30kg/ha de N devem ser parceladas em duas vezes (início da brotação + 30 dias depois). Aplicar ao longo da fila de plantio, na área da projeção da copa, sem incorporação.

NITROGÊNIO -- ADUBAÇÃO DE MANUTENÇÃO (pomar em produção), por classificação do teor de N no tecido (folha completa ou pecíolo, ver tabelas de diagnose foliar) e produtividade esperada (t/ha):
Insuficiente -- >25t/ha: 40(vinho)/100(mesa) kg N/ha. 15-25t/ha: 30/70. 10-15t/ha: 15/40. <10t/ha: ≤10/20.
Normal -- >25t/ha: 30/50. 15-25t/ha: 20/30. 10-15t/ha: 10/20. <10t/ha: ≤10/≤15.
Excessivo -- qualquer produtividade: 0/0 (não aplicar).
Na ausência de análise de tecido, usar o teor de matéria orgânica do solo como proxy: MO<2,5%="Insuficiente", 2,6-5,0%="Normal", >5,0%="Excessivo". Aplicar em duas vezes (início da brotação + baga tamanho de chumbinho). Não ultrapassar a dose da tabela -- excesso de N aumenta suscetibilidade a doenças fúngicas foliares e, em uva de vinho, pode depreciar qualidade do mosto/vinho.

FÓSFORO E POTÁSSIO -- ADUBAÇÃO DE MANUTENÇÃO, por classificação do teor de P/K no tecido (folha ou pecíolo) e produtividade esperada (t/ha):
Insuficiente -- >25t/ha: P=80 kg P2O5/ha; K=120(vinho)/140(mesa) kg K2O/ha. 15-25t/ha: P=60; K=80/120. 10-15t/ha: P=40; K=60/80. <10t/ha: P=30; K=40/60.
Normal -- >25t/ha: P=60; K=50/60. 15-25t/ha: P=40; K=30/40. 10-15t/ha: P=20; K=20/20. <10t/ha: P≤10; K≤10/15.
Excessivo -- qualquer produtividade: P=0; K=0.
Na ausência de análise de tecido, usar o teor de P disponível no solo (amostra a partir do 3º ano de implantação) como proxy: Muito baixo/Baixo="Insuficiente", Médio/Alto="Normal", Muito alto="Excessivo". Aplicação no período hibernal (julho/agosto), sem incorporação, na área de projeção da copa, 40-50cm do caule. Solo arenoso + dose de K2O acima de 60kg/ha: fracionar em duas vezes (hibernal + início da brotação/baga chumbinho). Doses de K acima da tabela podem elevar o pH do vinho (mais notável em tintos).`;

const DIAGNOSE_FOLIAR_CONTENT = `DIAGNOSE FOLIAR DA VIDEIRA (Tabelas 6.5.18 e 6.5.19) -- método de avaliação nutricional PRINCIPAL da cultura (mais preciso que interpretar só solo). Duas amostras possíveis: PECÍOLO (mais sensível pra P e K; coletar pecíolo de folha recém-madura) ou FOLHA COMPLETA (limbo+pecíolo; mais sensível pra B e N; coletar folha oposta ao primeiro cacho, na mudança de cor da baga). Recomenda-se análise a cada 4 anos se normal, anual se houver problema nutricional observado.

CLASSES DE PECÍOLO (Tabela 6.5.18) -- ATUALIZAÇÃO 2026-09-04: esta classificação AGORA está automatizada de verdade no motor (crop_profile_parameters, sampleType="PECIOLO"), não é mais só texto -- primeira classificação por tecido desta base. Reproduzida aqui também em texto pra contexto da IA: amostra de ~100 pecíolos de folhas recém-maduras, 20-30 plantas.
Macronutrientes (%) -- N: Insuf<0,40 / Normal 0,66-0,95 / Excess>1,25. P: Insuf<0,10 / Normal 0,16-0,25 / Excess>0,40. K: Insuf<0,80 / Normal 1,50-2,50 / Excess>3,50. Ca: Insuf<0,50 / Normal 1,00-2,00 / Excess>3,0. Mg: Insuf<0,15 / Normal 0,25-0,50 / Excess>0,70.
Micronutrientes (mg/kg) -- Fe: Insuf<15 / Normal 30-150 / Excess>300. Zn: Insuf<15 / Normal 30-50 / Excess>100. Mn: Insuf<20 / Normal 30-300 / Excess>300. B: Insuf<15 / Normal 30-50 / Excess>100. Cu: sem faixa definida no manual pra pecíolo de videira (não automatizado, sem faixa pra classificar).

CLASSES DE FOLHA COMPLETA (Tabela 6.5.19) -- ainda só como texto, não automatizada nesta rodada (mesmo mecanismo do pecíolo poderia ser aplicado numa próxima passada, sampleType="FOLIAR"). Amostra de ~100 folhas completas, 20-30 plantas, folha oposta ao 1º cacho:
Macronutrientes (%) -- N: Insuf<1,60 / Normal 1,60-2,40 / Excess>2,40. P: Insuf<0,12 / Normal 0,12-0,40 / Excess>0,40. K: Insuf<0,80 / Normal 0,80-1,60 / Excess>1,60. Ca: Insuf<1,60 / Normal 1,60-2,40 / Excess>2,40. Mg: Insuf<0,20 / Normal 0,20-0,60 / Excess>0,60.
Micronutrientes (mg/kg) -- Fe: Insuf<60 / Normal 60-150 / Excess>180. Zn: Insuf<25 / Normal 25-60 / Excess>60. Mn: Insuf<20 / Normal 30-300 / Excess>300. B: Insuf<30 / Normal 30-65 / Excess>65. Cu: sem faixa definida no manual pra folha completa de videira.

IMPORTANTE PRA IMPLEMENTAÇÃO FUTURA: estas duas tabelas alimentam diretamente as tabelas de dose de N/P/K de manutenção acima (a classificação "Insuficiente/Normal/Excessivo" do tecido é o que indexa a dose, junto com a produtividade esperada) -- ou seja, automatizar diagnose foliar não é só "mais uma tabela", é o método que decide a dose de manutenção real da cultura. Reproduzir isso no motor da RAIZ exige o mesmo mecanismo de classificação por faixa já usado pra solo (sufficiency_ranges), só que pra uma amostra de TECIDO, não de solo -- schema hoje não distingue os dois tipos de amostra.`;

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Frutíferas, VIDEIRA (6.5.18)`;

const PECIOLO_SOURCE = `Fonte: ${SOURCE_2016}, Tabela 6.5.18, p.231 -- classes de valores pra pecíolo de videira (~100 pecíolos de folhas recém-maduras, 20-30 plantas). Verificado contra o PDF oficial reextraído com \`pdftotext -table\` em 2026-09-04. Primeira classificação por TECIDO (não solo) automatizada nesta base -- sample_type="PECIOLO", schema/motor implementados na mesma data (migration 022).`;

/** Tabela 6.5.18 -- pecíolo de videira. Sem profundidade (não se aplica a tecido foliar); Cu não tem faixa definida no manual, por isso não entra aqui. */
const PECIOLO_VIDEIRA = [
  { parameterCode: "N", parameterCategory: "QUIMICO", sampleType: "PECIOLO", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.4 }, { label: "Normal", min: 0.66, max: 0.95 }, { label: "Excessivo", min: 1.25 }], criticality: "ALTA", technicalNotes: PECIOLO_SOURCE },
  { parameterCode: "P", parameterCategory: "QUIMICO", sampleType: "PECIOLO", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.1 }, { label: "Normal", min: 0.16, max: 0.25 }, { label: "Excessivo", min: 0.4 }], criticality: "ALTA", technicalNotes: PECIOLO_SOURCE },
  { parameterCode: "K", parameterCategory: "QUIMICO", sampleType: "PECIOLO", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.8 }, { label: "Normal", min: 1.5, max: 2.5 }, { label: "Excessivo", min: 3.5 }], criticality: "ALTA", technicalNotes: PECIOLO_SOURCE },
  { parameterCode: "CA", parameterCategory: "QUIMICO", sampleType: "PECIOLO", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.5 }, { label: "Normal", min: 1.0, max: 2.0 }, { label: "Excessivo", min: 3.0 }], criticality: "MEDIA", technicalNotes: PECIOLO_SOURCE },
  { parameterCode: "MG", parameterCategory: "QUIMICO", sampleType: "PECIOLO", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "%", sufficiencyRanges: [{ label: "Insuficiente", max: 0.15 }, { label: "Normal", min: 0.25, max: 0.5 }, { label: "Excessivo", min: 0.7 }], criticality: "MEDIA", technicalNotes: PECIOLO_SOURCE },
  { parameterCode: "FE", parameterCategory: "QUIMICO", sampleType: "PECIOLO", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 15 }, { label: "Normal", min: 30, max: 150 }, { label: "Excessivo", min: 300 }], criticality: "BAIXA", technicalNotes: PECIOLO_SOURCE },
  { parameterCode: "ZN", parameterCategory: "QUIMICO", sampleType: "PECIOLO", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 15 }, { label: "Normal", min: 30, max: 50 }, { label: "Excessivo", min: 100 }], criticality: "BAIXA", technicalNotes: PECIOLO_SOURCE },
  { parameterCode: "MN", parameterCategory: "QUIMICO", sampleType: "PECIOLO", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 20 }, { label: "Normal", min: 30, max: 300 }, { label: "Excessivo", min: 300 }], criticality: "BAIXA", technicalNotes: PECIOLO_SOURCE },
  { parameterCode: "B", parameterCategory: "QUIMICO", sampleType: "PECIOLO", depthFromCm: null, depthToCm: null, analyticalMethodAllowed: [], unitExpected: "mg/kg", sufficiencyRanges: [{ label: "Insuficiente", max: 15 }, { label: "Normal", min: 30, max: 50 }, { label: "Excessivo", min: 100 }], criticality: "BAIXA", technicalNotes: PECIOLO_SOURCE },
];

async function main() {
  const cropProfileId = await ensureCropProfile("VIDEIRA", "Videira", "FRUTIFERA");
  console.log(`VIDEIRA: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL, ...PECIOLO_VIDEIRA]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — adubação de pré-plantio`, PRE_PLANTIO_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K de crescimento e manutenção`, NPK_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — diagnose foliar (pecíolo e folha completa)`, DIAGNOSE_FOLIAR_CONTENT);

  console.log("NOTA: classificação de SOLO e de PECÍOLO (Tabela 6.5.18) automatizadas no motor -- FOLHA COMPLETA (Tabela 6.5.19) e as tabelas de dose continuam só como texto, pendente próxima rodada.");
}

main().finally(() => pool.end());
