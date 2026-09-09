import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL, S_GRUPO_EXIGENTE } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * Três culturas novas nesta rodada:
 * - CANOLA (já existia como crop_profile vazio, migration 013) -- brássica,
 *   confirmei no capítulo 6.1.6 do manual oficial (2016): mesmo Grupo 2 de
 *   P/K dos grãos (a própria Tabela 6.2 do manual lista "culturas de grãos"
 *   como Grupo 2 pra P, e canola é oleaginosa de grão), mas no grupo MAIS
 *   EXIGENTE de enxofre (>10mg/dm³, por ser brássica -- mesma regra da soja
 *   leguminosa). Tabela própria de N e de doses de P2O5/K2O carregada como
 *   technical_source.
 * - PASTAGEM_INVERNO (crop_profile novo) -- "Gramíneas de estação fria"
 *   (capítulo 6.2.2 do manual): aveia (branca/preta), azevém, centeio,
 *   triticale, cevada/trigo forrageiro (anuais); festuca, dáctilo, aveia
 *   perene etc. (perenes). A própria Tabela 6.2 do manual confirma
 *   "pastagens, exceto pastagem natural" como Grupo 2 de P -- mesmas faixas
 *   de classificação já carregadas pra soja/milho/trigo/canola. N e P/K são
 *   tabelas PRÓPRIAS (por MO direto, sem cultura antecedente; P/K por
 *   1º/2º cultivo ou ano) -- carregadas como technical_source.
 * - CARINATA (crop_profile novo, SEM dado carregado ainda) -- oleaginosa
 *   nova no Brasil (biocombustível/SAF), não existe no manual CQFS 2016
 *   (cultura recente demais). Criado só o perfil vazio; faixas ficam
 *   pendentes de pesquisa externa real (prompt separado).
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
  console.log(`technical_source -> ${r.rows[0].status} (${r.rows[0].id})`);
}

