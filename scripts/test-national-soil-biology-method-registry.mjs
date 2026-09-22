import assert from "node:assert/strict";
import {
  NATIONAL_SOIL_BIOLOGY_METHOD_REGISTRY,
  assessNationalSoilBiologyMethodContext,
  canCompareSoilBiologyObservations,
} from "../src/domain/national-soil-biology-method-registry.ts";

const bioas=assessNationalSoilBiologyMethodContext({
  methodId:"BIOAS_BETA_GLUCOSIDASE",
  sampleMatrix:"SOIL",
  unit:"mg p-nitrofenol kg⁻¹ solo h⁻¹",
  protocolText:"BioAS Embrapa — protocolo informado pelo laboratório",
  depthFromCm:0,
  depthToCm:10,
});
assert.equal(bioas.compatible,true);
assert.equal(bioas.method.maturity,"NATIONAL_ROUTINE_TECHNOLOGY");
assert.equal(bioas.automaticNutrientCreditAllowed,false);
assert.equal(bioas.directNationalThresholdInterpretationAllowed,false);
assert.deepEqual(bioas.warnings,[]);

const bioasWrongDepth=assessNationalSoilBiologyMethodContext({
  methodId:"BIOAS_ARYLSULFATASE",
  sampleMatrix:"SOIL",
  unit:"mg p-nitrofenol kg⁻¹ solo h⁻¹",
  protocolText:"BioAS",
  depthFromCm:0,
  depthToCm:20,
});
assert.ok(bioasWrongDepth.warnings.includes("SOIL_BIOLOGY_DEPTH_DIFFERS_FROM_METHOD_STANDARD"));

const biomass=assessNationalSoilBiologyMethodContext({
  methodId:"MICROBIAL_BIOMASS_C_FUMIGATION_EXTRACTION",
  sampleMatrix:"SOIL",
  unit:"mg C/kg solo",
  protocolText:"Fumigação-extração; K2SO4; fator kEC informado",
});
assert.equal(biomass.method.maturity,"EMBRAPA_REFERENCE_PROTOCOL");
assert.equal(biomass.method.universalNationalInterpretiveThresholdsAvailable,false);
assert.equal(biomass.crossProtocolNumericComparisonAllowed,false);

const bmsN=assessNationalSoilBiologyMethodContext({
  methodId:"MICROBIAL_BIOMASS_N_FUMIGATION_EXTRACTION",
  sampleMatrix:"SOIL",
  unit:"mg N/kg solo",
  protocolText:"Fumigação-extração; protocolo informado",
});
assert.equal(bmsN.method.label.startsWith("Nitrogênio"),true);
assert.equal(bmsN.automaticNutrientCreditAllowed,false);

const respirationMissingProtocol=assessNationalSoilBiologyMethodContext({
  methodId:"BASAL_RESPIRATION",
  sampleMatrix:"SOIL",
  unit:"mg C-CO2 kg-1 solo dia-1",
});
assert.ok(respirationMissingProtocol.warnings.includes("SOIL_BIOLOGY_PROTOCOL_REQUIRED_FOR_INTERPRETATION"));

const mycorrhizaWrongMatrix=assessNationalSoilBiologyMethodContext({
  methodId:"MYCORRHIZAL_ROOT_COLONIZATION",
  sampleMatrix:"SOIL",
  unit:"%",
  protocolText:"Coloração e avaliação microscópica",
});
assert.equal(mycorrhizaWrongMatrix.compatible,false);
assert.ok(mycorrhizaWrongMatrix.warnings.includes("SOIL_BIOLOGY_SAMPLE_MATRIX_MISMATCH"));

const inoculant=assessNationalSoilBiologyMethodContext({
  methodId:"MAPA_INOCULANT_COUNT_IDENTIFICATION_PURITY",
  sampleMatrix:"INOCULANT_PRODUCT",
  unit:"UFC/mL",
  protocolText:"IN MAPA 30/2010",
});
assert.equal(inoculant.method.maturity,"MAPA_OFFICIAL_PRODUCT_CONTROL");
assert.equal(inoculant.automaticNutrientCreditAllowed,false);

const sameProtocol=canCompareSoilBiologyObservations({
  left:{
    methodId:"BASAL_RESPIRATION",sampleMatrix:"SOIL",
    unit:"mg C-CO2 kg-1 solo dia-1",protocolText:"PROTOCOLO A",
  },
  right:{
    methodId:"BASAL_RESPIRATION",sampleMatrix:"SOIL",
    unit:"mg C-CO2 kg-1 solo dia-1",protocolText:"PROTOCOLO A",
  },
});
assert.equal(sameProtocol.comparable,true);

const differentProtocol=canCompareSoilBiologyObservations({
  left:{
    methodId:"BASAL_RESPIRATION",sampleMatrix:"SOIL",
    unit:"mg C-CO2 kg-1 solo dia-1",protocolText:"PROTOCOLO A",
  },
  right:{
    methodId:"BASAL_RESPIRATION",sampleMatrix:"SOIL",
    unit:"mg C-CO2 kg-1 solo dia-1",protocolText:"PROTOCOLO B",
  },
});
assert.equal(differentProtocol.comparable,false);
assert.equal(differentProtocol.reason,"PROTOCOL_IDENTITY_REQUIRED");

const differentUnits=canCompareSoilBiologyObservations({
  left:{
    methodId:"MICROBIAL_BIOMASS_C_FUMIGATION_EXTRACTION",sampleMatrix:"SOIL",
    unit:"mg C/kg solo",protocolText:"PROTOCOLO A",
  },
  right:{
    methodId:"MICROBIAL_BIOMASS_C_FUMIGATION_EXTRACTION",sampleMatrix:"SOIL",
    unit:"µg C/g solo",protocolText:"PROTOCOLO A",
  },
});
assert.equal(differentUnits.comparable,false);
assert.equal(differentUnits.reason,"UNIT_MISMATCH");

const molecular=NATIONAL_SOIL_BIOLOGY_METHOD_REGISTRY.METABARCODING_16S;
assert.equal(molecular.maturity,"RESEARCH_OR_LAB_SPECIFIC");
assert.equal(molecular.universalNationalInterpretiveThresholdsAvailable,false);
assert.equal(molecular.automaticNutrientCreditAllowed,false);

console.log("national-soil-biology-method-registry: maturidade, matriz, profundidade e comparabilidade validadas");
