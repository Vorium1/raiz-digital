import pg from "pg";
import { K_GRUPO2, SOLO_GERAL, S_GRUPO_EXIGENTE, SOURCE_2016, INSTITUTION_2016 } from "./lib/cqfs-2016-grupo2-graos.mjs";

/**
 * ARROZ (irrigado por alagamento) -- confirmado direto no manual oficial
 * (2016, capítulo 6.1.1) como caso REALMENTE à parte, diferente de todas as
 * culturas já carregadas:
 * - Fósforo tem classificação PRÓPRIA (Grupo 4, exclusivo pra arroz
 *   irrigado -- Tabela 6.6) e SEM estratificação por classe de argila
 *   (a fonte explica: o alagamento muda a química do solo, reduz Fe/Al,
 *   torna a diferenciação por argila desnecessária -- diferente de todo
 *   solo de sequeiro já carregado nesta base).
 * - Potássio usa a mesma classificação do Grupo 2 (grãos) -- a tabela de
 *   grupos de exigência de K do manual não lista arroz separadamente.
 * - Nitrogênio é indexado por "expectativa de resposta à adubação"
 *   (média/alta, com ajuste pra muito alta/baixa), não por cultura
 *   antecedente como os outros grãos -- estrutura de tabela diferente.
 * - Enxofre: mesmo grupo mais exigente (crítico >10mg/dm³) já usado pra
 *   soja/canola -- reaproveitado.
 * - Toxidez por ferro (Fe2+): NÃO é faixa de suficiência, é RISCO -- e é
 *   calculada por fórmula a partir de Fe medido + CTC, não é um valor de
 *   laboratório direto. Não entra em crop_profile_parameters (motor ainda
 *   não suporta parâmetro derivado por fórmula, mesma pendência já
 *   registrada pra pH/V%/calagem) -- fica só como texto de referência.
 */

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

const P_ARROZ_IRRIGADO = {
  parameterCode: "P", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
  analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
  sufficiencyRanges: [{ label: "Muito Baixo", max: 2.0 }, { label: "Baixo", min: 2.1, max: 4.0 }, { label: "Médio", min: 4.1, max: 6.0 }, { label: "Alto", min: 6.1, max: 12.0 }, { label: "Muito Alto", min: 12.0 }],
  criticality: "ALTA",
  technicalNotes: `Fonte: ${SOURCE_2016}, Tabela 6.6, p.94 -- Grupo 4, EXCLUSIVO pra arroz irrigado por alagamento. Sem estratificação por classe de argila (diferenciação desnecessária em solo alagado, por causa da redução de óxidos de Fe/Al). Verificado contra o PDF oficial em 2026-09-04.`,
};

const PARAMETERS = [P_ARROZ_IRRIGADO, ...K_GRUPO2, ...SOLO_GERAL, S_GRUPO_EXIGENTE];

