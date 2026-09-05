import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * PESSEGUEIRO E NECTARINEIRA (Prunus persica) -- capítulo 6.5.16 do Manual
 * CQFS-RS/SC 2016, quarta frutífera carregada nesta base. Mesmo padrão:
 * classificação de SOLO automatizada (Grupo 2, já testado), doses e
 * diagnose foliar como technical_source em texto (mesma pendência de
 * schema já registrada pra videira/macieira/citros). Conferido direto
 * contra o PDF oficial, reextraído com `pdftotext -table`.
 *
 * Estrutura de dose de manutenção mais simples que macieira -- é só
 * teor foliar (sem cruzar com classe de solo), com ajuste por
 * produtividade acima de 20t/ha, parecido com o padrão de quivizeiro.
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
  await pool.query(`DELETE FROM crop_profile_parameters WHERE crop_profile_id = $1::uuid AND parameter_code = ANY($2::text[])`, [cropProfileId, codes]);
  for (const p of parameters) {
    const result = await pool.query(
      `INSERT INTO crop_profile_parameters
       (crop_profile_id, parameter_code, parameter_category, depth_from_cm, depth_to_cm, analytical_method_allowed, unit_expected, sufficiency_ranges, criticality, technical_notes, condition_parameter_code, condition_min, condition_max)
       VALUES ($1::uuid, $2, $3::lab_parameter_category, $4, $5, $6::text[], $7, $8::jsonb, $9::parameter_criticality, $10, $11, $12, $13)
       RETURNING id::text, parameter_code, status`,
      [cropProfileId, p.parameterCode, p.parameterCategory, p.depthFromCm, p.depthToCm, p.analyticalMethodAllowed, p.unitExpected, JSON.stringify(p.sufficiencyRanges), p.criticality, p.technicalNotes, p.conditionParameterCode ?? null, p.conditionMin ?? null, p.conditionMax ?? null],
    );
    console.log(`  ${result.rows[0].parameter_code} -> ${result.rows[0].status} (${result.rows[0].id})`);
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

const PRE_PLANTIO_CONTENT = `ADUBAÇÃO DE PRÉ-PLANTIO (Tabela 6.5.1, compartilhada por todas as frutíferas): mesma tabela de P2O5/K2O por classe de fertilidade do solo -- Muito baixo 250+150, Baixo 170+90, Médio 130+60, Alto 90+30, Muito alto 0+0 (kg P2O5/ha + kg K2O/ha). Específico pra pessegueiro/nectarineira: adicionar também 2 a 3 kg/ha de B.`;

const NPK_CONTENT = `NITROGÊNIO -- ADUBAÇÃO DE CRESCIMENTO (mudas, até o 3º ano), por teor de matéria orgânica do solo e ano após o plantio (1º/2º/3º): MO<2,5%: 50/60/80 kg N/ha. MO 2,6-5,0%: 40/50/60. MO>5,0%: 20/30/40. Parcelar em 3 vezes, a partir do início da brotação, intervalos de 45 dias -- no 1º ano, a primeira dose só 30 dias após o início da brotação das mudas.

ADUBAÇÃO DE MANUTENÇÃO (a partir do 4º ano), baseada SÓ no teor foliar do nutriente e na produtividade esperada -- estrutura mais simples que macieira (não cruza com classe de solo):
NITROGÊNIO -- teor foliar de N: <1,90%=110 kg N/ha. 1,90-2,57%=90. 2,58-3,25%=70. 3,26-3,90%=50. 3,91-4,53%=30. >4,53%=0 (não aplicar). Ajuste: +2kg N/ha pra cada tonelada de fruto produzida acima de 20t/ha.
FÓSFORO -- teor foliar de P: <0,04%=80-120 kg P2O5/ha. 0,04-0,09%=40-60. >0,09%=0.
POTÁSSIO -- teor foliar de K: <0,54%=100 kg K2O/ha. 0,54-0,92%=80. 0,93-1,30%=60. 1,31-1,68%=40. 1,69-2,07%=30. 2,07-2,82%=20. >2,82%=0. Ajuste: +4kg K2O/ha pra cada tonelada de fruto produzida acima de 20t/ha.
N parcelado em 3 vezes: 50% no início da floração, 25% após o raleio dos frutos, 25% após a colheita (pode dispensar a de pós-colheita em anos de baixa produção ou plantas com vigor excessivo). P em uma única vez, junto com a primeira aplicação de N (início da floração). K em uma vez (início da floração) ou fracionado em duas vezes pra cultivares de ciclo tardio ou solo arenoso. Após adubação de raleio, adotar poda verde pra arejamento interno da copa (controle de podridões de fruto).`;

const DIAGNOSE_FOLIAR_CONTENT = `DIAGNOSE FOLIAR DO PESSEGUEIRO E NECTARINEIRA (Tabela 6.5.17, adaptada de Freire & Magnani, 2014) -- coletar folhas completas e normais da parte mediana das brotações do ano, entre a 13ª e a 15ª semanas após a plena floração; ~100 folhas por amostra. Ainda não automatizado no motor da RAIZ (mesma pendência de schema registrada pras outras frutíferas: falta dimensão de "tipo de amostra", solo vs. tecido foliar) -- mas pra esta cultura essa tabela é ainda mais central que nas outras, porque a dose de manutenção inteira (a partir do 4º ano) é indexada só por ela, sem cruzar com solo.

Macronutrientes (%) -- N: Insuficiente<2,00 / Normal 3,30-4,50 / Excessivo>6,00. P: Insuficiente<0,05 / Normal 0,15-0,30 / Excessivo>0,40. K: Insuficiente<0,50 / Normal 1,40-2,00 / Excessivo>2,80. Ca: Insuficiente<0,65 / Normal 1,70-2,60 / Excessivo>3,60. Mg: Insuficiente<0,20 / Normal 0,50-0,80 / Excessivo>1,20.
Micronutrientes (mg/kg) -- Fe: Insuficiente<50 / Normal 100-230 / Excessivo>330. Cu: Normal 6-30 / Excessivo>50 (sem faixa de insuficiência definida no manual). Zn: Insuficiente<10 / Normal 24-37 / Excessivo>50. Mn: Insuficiente<20 / Normal 30-160 / Excessivo>400. B: Insuficiente<3 / Normal 30-60 / Excessivo>90.`;

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Frutíferas, PESSEGUEIRO E NECTARINEIRA (6.5.16)`;

async function main() {
  const cropProfileId = await ensureCropProfile("PESSEGUEIRO", "Pessegueiro e Nectarineira", "FRUTIFERA");
  console.log(`PESSEGUEIRO: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — adubação de pré-plantio`, PRE_PLANTIO_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K de crescimento e manutenção`, NPK_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — diagnose foliar`, DIAGNOSE_FOLIAR_CONTENT);

  console.log("NOTA: só a classificação de SOLO está automatizada no motor -- diagnose foliar fica só como texto até decisão de schema.");
}

main().finally(() => pool.end());