async function main() {
  // --- CANOLA ---
  const canolaId = await ensureCropProfile("CANOLA", "Canola", "INVERNO");
  console.log(`CANOLA: ${canolaId}`);
  await seedParameters(canolaId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GRUPO_EXIGENTE]);
  await seedSource(canolaId, `${SOURCE_2016} — capítulo Canola`,
    `Adubação nitrogenada da canola (semeadura + cobertura, kg N/ha), por matéria orgânica do solo: MO ≤2,5% -> 60; MO 2,6-5,0% -> 40; MO >5,0% -> ≤30 (pressupõe rendimento ~1,5 t/ha; para rendimento maior, somar 20 kg/ha de N por tonelada adicional). Aplicar 20 a 30 kg/ha de N na semeadura e o restante em cobertura logo após terminar a expansão da 4ª folha (~40 dias após semeadura) -- a cobertura na fase inicial é imprescindível e não deve ser atrasada, sob risco de comprometer vigor/produção; aplicação tardia (início do alongamento da haste floral) é pouco eficiente.

Adubação de fósforo e potássio da canola (kg P2O5/ha e kg K2O/ha, por classe de interpretação e nº do cultivo, pressupõe rendimento ≤1,5 t/ha): Muito baixo -> P2O5 140/80; K2O 105/65. Baixo -> 80/60; 65/45. Médio -> 70/30; 55/25. Alto -> 30/30; 25/25. Muito alto -> 0/≤30; 0/≤25. Para rendimento acima de 1,5 t/ha, somar 20 kg/ha de P2O5 e 15 kg/ha de K2O por tonelada adicional de grãos.

Canola é brássica -> grupo mais exigente de enxofre (crítico >10mg/dm³, mesma regra da soja/leguminosas). pH de referência 6,0 (mesmo grupo de soja/milho/trigo).`);

  // --- PASTAGEM DE INVERNO (Gramíneas de estação fria) ---
  const pastagemId = await ensureCropProfile("PASTAGEM_INVERNO", "Pastagem de inverno (gramíneas de estação fria)", "INVERNO");
  console.log(`PASTAGEM_INVERNO: ${pastagemId}`);
  await seedParameters(pastagemId, [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL]);
  await seedSource(pastagemId, `${SOURCE_2016} — capítulo Gramíneas de estação fria (6.2.2)`,
    `Espécies cobertas: anuais -- aveia branca e preta, azevém (diploide/tetraploide), centeio, capim lanudo, triticale, cevada forrageira, trigo forrageiro; perenes -- festuca, faláris, dáctilo, aveia perene, cevadilha. Uso típico no RS/SC: pastagem de inverno em sistema de integração lavoura-pecuária (ILP), antes de soja/milho de verão.

Adubação nitrogenada (kg N/ha), direto por matéria orgânica do solo (SEM distinção de cultura antecedente, diferente dos grãos): MO <1,6% -> 160-180; 1,6-2,5% -> 140-160; 2,6-3,5% -> 120-140; 3,6-4,5% -> 100-120; MO >4,5% -> 80-100 (dentro de cada faixa de MO, usar o valor maior quando a MO estiver mais próxima do limite inferior da faixa; se implantada após leguminosa, usar o valor mínimo da faixa). Pra expectativa de rendimento de matéria seca acima de 6t/ha (anuais) ou 8t/ha (perenes, a partir do 2º ano), somar 30kg/ha de N por tonelada adicional. Aplicar 15-30kg/ha de N na semeadura e parcelar o restante em 2 a 4 coberturas, no perfilhamento e após cada 1-2 períodos de pastejo (perenes: a partir do início do outono, mesma lógica).

Adubação de fósforo e potássio (kg P2O5/ha e K2O/ha, por classe de interpretação e por cultivo/ano): Muito baixo -> 170/110 P2O5, 140/100 K2O. Baixo -> 110/90, 100/80. Médio -> 100/60, 90/60. Alto -> 60/60, 60/60. Muito alto -> 0/≤60, 0/≤60. Se a pastagem for o 2º cultivo num sistema onde já foi feita correção total de P/K, aplicar 60kg/ha de P2O5 e 60kg/ha de K2O por cultivo/ano direto (sem consultar a classe). Pra rendimento de matéria seca acima de 6t/ha (anuais) ou 8t/ha (perenes), somar 10kg/ha de P2O5 e 10kg/ha de K2O por tonelada adicional. Se destinada a corte (feno/silagem) em vez de pastejo direto, somar 20kg/ha de K2O por tonelada de matéria seca removida (exportação maior que no pastejo, onde parte do nutriente retorna via dejeto animal).

ATENÇÃO ILP (achado ao pesquisar, do próprio manual): em sistema de integração lavoura-pecuária, monitorar o teor de molibdênio da pastagem -- a calagem eleva o pH e aumenta a disponibilidade de Mo, o que pode afetar o metabolismo de cobre em RUMINANTES que pastejam ali (risco de molibdenose). Suspender aplicação de Mo ao solo quando o teor na parte aérea das plantas atingir 5mg Mo/kg. Isso é relevante pro RAIZ Digital porque é um caso onde uma decisão de manejo de solo (calagem) tem efeito direto na saúde animal, não só na planta.

PENDENTE DE PESQUISA (não encontrado no manual CQFS, que trata só de fertilidade, não de física do solo): efeito do pisoteio animal (compactação por pastejo) sobre a estrutura do solo em sistemas de ILP -- carga animal segura, altura de saída dos animais pra evitar compactação, manejo de pastejo rotacionado vs contínuo. Fica pro próximo prompt de pesquisa externa.`);

  // --- CARINATA (perfil vazio, pendente de pesquisa) ---
  const carinataId = await ensureCropProfile("CARINATA", "Carinata (Brassica carinata)", "INVERNO");
  console.log(`CARINATA: ${carinataId} -- perfil criado, SEM faixas carregadas (cultura recente demais pro manual CQFS 2016, precisa de pesquisa externa)`);
}

main().finally(() => pool.end());
