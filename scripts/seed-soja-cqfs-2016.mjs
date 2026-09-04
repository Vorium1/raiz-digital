import pg from "pg";

/**
 * Carrega, como RASCUNHO (status DRAFT), as faixas de suficiência de solo
 * para SOJA extraídas do Manual de Calagem e Adubação para os Estados do RS
 * e de SC, 11ª edição (2016) -- SBCS Núcleo Regional Sul.
 *
 * Origem: pesquisa ampla feita pelo diretor no Claude (Sonnet/Opus, claude.ai,
 * 2026-09-04), depois VERIFICADA por Claude Code direto contra o PDF oficial
 * (sbcs-nrs.org.br/docs/Manual_de_Calagem_e_Adubacao_para_os_Estados_do_RS_e_de_SC-2016.pdf,
 * baixado e lido com pdftotext nesta mesma sessão). Duas correções feitas na
 * verificação: (1) P classe de argila 1, faixa "Alto" — a pesquisa inicial
 * tinha "9,1-12,0", o manual oficial (Tabela 6.4, p.93) diz "9,1-18,0"; (2)
 * CTCpH7,0 — a pesquisa usou a edição de 2004 (3 classes) por não ter
 * encontrado a tabela em 2016, mas ela existe (Tabela 6.1, p.91, 4 classes:
 * Baixa/Média/Alta/Muito alta, com os mesmos cortes 7,5/15,0/30,0 usados na
 * tabela de potássio -- confirma consistência interna).
 *
 * NÃO INCLUÍDOS aqui (de propósito): pH, V% (saturação por bases) e m%
 * (saturação por alumínio) como faixas fixas -- a edição 2016 não publica
 * mais essas três como tabela de classificação; usa índice SMP + pH de
 * referência por cultura (soja = 6,0) para calcular dose de calcário
 * diretamente (Tabela 5.2), e trata V%/m% como critério auxiliar de decisão
 * (corrigir quando pH<5,5 e V%<65% e m%>10%), não como rótulo de faixa. Isso
 * exige lógica de cálculo, não uma faixa estática -- fica para quando o
 * motor ganhar suporte a parâmetro derivado (mesma pendência do P-rem que o
 * Rafael sugeriu). H+Al e Fe (para soja) também ficam de fora pelo mesmo
 * motivo já registrado na pesquisa: não são classificáveis isoladamente.
 *
 * TUDO aqui nasce DRAFT. O motor determinístico (src/domain/agronomic-engine.ts)
 * ignora parâmetro DRAFT -- nenhuma análise real é afetada até um agrônomo
 * responsável revisar e promover para ACTIVE (setCropProfileParameterStatus).
 */

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

const SOURCE_2016 = "Manual de Calagem e Adubação para os Estados do Rio Grande do Sul e de Santa Catarina, 11ª ed. (2016)";
const INSTITUTION = "CQFS-RS/SC - SBCS Núcleo Regional Sul";

