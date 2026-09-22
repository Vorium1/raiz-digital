/**
 * Matriz de cobertura da base técnica RAIZ.
 *
 * As áreas abaixo seguem a formação típica de Agronomia e especializações correlatas.
 * Elas orientam O QUE a pesquisa periódica precisa cobrir. Não são, por si, fonte de dose,
 * faixa, limiar ou recomendação quantitativa.
 */
export const AGRONOMY_KNOWLEDGE_DOMAINS = Object.freeze([
  {
    code: "SOIL_SCIENCE",
    label: "Ciência do solo",
    topics: ["pedologia", "gênese e classificação de solos", "física do solo", "química do solo", "biologia do solo"],
  },
  {
    code: "SOIL_FERTILITY",
    label: "Fertilidade e nutrição mineral",
    topics: ["calagem", "gessagem", "adubação", "fertilidade", "nutrição mineral", "diagnóstico foliar"],
  },
  {
    code: "PLANT_PHYSIOLOGY",
    label: "Fisiologia e ecofisiologia vegetal",
    topics: ["crescimento", "desenvolvimento", "estresse abiótico", "relações hídricas", "fotossíntese"],
  },
  {
    code: "PHYTOPATHOLOGY",
    label: "Fitopatologia",
    topics: ["etiologia", "epidemiologia", "diagnóstico", "doenças fúngicas", "bacterianas", "virais", "manejo integrado"],
  },
  {
    code: "ENTOMOLOGY",
    label: "Entomologia agrícola",
    topics: ["pragas", "nível de ação", "monitoramento", "manejo integrado de pragas", "inimigos naturais"],
  },
  {
    code: "WEED_SCIENCE",
    label: "Plantas daninhas",
    topics: ["identificação", "competição", "resistência", "manejo integrado", "herbologia"],
  },
  {
    code: "CROP_PRODUCTION",
    label: "Produção vegetal",
    topics: ["culturas de verão", "culturas de inverno", "implantação", "população", "rotação", "sistemas de cultivo"],
  },
  {
    code: "SEEDS_GENETICS",
    label: "Sementes, genética e melhoramento",
    topics: ["qualidade de sementes", "cultivares", "genética", "melhoramento", "interação genótipo ambiente"],
  },
  {
    code: "AGROMETEOROLOGY_WATER",
    label: "Agrometeorologia e água",
    topics: ["clima", "balanço hídrico", "evapotranspiração", "irrigação", "drenagem", "risco climático"],
  },
  {
    code: "AGRICULTURAL_ENGINEERING",
    label: "Máquinas e mecanização",
    topics: ["semeadura", "pulverização", "aplicação de insumos", "regulagem", "tráfego", "compactação"],
  },
  {
    code: "GEOMATICS",
    label: "Topografia, geoprocessamento e sensoriamento remoto",
    topics: ["geodésia", "SIG", "sensoriamento remoto", "agricultura de precisão", "NDVI", "geoestatística"],
  },
  {
    code: "MICROBIOLOGY",
    label: "Microbiologia agrícola",
    topics: ["microbiologia do solo", "fixação biológica de nitrogênio", "inoculação", "micorrizas", "biológicos"],
  },
  {
    code: "CONSERVATION",
    label: "Conservação do solo e da água",
    topics: ["erosão", "cobertura", "estrutura", "infiltração", "plantio direto", "manejo conservacionista"],
  },
  {
    code: "POSTHARVEST",
    label: "Pós-colheita e qualidade",
    topics: ["armazenamento", "beneficiamento", "qualidade de grãos", "perdas pós-colheita"],
  },
] as const);

export const AGRONOMY_KNOWLEDGE_COVERAGE_TEXT = AGRONOMY_KNOWLEDGE_DOMAINS
  .map((domain) => `${domain.label}: ${domain.topics.join(", ")}`)
  .join("\n");

/**
 * Regra editorial para os provedores de pesquisa.
 * Currículo define cobertura; fonte primária/secundária forte define conteúdo técnico.
 */
export const AGRONOMY_RESEARCH_POLICY = Object.freeze({
  curriculumDefinesCoverageNotDose: true,
  sourceIdentityRequiredForAutomaticActivation: true,
  independentProviderAgreementRequired: 2,
  quantitativeRulesRequireDeterministicImplementation: true,
});
