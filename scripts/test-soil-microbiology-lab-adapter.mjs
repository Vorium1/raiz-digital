import assert from "node:assert/strict";
import { adaptLabResultsToSoilMicrobiology } from "../src/domain/soil-microbiology-lab-adapter.ts";

const observations = adaptLabResultsToSoilMicrobiology([
  {
    sampleCode: "A1",
    parameterCode: "BIOAS_BETA_GLUCOSIDASE",
    value: 152,
    unit: "mg p-nitrofenol kg-1 solo h-1",
    method: "BioAS Embrapa — atividade enzimática",
    depthFromCm: 0,
    depthToCm: 10,
  },
  {
    sampleCode: "A1",
    parameterCode: "BIOAS_ARYLSULFATASE",
    value: 158,
    unit: "mg p-nitrofenol kg-1 solo h-1",
    method: "BioAS Embrapa — atividade enzimática",
    depthFromCm: 0,
    depthToCm: 10,
  },
  {
    sampleCode: "A1",
    parameterCode: "MICROBIO_BIOMASS_C",
    value: 315,
    unit: "mg C/kg solo",
    method: "Fumigação-extração",
  },
  {
    sampleCode: "A1",
    parameterCode: "MICROBIO_BIOMASS_N",
    value: 28,
    unit: "mg N/kg solo",
    method: "Fumigação-extração",
  },
  {
    sampleCode: "A1",
    parameterCode: "MICROBIO_BASAL_RESPIRATION",
    value: 42,
    unit: "mg C-CO2 kg-1 solo dia-1",
    method: "Respiração basal em incubação estática",
  },
  {
    sampleCode: "A1",
    parameterCode: "MICROBIO_QCO2",
    value: 0.13,
    unit: "mg C-CO2 g-1 CBM h-1",
    method: "Calculado a partir de respiração e biomassa",
  },
  {
    sampleCode: "A1",
    parameterCode: "MICROBIO_FDA_HYDROLYSIS",
    value: 27,
    unit: "ug fluoresceina g-1 h-1",
    method: "Hidrólise FDA",
  },
  {
    sampleCode: "A1",
    parameterCode: "MICROBIO_ACID_PHOSPHATASE",
    value: 125,
    unit: "ug pNP g-1 h-1",
    method: "Atividade de fosfatase ácida",
  },
  {
    sampleCode: "A1",
    parameterCode: "AZOSPIRILLUMBRASILENSE",
    value: 420000,
    unit: "UFC/g solo",
    method: "Contagem em meio seletivo",
  },
  {
    sampleCode: "A1",
    parameterCode: "BACTERIASSOLUBILIZADORASDEFOSFORO",
    value: 11000,
    unit: "UFC/g solo",
    method: "Contagem funcional em meio seletivo",
  },
]);

assert.equal(observations.length, 10);

const beta = observations.find((item) => item.parameterName === "BIOAS_BETA_GLUCOSIDASE");
assert.equal(beta?.family, "BIOAS_SOIL_HEALTH");
assert.equal(beta?.functionalRole, "ORGANIC_MATTER_CYCLING");
assert.equal(beta?.methodFamily, "ENZYME_ACTIVITY");

const biomass = observations.find((item) => item.parameterName === "MICROBIO_BIOMASS_C");
assert.equal(biomass?.family, "MICROBIAL_BIOMASS");
assert.equal(biomass?.methodFamily, "MICROBIAL_BIOMASS_C");

const biomassN = observations.find((item) => item.parameterName === "MICROBIO_BIOMASS_N");
assert.equal(biomassN?.family, "MICROBIAL_BIOMASS");
assert.equal(biomassN?.methodFamily, "MICROBIAL_BIOMASS_N");

const qco2 = observations.find((item) => item.parameterName === "MICROBIO_QCO2");
assert.equal(qco2?.family, "SOIL_RESPIRATION");
assert.equal(qco2?.methodFamily, "METABOLIC_QUOTIENT_QCO2");

const phosphatase = observations.find((item) => item.parameterName === "MICROBIO_ACID_PHOSPHATASE");
assert.equal(phosphatase?.family, "SOIL_ENZYME_ACTIVITY");
assert.equal(phosphatase?.functionalRole, "PHOSPHORUS_CYCLING");
assert.equal(phosphatase?.methodFamily, "PHOSPHATASE_ACTIVITY");

const azospirillum = observations.find((item) => item.parameterName === "AZOSPIRILLUMBRASILENSE");
assert.equal(azospirillum?.functionalRole, "BIOLOGICAL_N_FIXATION");
assert.equal(azospirillum?.methodFamily, "CULTURE_COUNT_CFU");

const pSolubilizer = observations.find((item) => item.parameterName === "BACTERIASSOLUBILIZADORASDEFOSFORO");
assert.equal(pSolubilizer?.functionalRole, "PHOSPHORUS_SOLUBILIZATION");

const ignored = adaptLabResultsToSoilMicrobiology([
  {
    sampleCode: "A1",
    parameterCode: "P",
    value: 12,
    unit: "mg/dm3",
    method: "Mehlich-1",
  },
]);
assert.equal(ignored.length, 0);

console.log("soil-microbiology-lab-adapter: parâmetros biológicos canônicos e funcionais validados");