const PARAMETERS = [
  {
    parameterCode: "MO", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Oxidação sulfocrômica"], unitExpected: "%",
    sufficiencyRanges: [{ label: "Baixo", max: 2.5 }, { label: "Médio", min: 2.6, max: 5.0 }, { label: "Alto", min: 5.0 }],
    criticality: "MEDIA",
    technicalNotes: `Fonte: ${SOURCE_2016}, Tabela 6.1, p.91. Verificado contra o PDF oficial em 2026-09-04.`,
  },
  {
    parameterCode: "CTC", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Calculado: CTCpH7,0 = Ca + Mg + K + (H+Al)"], unitExpected: "cmolc/dm³",
    sufficiencyRanges: [{ label: "Baixa", max: 7.5 }, { label: "Média", min: 7.6, max: 15.0 }, { label: "Alta", min: 15.1, max: 30.0 }, { label: "Muito alta", min: 30.0 }],
    criticality: "BAIXA",
    technicalNotes: `Fonte: ${SOURCE_2016}, Tabela 6.1, p.91. CORRIGIDO na verificação: a pesquisa inicial usou a edição 2004 (3 classes, cortes 5,0/15,0) por não ter localizado a tabela em 2016 -- ela existe e usa 4 classes com cortes 7,5/15,0/30,0, os mesmos usados na tabela de potássio (Tabela 6.9). Verificado contra o PDF oficial em 2026-09-04.`,
  },
  {
    parameterCode: "P", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    conditionParameterCode: "CLAY", conditionMin: 60.0001, conditionMax: null,
    sufficiencyRanges: [{ label: "Muito Baixo", max: 3.0 }, { label: "Baixo", min: 3.1, max: 6.0 }, { label: "Médio", min: 6.1, max: 9.0 }, { label: "Alto", min: 9.1, max: 18.0 }, { label: "Muito Alto", min: 18.0 }],
    criticality: "ALTA",
    technicalNotes: `Fonte: ${SOURCE_2016}, Tabela 6.4, p.93 -- Grupo 2 (culturas de grãos, exceto arroz irrigado), classe de argila 1 (>60%). CORRIGIDO na verificação: a pesquisa inicial tinha a faixa "Alto" como 9,1-12,0; o manual oficial diz 9,1-18,0. DIVERGE do valor que o Rafael Cabeda enviou (fonte "Embrapa, 2013"; classe <15% argila: Alto 18,1-25,0) -- tabelas de fontes e classes de argila diferentes, não diretamente comparáveis célula a célula; para lavoura em RS/SC, CQFS-RS/SC é a referência regional oficial. Verificado contra o PDF oficial em 2026-09-04.`,
  },
  {
    parameterCode: "P", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    conditionParameterCode: "CLAY", conditionMin: 41, conditionMax: 60,
    sufficiencyRanges: [{ label: "Muito Baixo", max: 4.0 }, { label: "Baixo", min: 4.1, max: 8.0 }, { label: "Médio", min: 8.1, max: 12.0 }, { label: "Alto", min: 12.1, max: 24.0 }, { label: "Muito Alto", min: 24.0 }],
    criticality: "ALTA",
    technicalNotes: `Fonte: ${SOURCE_2016}, Tabela 6.4, p.93 -- Grupo 2, classe de argila 2 (60-41%). Verificado contra o PDF oficial em 2026-09-04.`,
  },
  {
    parameterCode: "P", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    conditionParameterCode: "CLAY", conditionMin: 21, conditionMax: 40,
    sufficiencyRanges: [{ label: "Muito Baixo", max: 6.0 }, { label: "Baixo", min: 6.1, max: 12.0 }, { label: "Médio", min: 12.1, max: 18.0 }, { label: "Alto", min: 18.1, max: 36.0 }, { label: "Muito Alto", min: 36.0 }],
    criticality: "ALTA",
    technicalNotes: `Fonte: ${SOURCE_2016}, Tabela 6.4, p.93 -- Grupo 2, classe de argila 3 (40-21%). Verificado contra o PDF oficial em 2026-09-04.`,
  },
  {
    parameterCode: "P", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    conditionParameterCode: "CLAY", conditionMin: 0, conditionMax: 20,
    sufficiencyRanges: [{ label: "Muito Baixo", max: 10.0 }, { label: "Baixo", min: 10.1, max: 20.0 }, { label: "Médio", min: 20.1, max: 30.0 }, { label: "Alto", min: 30.1, max: 60.0 }, { label: "Muito Alto", min: 60.0 }],
    criticality: "ALTA",
    technicalNotes: `Fonte: ${SOURCE_2016}, Tabela 6.4, p.93 -- Grupo 2, classe de argila 4 (<=20%). Verificado contra o PDF oficial em 2026-09-04.`,
  },
  {
    parameterCode: "K", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    conditionParameterCode: "CTC", conditionMin: 0, conditionMax: 7.5,
    sufficiencyRanges: [{ label: "Muito Baixo", max: 20 }, { label: "Baixo", min: 21, max: 40 }, { label: "Médio", min: 41, max: 60 }, { label: "Alto", min: 61, max: 120 }, { label: "Muito Alto", min: 120 }],
    criticality: "ALTA",
    technicalNotes: `Fonte: ${SOURCE_2016}, Tabela 6.9, p.95-96 -- Grupo 2 (culturas de grãos), CTCpH7,0 <= 7,5 cmolc/dm³. Verificado contra o PDF oficial em 2026-09-04.`,
  },
  {
    parameterCode: "K", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    conditionParameterCode: "CTC", conditionMin: 7.6, conditionMax: 15.0,
    sufficiencyRanges: [{ label: "Muito Baixo", max: 30 }, { label: "Baixo", min: 31, max: 60 }, { label: "Médio", min: 61, max: 90 }, { label: "Alto", min: 91, max: 180 }, { label: "Muito Alto", min: 180 }],
    criticality: "ALTA",
    technicalNotes: `Fonte: ${SOURCE_2016}, Tabela 6.9, p.95-96 -- Grupo 2, CTCpH7,0 7,6 a 15,0 cmolc/dm³. Verificado contra o PDF oficial em 2026-09-04.`,
  },
  {
    parameterCode: "K", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    conditionParameterCode: "CTC", conditionMin: 15.1, conditionMax: 30.0,
    sufficiencyRanges: [{ label: "Muito Baixo", max: 40 }, { label: "Baixo", min: 41, max: 80 }, { label: "Médio", min: 81, max: 120 }, { label: "Alto", min: 121, max: 240 }, { label: "Muito Alto", min: 240 }],
    criticality: "ALTA",
    technicalNotes: `Fonte: ${SOURCE_2016}, Tabela 6.9, p.95-96 -- Grupo 2, CTCpH7,0 15,1 a 30,0 cmolc/dm³. Verificado contra o PDF oficial em 2026-09-04.`,
  },
  {
    parameterCode: "K", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    conditionParameterCode: "CTC", conditionMin: 30.0001, conditionMax: null,
    sufficiencyRanges: [{ label: "Muito Baixo", max: 45 }, { label: "Baixo", min: 46, max: 90 }, { label: "Médio", min: 91, max: 135 }, { label: "Alto", min: 136, max: 270 }, { label: "Muito Alto", min: 270 }],
    criticality: "ALTA",
    technicalNotes: `Fonte: ${SOURCE_2016}, Tabela 6.9, p.95-96 -- Grupo 2, CTCpH7,0 > 30,0 cmolc/dm³. Verificado contra o PDF oficial em 2026-09-04.`,
  },
  {
    parameterCode: "CA", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["KCl 1 mol/L"], unitExpected: "cmolc/dm³",
    sufficiencyRanges: [{ label: "Baixo", max: 2.0 }, { label: "Médio", min: 2.0, max: 4.0 }, { label: "Alto", min: 4.0 }],
    criticality: "MEDIA",
    technicalNotes: `Fonte: ${SOURCE_2016}, Tabela 6.11, p.97. Verificado contra o PDF oficial em 2026-09-04.`,
  },
  {
    parameterCode: "MG", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["KCl 1 mol/L"], unitExpected: "cmolc/dm³",
    sufficiencyRanges: [{ label: "Baixo", max: 0.5 }, { label: "Médio", min: 0.5, max: 1.0 }, { label: "Alto", min: 1.0 }],
    criticality: "MEDIA",
    technicalNotes: `Fonte: ${SOURCE_2016}, Tabela 6.11, p.97. Verificado contra o PDF oficial em 2026-09-04.`,
  },
  {
    parameterCode: "S", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Ca(H2PO4)2 500mg P/L, turbidimetria"], unitExpected: "mg/dm³",
    sufficiencyRanges: [{ label: "Baixo", max: 2.0 }, { label: "Médio", min: 2.0, max: 5.0 }, { label: "Alto", min: 10.0 }],
    criticality: "MEDIA",
    technicalNotes: `Fonte: ${SOURCE_2016}, Tabela 6.11, p.97, incl. nota (1). Soja é leguminosa -> grupo mais exigente em S: teor crítico "Alto" = 10 mg/dm³ (não 5, que vale pra demais culturas). A camada 10-20cm pode subir o teor de S em plantio direto -- um laudo só 0-20cm pode subdiagnosticar deficiência; um laudo só 0-10cm pode superdiagnosticar. Verificado contra o PDF oficial em 2026-09-04.`,
  },
  {
    parameterCode: "B", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Água quente, colorimetria com curcumina"], unitExpected: "mg/dm³",
    sufficiencyRanges: [{ label: "Baixo", max: 0.1 }, { label: "Médio", min: 0.2, max: 0.3 }, { label: "Alto", min: 0.3 }],
    criticality: "BAIXA",
    technicalNotes: `Fonte: ${SOURCE_2016}, Tabela 6.12, p.98. Raramente há deficiência de micronutrientes em RS/SC; maior chance em solo arenoso com MO baixa e/ou pH muito baixo (B). Verificado contra o PDF oficial em 2026-09-04.`,
  },
  {
    parameterCode: "CU", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    sufficiencyRanges: [{ label: "Baixo", max: 0.2 }, { label: "Médio", min: 0.2, max: 0.4 }, { label: "Alto", min: 0.4 }],
    criticality: "BAIXA",
    technicalNotes: `Fonte: ${SOURCE_2016}, Tabela 6.12, p.98. Nota: o extrator de Cu/Zn mudou entre 2004 (HCl 0,1mol/L) e 2016 (Mehlich-1, valores ~30% menores que HCl) -- não aceitar laudo antigo com extrator HCl nesta faixa sem conversão. Verificado contra o PDF oficial em 2026-09-04.`,
  },
  {
    parameterCode: "ZN", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    sufficiencyRanges: [{ label: "Baixo", max: 0.2 }, { label: "Médio", min: 0.2, max: 0.5 }, { label: "Alto", min: 0.5 }],
    criticality: "BAIXA",
    technicalNotes: `Fonte: ${SOURCE_2016}, Tabela 6.12, p.98. Mesma ressalva de extrator do Cu (ver notas de CU). Verificado contra o PDF oficial em 2026-09-04.`,
  },
  {
    parameterCode: "MN", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["KCl 1 mol/L (acidificado com HCl 2%)"], unitExpected: "mg/dm³",
    sufficiencyRanges: [{ label: "Baixo", max: 2.5 }, { label: "Médio", min: 2.5, max: 5.0 }, { label: "Alto", min: 5.0 }],
    criticality: "BAIXA",
    technicalNotes: `Fonte: ${SOURCE_2016}, Tabela 6.12, p.98. Nota: extrator mudou de Mehlich-1 (2004) para KCl 1mol/L (2016) -- não misturar laudo antigo sem checar. Verificado contra o PDF oficial em 2026-09-04.`,
  },
];

