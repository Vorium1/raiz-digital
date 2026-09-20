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
  },
];