const NPK_CONTENT = `NITROGÊNIO -- estrutura DIFERENTE dos outros grãos: indexado por "expectativa de resposta à adubação" (não por cultura antecedente). MO≤2,5%: 90kg N/ha (resposta média) / 120 (alta). MO 2,6-5,0%: 80/110. MO>5,0%: ≤70/≤100. Ajuste de até ±30kg N/ha pra expectativa muito alta ou baixa. Expectativa de resposta alta = clima favorável (radiação solar alta no período reprodutivo), cultivar de alto potencial, época/densidade de semeadura adequadas, manejo correto de irrigação/plantas daninhas/doenças/pragas -- baixa = quando esses fatores não são adequados.

Sistema de semeadura em solo seco: aplicar 10-20kg N/ha na semeadura, ~50% da cobertura em V3/V4 (antes/início do afilhamento), restante na iniciação da panícula (R0, identificado na prática pelo estádio "ponto de algodão", ~4 dias depois). Doses ≥100kg/ha em cobertura: pode aumentar a 1ª cobertura, desde que a 2ª mantenha pelo menos 40kg N/ha. Cobertura antes da inundação deve anteceder a irrigação em no máximo 3 dias; cobertura após inundação é feita sobre lâmina de água, com circulação interrompida por no mínimo 3 dias.
Sistema pré-germinado: NÃO aplicar N na semeadura (risco de perda + baixa exigência inicial). Ciclo curto/médio (até 135 dias): ~50% em V3/V4, restante em R0. Ciclo tardio (>135 dias): 3 aplicações iguais (V3/V4, V6/V7, R0).

POTÁSSIO -- dose (kg K2O/ha) por classificação e expectativa de resposta: Muito baixo 95(média)/110(alta). Baixo 75/90. Médio 55/70. Alto 35/50. Muito alto ≤35/≤50. Ajuste até ±15kg K2O/ha pra expectativa muito alta/baixa. Sistema solo seco: aplicar na semeadura. Pré-germinado: pode ser incorporado na formação da lama. Dose alta em solo arenoso: fracionar metade no preparo/semeadura, metade em cobertura na iniciação da panícula (junto com N).

FÓSFORO -- dose (kg P2O5/ha): Muito baixo 60(média)/70(alta). Baixo 50/60. Médio 40/50. Alto 30/40. Muito alto ≤30/≤40. Ajuste até ±10kg P2O5/ha pra expectativa muito alta/baixa. Solo seco: aplicar e incorporar na semeadura. Pré-germinado: incorporar na formação da lama ou aplicar em cobertura (V2-V3) pra evitar intensificar desenvolvimento de algas.

TOXIDEZ POR FERRO (Fe2+) -- exclusivo de arroz irrigado, NÃO é faixa de suficiência, é risco: alagamento solubiliza Fe, pode atingir nível tóxico. Fe2+ trocável (cmolc/dm³) = 1,66 + 2,46 × Fe-oxalato pH6 (g/dm³). Saturação da CTC por Fe2+ (PSFe2+, %) = 100 × Fe2+/CTCpH7,0. Risco: PSFe2+ ≤20% = Baixo; 21-40% = Médio; >40% = Alto. Mitigação: cultivar tolerante (mais econômico/eficiente), calagem prévia, adubação N/K adequada; irrigação intermitente só em caso muito específico (aumenta consumo de água, perda de nutriente, reinfestação de daninha).

ENXOFRE -- crítico >10mg/dm³ (mesmo grupo exigente da soja/canola), mas com nuance regional real: solo afastado de região industrial, MO e argila baixas, cultivo intensivo de arroz irrigado (ex.: baixo rio Jacuí) é mais suscetível a deficiência. Resposta limitada a 20kg S/ha -- fontes: sulfato de amônio (22-24%S), sulfato de potássio (15-17%S), superfosfato simples (10-12%S), gesso (13%S). Dica prática do manual: trocar 1 saco de ureia/ha por 2 sacos de sulfato de amônio/ha na primeira cobertura já supre a demanda de S.`;

async function main() {
  const cropResult = await pool.query("SELECT id::text FROM crop_profiles WHERE code = 'ARROZ'");
  const cropProfileId = cropResult.rows[0]?.id;
  if (!cropProfileId) throw new Error("crop_profile ARROZ não encontrado.");
  console.log(`ARROZ: ${cropProfileId}`);

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

  const title = `${SOURCE_2016} — capítulo Arroz Irrigado`;
  await pool.query(`DELETE FROM technical_sources WHERE crop_profile_id = $1::uuid AND title = $2`, [cropProfileId, title]);
  const r = await pool.query(
    `INSERT INTO technical_sources (title, institution, edition_year, crop_profile_id, content)
     VALUES ($1, $2, $3, $4::uuid, $5) RETURNING id::text, status`,
    [title, INSTITUTION_2016, 2016, cropProfileId, NPK_CONTENT],
  );
  console.log(`  technical_source -> ${r.rows[0].status} (${r.rows[0].id})`);
  console.log("NOTA: este perfil cobre ARROZ IRRIGADO por alagamento (o sistema dominante e mais complexo). Arroz de sequeiro (cap. 6.1.2 do manual) não foi carregado nesta rodada -- fica pendente.");
}

main().finally(() => pool.end());