const SOURCE_CONTENT = `O Manual de Calagem e Adubação para os Estados do Rio Grande do Sul e de Santa Catarina (11ª ed., 2016), publicado pela Comissão de Química e Fertilidade do Solo do Núcleo Regional Sul da SBCS, é a referência técnica oficial para interpretação de análise de solo e recomendação de calagem/adubação nesses dois estados. Para soja (Grupo 2 de exigência em P e K), o fósforo é interpretado pelo método Mehlich-1 em função da classe de argila do solo (4 classes), e o potássio em função da CTC a pH 7,0 (4 faixas). Cálcio, magnésio e enxofre têm faixas próprias (soja, como leguminosa, tem teor crítico de enxofre mais alto que a média: 10 mg/dm³). Os micronutrientes (B, Cu, Zn, Mn) raramente limitam a produtividade nos solos do RS/SC, exceto em condições específicas (solo arenoso, MO baixa, pH extremo). A partir da edição 2016, a correção da acidez do solo (calagem) não usa mais faixas fixas de pH/saturação por bases: usa o índice SMP para estimar diretamente a dose de calcário necessária para atingir o pH de referência de cada cultura (soja = 6,0), com saturação por bases (V%) e saturação por alumínio (m%) como critérios auxiliares de decisão, não como rótulo de faixa isolado.`;

