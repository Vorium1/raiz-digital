import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * AVEIA, CEVADA e TRITICALE -- confirmado direto no manual oficial (2016,
 * capítulos 6.1.4/6.1.5 aveia branca/preta, 6.1.8 cevada, 6.1.22 triticale):
 * as quatro compartilham a MESMA tabela de N (60/80, 40/60, ≤20/≤20 kg N/ha
 * por MO×antecessora) e a MESMA tabela de P2O5/K2O do trigo -- são tratadas
 * como um grupo único de "cereais de inverno de porte baixo" pela própria
 * fonte (o capítulo de triticale inclusive diz textualmente "as sugestões
 * de adubação nitrogenada do trigo também são válidas pro triticale").
 * Reaproveita o mesmo módulo Grupo 2 já usado pra soja/milho/trigo/canola.
 */

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

const PARAMETERS = [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL];

const NPK_TABLE_TEXT = `Adubação nitrogenada (semeadura + cobertura, kg N/ha), por matéria orgânica do solo e cultura antecedente: MO ≤2,5% -> 60 (leguminosa) / 80 (gramínea); MO 2,6-5,0% -> 40/60; MO >5,0% -> ≤20/≤20 (pressupõe rendimento ~3t/ha; para rendimento maior, somar 20kg/ha após leguminosa ou 30kg/ha após gramínea por tonelada adicional). Aplicar 15-20kg/ha de N na semeadura e o restante em cobertura entre afilhamento e alongamento do colmo (~30-45 dias após emergência); doses elevadas podem ser parceladas 50%/50% entre início do afilhamento e início do alongamento.

Adubação de fósforo e potássio (kg P2O5/ha e K2O/ha, por classe de interpretação e nº do cultivo, pressupõe rendimento ≤3t/ha): Muito baixo -> 155/95 P2O5, 110/70 K2O. Baixo -> 95/75, 70/50. Médio -> 85/45, 60/30. Alto -> 45/45, 30/30. Muito alto -> 0/≤45, 0/≤30. Para rendimento acima de 3t/ha, somar 15kg/ha de P2O5 e 10kg/ha de K2O por tonelada adicional de grãos.`;

async function seedCrop(code, name, cropGroup, extraTechnicalNote, npkSourceTitle) {
  const cropResult = await pool.query("SELECT id::text FROM crop_profiles WHERE code = $1", [code]);
  let cropProfileId = cropResult.rows[0]?.id;
  if (!cropProfileId) {
    const inserted = await pool.query(
      `INSERT INTO crop_profiles (code, name, status, crop_group, technical_notes)
       VALUES ($1, $2, 'DRAFT', $3, 'Catálogo de cultura criado automaticamente. Faixas de suficiência aguardando homologação técnica.')
       RETURNING id::text`,
      [code, name, cropGroup],
    );
    cropProfileId = inserted.rows[0].id;
  }
  console.log(`${code}: ${cropProfileId}`);

  const codes = [...new Set(PARAMETERS.map((p) => p.parameterCode))];
  await pool.query(`DELETE FROM crop_profile_parameters WHERE crop_profile_id = $1::uuid AND parameter_code = ANY($2::text[])`, [cropProfileId, codes]);
  for (const p of PARAMETERS) {
    const result = await pool.query(
      `INSERT INTO crop_profile_parameters
       (crop_profile_id, parameter_code, parameter_category, depth_from_cm, depth_to_cm, analytical_method_allowed, unit_expected, sufficiency_ranges, criticality, technical_notes, condition_parameter_code, condition_min, condition_max)
       VALUES ($1::uuid, $2, $3::lab_parameter_category, $4, $5, $6::text[], $7, $8::jsonb, $9::parameter_criticality, $10, $11, $12, $13)
       RETURNING id::text, parameter_code, status`,
      [cropProfileId, p.parameterCode, p.parameterCategory, p.depthFromCm, p.depthToCm, p.analyticalMethodAllowed, p.unitExpected, JSON.stringify(p.sufficiencyRanges), p.criticality, p.technicalNotes, p.conditionParameterCode ?? null, p.conditionMin ?? null, p.conditionMax ?? null],
    );
    console.log(`  ${result.rows[0].parameter_code} -> ${result.rows[0].status} (${result.rows[0].id})`);
  }

  await pool.query(`DELETE FROM technical_sources WHERE crop_profile_id = $1::uuid AND title = $2`, [cropProfileId, SOURCE_2016]);
  const r1 = await pool.query(
    `INSERT INTO technical_sources (title, institution, edition_year, crop_profile_id, content)
     VALUES ($1, $2, $3, $4::uuid, $5) RETURNING id::text, status`,
    [SOURCE_2016, INSTITUTION_2016, 2016, cropProfileId, `${name} pertence ao mesmo grupo de "cereais de inverno de porte baixo" que o trigo -- mesmas faixas de classificação (Grupo 2 de P/K) e mesma tabela de dose. pH de referência 6,0 (mesmo grupo de soja/milho/trigo/canola). ${extraTechnicalNote}`],
  );
  console.log(`  technical_source (geral) -> ${r1.rows[0].status} (${r1.rows[0].id})`);

  await pool.query(`DELETE FROM technical_sources WHERE crop_profile_id = $1::uuid AND title = $2`, [cropProfileId, npkSourceTitle]);
  const r2 = await pool.query(
    `INSERT INTO technical_sources (title, institution, edition_year, crop_profile_id, content)
     VALUES ($1, $2, $3, $4::uuid, $5) RETURNING id::text, status`,
    [npkSourceTitle, INSTITUTION_2016, 2016, cropProfileId, NPK_TABLE_TEXT],
  );
  console.log(`  technical_source (N/P2O5/K2O) -> ${r2.rows[0].status} (${r2.rows[0].id})`);
}

async function main() {
  await seedCrop(
    "AVEIA", "Aveia (branca e preta)", "INVERNO",
    `Cobre tanto aveia branca (cap. 6.1.4) quanto aveia preta (cap. 6.1.5) -- mesma tabela nas duas. Em regiões mais quentes/baixa altitude (Missões-RS), solo argiloso com MO média-alta, e aveia semeada após soja de alto rendimento, restringir ou suspender N em cobertura (risco de acamamento). Em regiões frias com MO alta (Campos de Cima da Serra), pode aumentar a dose.`,
    `${SOURCE_2016} — capítulo Aveia (branca e preta)`,
  );

  await seedCrop(
    "CEVADA", "Cevada", "INVERNO",
    `ACHADO IMPORTANTE PRA CEVADA CERVEJEIRA: se a finalidade é malte do tipo único (single malt), NÃO aplicar N em cobertura após o alongamento do colmo -- o teor de proteína do grão não pode passar de 12%, senão prejudica o processo de maltagem. Se for pra maltes especiais, o processo industrial geralmente pede proteína entre 12-12,5% (faixa mais alta é aceitável/desejada nesse caso). Isso é o oposto do trigo pão, onde mais proteína é bom -- pra cevada cervejeira, proteína demais é DEFEITO. Em cultivares resistentes ao acamamento, não aplicar mais que 80kg N/ha no total. Em região quente/baixa altitude após soja, restringir a 40kg/ha total.`,
    `${SOURCE_2016} — capítulo Cevada`,
  );

  await seedCrop(
    "TRITICALE", "Triticale", "INVERNO",
    `A própria fonte diz textualmente que as recomendações de manejo de N do trigo (capítulo 6.1.21, já carregado nesta base) também valem pro triticale -- mesmas nuances regionais (restrição em região quente após soja, aumento em região fria com MO alta).`,
    `${SOURCE_2016} — capítulo Triticale`,
  );
}

main().finally(() => pool.end());
