import pg from "pg";
import { SOURCE_2016, INSTITUTION_2016, P_GRUPO2, K_GRUPO2, SOLO_GERAL, S_GERAL } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * ARROZ DE SEQUEIRO (cap. 6.1.2 do manual) -- diferente do irrigado: a
 * própria Tabela 6.2 do manual define Grupo 2 de P como "culturas de grãos
 * (EXCETO arroz IRRIGADO)" -- ou seja, arroz de sequeiro (sem alagamento,
 * sem a química redox que justifica um grupo à parte) usa a mesma
 * classificação de P/K dos grãos em geral, reaproveitada sem ressalva.
 * Só tem tabela de DOSE própria (N e P2O5/K2O), carregada como fonte
 * técnica. Enxofre: grupo geral (>5mg/dm³) -- só "arroz irrigado por
 * alagamento" está no grupo mais exigente, não o de sequeiro.
 */

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

const PARAMETERS = [...P_GRUPO2, ...K_GRUPO2, ...SOLO_GERAL, S_GERAL];

const NPK_CONTENT = `Adubação nitrogenada (kg N/ha), por matéria orgânica do solo (pressupõe rendimento ~2t/ha): MO≤2,5% -> 50; MO 2,6-5,0% -> 40; MO>5,0% -> 10. Para rendimento acima de 2t/ha, somar 15kg/ha de N por tonelada adicional. Aplicar 10kg/ha na semeadura e o restante em cobertura no início do afilhamento (~40 dias após emergência) -- a cobertura pode ser parcial ou totalmente suprimida dependendo das condições climáticas (diferente do arroz irrigado, aqui a decisão é mais flexível por causa da dependência de chuva).

Adubação de fósforo e potássio (kg P2O5/ha e K2O/ha, por classe de interpretação e nº do cultivo, pressupõe rendimento ≤2t/ha): Muito baixo -> 130/70 P2O5, 100/60 K2O. Baixo -> 70/50, 60/40. Médio -> 60/20, 50/20. Alto -> 20/20, 20/20. Muito alto -> 0/≤20, 0/≤20. Para rendimento acima de 2t/ha, somar 10kg/ha de P2O5 e 10kg/ha de K2O por tonelada adicional de grãos.`;

async function main() {
  const cropResult = await pool.query("SELECT id::text FROM crop_profiles WHERE code = 'ARROZ_SEQUEIRO'");
  let cropProfileId = cropResult.rows[0]?.id;
  if (!cropProfileId) {
    const inserted = await pool.query(
      `INSERT INTO crop_profiles (code, name, status, crop_group, technical_notes)
       VALUES ('ARROZ_SEQUEIRO', 'Arroz de Sequeiro', 'DRAFT', 'VERAO', 'Catálogo de cultura criado automaticamente. Faixas de suficiência aguardando homologação técnica.')
       RETURNING id::text`,
    );
    cropProfileId = inserted.rows[0].id;
  }
  console.log(`ARROZ_SEQUEIRO: ${cropProfileId}`);

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

  const title = `${SOURCE_2016} — capítulo Arroz de Sequeiro`;
  await pool.query(`DELETE FROM technical_sources WHERE crop_profile_id = $1::uuid AND title = $2`, [cropProfileId, title]);
  const r = await pool.query(
    `INSERT INTO technical_sources (title, institution, edition_year, crop_profile_id, content)
     VALUES ($1, $2, $3, $4::uuid, $5) RETURNING id::text, status`,
    [title, INSTITUTION_2016, 2016, cropProfileId, NPK_CONTENT],
  );
  console.log(`  technical_source -> ${r.rows[0].status} (${r.rows[0].id})`);
}

main().finally(() => pool.end());