async function main() {
  const cropResult = await pool.query("SELECT id::text FROM crop_profiles WHERE code = 'SOJA'");
  const cropProfileId = cropResult.rows[0]?.id;
  if (!cropProfileId) throw new Error("crop_profile SOJA não encontrado -- rode as migrations/seed antes.");

  console.log(`crop_profile SOJA: ${cropProfileId}`);

  // Apaga qualquer linha anterior destes parâmetros para esta cultura antes de
  // reinserir -- mais simples e mais seguro que ON CONFLICT aqui, porque
  // condition_min/condition_max fazem parte da constraint única e são NULL
  // na maioria das linhas (e NULL nunca "colide" com NULL em constraint
  // única do Postgres, então ON CONFLICT não pegaria reexecução limpa para
  // os parâmetros sem condição). Seguro: script mexe só nos parâmetros que
  // ele mesmo define, tudo aqui nasce DRAFT (motor ignora DRAFT).
  const codes = [...new Set(PARAMETERS.map((p) => p.parameterCode))];
  await pool.query(
    `DELETE FROM crop_profile_parameters WHERE crop_profile_id = $1::uuid AND parameter_code = ANY($2::text[])`,
    [cropProfileId, codes],
  );

  for (const p of PARAMETERS) {
    const result = await pool.query(
      `INSERT INTO crop_profile_parameters
       (crop_profile_id, parameter_code, parameter_category, depth_from_cm, depth_to_cm, analytical_method_allowed, unit_expected, sufficiency_ranges, criticality, technical_notes, condition_parameter_code, condition_min, condition_max)
       VALUES ($1::uuid, $2, $3::lab_parameter_category, $4, $5, $6::text[], $7, $8::jsonb, $9::parameter_criticality, $10, $11, $12, $13)
       RETURNING id::text, parameter_code, status`,
      [
        cropProfileId, p.parameterCode, p.parameterCategory, p.depthFromCm, p.depthToCm, p.analyticalMethodAllowed,
        p.unitExpected, JSON.stringify(p.sufficiencyRanges), p.criticality, p.technicalNotes,
        p.conditionParameterCode ?? null, p.conditionMin ?? null, p.conditionMax ?? null,
      ],
    );
    console.log(`  ${result.rows[0].parameter_code} -> ${result.rows[0].status} (${result.rows[0].id})`);
  }

  await pool.query(`DELETE FROM technical_sources WHERE crop_profile_id = $1::uuid AND title = $2`, [cropProfileId, SOURCE_2016]);
  const sourceResult = await pool.query(
    `INSERT INTO technical_sources (title, institution, edition_year, crop_profile_id, region_code, content)
     VALUES ($1, $2, $3, $4::uuid, $5, $6)
     RETURNING id::text, title, status`,
    [SOURCE_2016, INSTITUTION, 2016, cropProfileId, null, SOURCE_CONTENT],
  );
  console.log(`technical_source -> ${sourceResult.rows[0].status} (${sourceResult.rows[0].id})`);
}

main().finally(() => pool.end());
