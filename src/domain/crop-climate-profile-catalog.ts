import type { CropClimateProfile } from "./crop-climate-risk.ts";
import type { DiseaseClimateProfile } from "./crop-disease-climate-risk.ts";

/**
 * Catálogo inicial de perfis CLIMÁTICOS homologados.
 *
 * Estes perfis descrevem relações fisiológicas/climáticas e NÃO substituem ZARC,
 * previsão sazonal, balanço hídrico local ou manejo profissional. Novas culturas
 * entram apenas com fonte própria; nunca herdam perfil por analogia.
 */
export const HOMOLOGATED_CROP_CLIMATE_PROFILES: CropClimateProfile[] = [
  {
    id: "MILHO-BR-EMBRAPA-CLIMA",
    cropCode: "MILHO",
    region: { countryCode: "BR" },
    rules: [
      {
        hazard: "HOT_NIGHTS",
        stages: ["VEGETATIVE", "FLOWERING", "REPRODUCTIVE", "GRAIN_FILL"],
        impact: "ADVERSE",
        severity: "HIGH",
        rationale: "Temperaturas noturnas elevadas aumentam a respiração, consomem fotoassimilados e podem reduzir o rendimento de grãos.",
      },
      {
        hazard: "COLD_NIGHTS",
        stages: ["VEGETATIVE", "FLOWERING", "REPRODUCTIVE", "GRAIN_FILL"],
        impact: "ADVERSE",
        severity: "MEDIUM",
        rationale: "Noites muito frias reduzem atividade metabólica e podem prolongar o ciclo sem ganho automático de rendimento.",
      },
      {
        hazard: "LOW_RADIATION",
        stages: ["FLOWERING", "REPRODUCTIVE", "GRAIN_FILL"],
        impact: "ADVERSE",
        severity: "HIGH",
        rationale: "Baixa radiação próxima ao início reprodutivo reduz crescimento e formação/enchimento de grãos.",
      },
      {
        hazard: "WATER_DEFICIT",
        stages: ["FLOWERING", "REPRODUCTIVE", "GRAIN_FILL"],
        impact: "ADVERSE",
        severity: "HIGH",
        rationale: "Déficit hídrico em florescimento e enchimento reduz fotossíntese, polinização e translocação de assimilados.",
      },
      {
        hazard: "HEAT",
        stages: ["FLOWERING"],
        impact: "ADVERSE",
        severity: "HIGH",
        rationale: "Calor excessivo no florescimento pode reduzir viabilidade do pólen e comprometer a fecundação.",
      },
      {
        hazard: "LOW_SOIL_TEMPERATURE",
        stages: ["SOWING_EMERGENCE"],
        impact: "ADVERSE",
        severity: "MEDIUM",
        rationale: "Temperatura do solo muito baixa prejudica germinação e emergência.",
      },
      {
        hazard: "HIGH_SOIL_TEMPERATURE",
        stages: ["SOWING_EMERGENCE"],
        impact: "ADVERSE",
        severity: "MEDIUM",
        rationale: "Temperatura do solo excessiva pode prejudicar germinação e estabelecimento.",
      },
    ],
    source: {
      institution: "Embrapa Milho e Sorgo",
      title: "Relações com o clima — cultura do milho",
      locator: "temperatura, água, radiação solar/luminosidade e fases fenológicas",
    },
    status: "HOMOLOGATED",
  },
];

/**
 * Catálogo inicial de perfis de FAVORABILIDADE CLIMÁTICA de doenças.
 * Nenhum perfil confirma infecção ou autoriza fungicida isoladamente.
 */
