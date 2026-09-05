import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * MORANGUEIRO (Fragaria x ananassa) -- capítulo 6.5.11 do Manual CQFS-RS/SC
 * 2016, sexta frutífera carregada nesta base. Mesmo padrão: classificação
 * de SOLO automatizada (Grupo 2, já testado), doses e diagnose foliar como
 * technical_source em texto. Conferido direto contra o PDF oficial,
 * reextraído com `pdftotext -table`.
 *
 * DIFERENÇA REAL, vale registrar: o próprio manual desconsidera o teor de
 * matéria orgânica do solo pro N do morangueiro -- justificativa explícita
 * do texto: o sistema de produção usa muito resíduo orgânico como
 * substrato (casca de arroz carbonizada, maravalha, serragem), formando um
 * substrato que contribui pouco com N de verdade pra cultura -- por isso o
 * N aqui é indexado só por produtividade esperada, diferente de toda
 * frutífera já carregada (todas usam MO do solo). A diagnose foliar
 * (Tabela 6.5.12) também é estruturalmente diferente das outras 5 já
 * carregadas -- não tem três classes (Insuficiente/Normal/Excessivo), é
 * uma única faixa "adequada" por nutriente, e é a primeira frutífera desta
 * base com enxofre (S) listado na própria tabela foliar.
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

const PRE_PLANTIO_CONTENT = `ADUBAÇÃO DE PRÉ-PLANTIO (Tabela 6.5.1, compartilhada por todas as frutíferas): mesma tabela de P2O5/K2O por classe de fertilidade do solo -- Muito baixo 250+150, Baixo 170+90, Médio 130+60, Alto 90+30, Muito alto 0+0 (kg P2O5/ha + kg K2O/ha).`;

const NPK_CONTENT = `NITROGÊNIO -- ADUBAÇÃO DE CRESCIMENTO E MANUTENÇÃO, indexado SÓ por produtividade esperada (t/ha) -- DIFERENTE de toda outra frutífera carregada até agora, que usa teor de matéria orgânica do solo. Justificativa explícita do manual: o sistema de produção do morangueiro normalmente usa grande quantidade de resíduo orgânico como substrato (casca de arroz carbonizada, maravalha, serragem etc.), formando um substrato que contribui pouco pro fornecimento real de N à cultura -- por isso o teor de MO do solo foi desconsiderado como critério.
Produtividade <20t/ha: 90 kg N/ha. 20-40t/ha: 180. >40t/ha: 270. Parcelar em 3 a 4 vezes ao longo do ciclo. Monitorar crescimento das plantas -- excesso de N favorece demasiadamente o crescimento vegetativo em detrimento da produção, e pode causar má formação de frutos.

FÓSFORO E POTÁSSIO -- dose de P definida só pelo teor de P no solo; dose de K definida pelo teor de P/K no solo cruzado com a produtividade esperada (colunas de produtividade compartilhadas entre P e K na tabela original, mas P não varia por produtividade, só K varia):
Muito baixo: P=200 kg P2O5/ha; K conforme produtividade <20t/ha=180, 20-40t/ha=300, >40t/ha=420 kg K2O/ha.
Baixo: P=140; K=140/260/380.
Médio: P=100; K=100/220/340.
Alto: P=60; K=60/180/300.
Muito alto: P=60; K=60/180/300 (mesmo valor de "Alto" -- o próprio manual não reduz mais a dose depois da classe "Alto", conferido contra o PDF oficial, não é erro de transcrição).
Evitar excesso de potássio -- pode causar má formação de frutos. Fertilizantes de P e K aplicados ao longo da fila de plantio, faixa de ~1,0m de cada lado.`;

const DIAGNOSE_FOLIAR_CONTENT = `DIAGNOSE FOLIAR DO MORANGUEIRO (Tabela 6.5.12) -- coletar a 3ª e a 4ª folhas maduras (sem pecíolo), no início do florescimento; 80 a 100 folhas de 30 a 40 plantas. Estrutura DIFERENTE das outras 5 frutíferas já carregadas: não tem três classes Insuficiente/Normal/Excessivo, é uma única FAIXA considerada adequada por nutriente -- e é a primeira tabela foliar desta base que lista enxofre (S) diretamente. Ainda não automatizada no motor da RAIZ (mesma pendência de schema já registrada pras outras frutíferas).

Macronutrientes -- N: 1,5-2,5%. P: 0,2-0,4%. K: 2,0-4,0%. Ca: 1,0-2,5%. Mg: 0,6-1,0%. S: 0,1-0,5%.
Micronutrientes (mg/kg) -- B: 35-100. Cu: 5-20. Fe: 50-300. Mn: 30-300. Zn: 20-50.`;

const SOURCE_TITLE_PREFIX = `${SOURCE_2016} — capítulo Frutíferas, MORANGUEIRO (6.5.11)`;

async function main() {
  const cropProfileId = await ensureCropProfile("MORANGUEIRO", "Morangueiro", "FRUTIFERA");
  console.log(`MORANGUEIRO: ${cropProfileId}`);

  await seedParameters(cropProfileId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL]);

  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — adubação de pré-plantio`, PRE_PLANTIO_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — doses de N/P/K de crescimento e manutenção`, NPK_CONTENT);
  await seedSource(cropProfileId, `${SOURCE_TITLE_PREFIX} — diagnose foliar`, DIAGNOSE_FOLIAR_CONTENT);

  console.log("NOTA: só a classificação de SOLO está automatizada no motor -- diagnose foliar fica só como texto até decisão de schema.");
}

main().finally(() => pool.end());