export const HOMOLOGATED_DISEASE_CLIMATE_PROFILES: DiseaseClimateProfile[] = [
  {
    id: "SOJA-FERRUGEM-ASIATICA-BR-EMBRAPA",
    cropCode: "SOJA",
    diseaseCode: "FERRUGEM_ASIATICA",
    diseaseName: "Ferrugem-asiática da soja",
    region: { countryCode: "BR" },
    stages: ["VEGETATIVE", "FLOWERING", "REPRODUCTIVE", "GRAIN_FILL"],
    conditions: {
      temperatureC: { min: 18, max: 26 },
      leafWetnessHours: { min: 6 },
    },
    source: {
      institution: "Embrapa Soja",
      title: "500 Perguntas 500 Respostas — Soja",
      locator: "condições climáticas favoráveis à ferrugem-asiática",
    },
    status: "HOMOLOGATED",
  },
  {
    id: "TRIGO-BRUSONE-BR-EMBRAPA",
    cropCode: "TRIGO",
    diseaseCode: "BRUSONE",
    diseaseName: "Brusone do trigo",
    region: { countryCode: "BR", stateCodes: ["RS", "PR", "SP", "MS", "GO"] },
    stages: ["FLOWERING", "REPRODUCTIVE", "GRAIN_FILL"],
    conditions: {
      temperatureC: { min: 26, max: 30 },
      relativeHumidityPct: { min: 90 },
    },
    source: {
      institution: "Embrapa Trigo",
      title: "Doenças da espiga causam perda de rendimento em trigo",
      locator: "brusone: elevada umidade relativa e temperatura ao redor de 28 °C",
    },
    status: "HOMOLOGATED",
  },,
  {
    id: "TRIGO-GIBERELA-BR-EMBRAPA",
    cropCode: "TRIGO",
    diseaseCode: "GIBERELA",
    diseaseName: "Giberela do trigo",
    region: { countryCode: "BR" },
    stages: ["FLOWERING", "REPRODUCTIVE"],
    conditions: {
      temperatureC: { min: 20, max: 25 },
      continuousRainHours: { min: 48 },
    },
    source: {
      institution: "Embrapa Trigo",
      title: "Giberela — Agência de Informação Tecnológica",
      locator: "precipitação pluvial por no mínimo 48 horas consecutivas e temperatura de 20–25 °C",
    },
    status: "HOMOLOGATED",
  },
  {
    id: "MILHO-CERCOSPORIOSE-BR-EMBRAPA",
    cropCode: "MILHO",
    diseaseCode: "CERCOSPORIOSE",
    diseaseName: "Cercosporiose do milho",
    region: { countryCode: "BR" },
    stages: ["VEGETATIVE", "FLOWERING", "REPRODUCTIVE", "GRAIN_FILL"],
    conditions: {
      temperatureC: { min: 25, max: 30 },
      relativeHumidityPct: { min: 90 },
    },
    fieldContextConditions: {
      residueLevelIn: ["HIGH"],
      cropRotationBreak: false,
    },
    source: {
      institution: "Embrapa Milho e Sorgo",
      title: "Doenças foliares — Cercosporiose do milho",
      locator: "25–30 °C e umidade relativa superior a 90%; restos culturais e milho contínuo elevam inóculo",
    },
    status: "HOMOLOGATED",
  },
  {
    id: "MILHO-MANCHA-BRANCA-BR-EMBRAPA",
    cropCode: "MILHO",
    diseaseCode: "MANCHA_BRANCA",
    diseaseName: "Mancha branca do milho",
    region: { countryCode: "BR" },
    stages: ["FLOWERING", "REPRODUCTIVE", "GRAIN_FILL"],
    conditions: {
      nightTemperatureC: { min: 15, max: 20 },
      relativeHumidityPct: { min: 60 },
    },
    source: {
      institution: "Embrapa Milho e Sorgo",
      title: "Cultivo do Milho — Doenças",
      locator: "temperaturas noturnas de 15–20 °C, umidade relativa elevada (>60%) e elevada precipitação; maior severidade após florescimento",
    },
    status: "HOMOLOGATED",
  },
  {
    id: "ARROZ-BRUSONE-BR-EMBRAPA-CLIMA-TEMPERADO",
    cropCode: "ARROZ",
    diseaseCode: "BRUSONE",
    diseaseName: "Brusone do arroz",
    region: { countryCode: "BR" },
    stages: ["VEGETATIVE", "FLOWERING", "REPRODUCTIVE", "GRAIN_FILL"],
    conditions: {
      temperatureC: { min: 20, max: 30 },
      relativeHumidityPct: { min: 90 },
      lowRadiationRequired: true,
    },
    source: {
      institution: "Embrapa Clima Temperado",
      title: "Doenças da Cultura do Arroz Irrigado",
      locator: "20–30 °C (ótimo 26–28 °C), UR acima de 90% e maior nebulosidade/menor insolação favorecem brusone",
    },
    status: "HOMOLOGATED",
  },
  {
    id: "TOMATE-REQUEIMA-BR-EMBRAPA",
    cropCode: "TOMATE",
    diseaseCode: "REQUEIMA",
    diseaseName: "Requeima do tomateiro",
    region: { countryCode: "BR" },
    stages: ["TRANSPLANT_ESTABLISHMENT", "VEGETATIVE", "FLOWERING", "FRUIT_SET", "FRUIT_DEVELOPMENT", "RIPENING"],
    conditions: {
      temperatureC: { min: 14, max: 20 },
      leafWetnessHours: { min: 10 },
    },
    fieldContextConditions: {
      irrigationMethodIn: ["SPRINKLER", "CENTER_PIVOT", "MICROSPRINKLER"],
    },
    source: {
      institution: "Embrapa Hortaliças",
      title: "Produção Integrada de Tomate Tutorando — módulo de doenças e clima",
      locator: "14–20 °C e molhamento foliar superior a 10 horas favorecem requeima",
    },
    status: "HOMOLOGATED",
  },
  {
    id: "BATATA-REQUEIMA-BR-EMBRAPA",
    cropCode: "BATATA",
    diseaseCode: "REQUEIMA",
    diseaseName: "Requeima da batata",
    region: { countryCode: "BR" },
    stages: ["VEGETATIVE", "TUBER_INITIATION", "BULKING"],
    conditions: {
      temperatureC: { min: 15, max: 18 },
      relativeHumidityPct: { min: 90 },
    },
    source: {
      institution: "Embrapa Hortaliças",
      title: "Batata — Doenças fúngicas",
      locator: "15–18 °C e umidade relativa acima de 90% favorecem Phytophthora infestans",
    },
    status: "HOMOLOGATED",
  },
];
