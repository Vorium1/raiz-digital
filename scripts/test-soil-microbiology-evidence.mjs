import assert from "node:assert/strict";
import {
  evaluateSoilMicrobiologyEvidence,
  NATIONAL_SOIL_BIOLOGY_METHOD_REFERENCES,
} from "../src/domain/soil-microbiology-evidence.ts";

const none = evaluateSoilMicrobiologyEvidence({ observations: [] });
assert.equal(none.hasMicrobiologyEvidence, false);
assert.equal(none.agronomicPolicy.missingMicrobiologyBlocksAnalysis, false);
assert.equal(none.agronomicPolicy.missingMicrobiologyBlocksOfficialReport, false);

const functional = evaluateSoilMicrobiologyEvidence({
  cropCode: "MILHO",
  regionCode: "RS",
  observations: [
    {
      parameterName: "Azospirillum brasilense",
      family: "FUNCTIONAL_MICROORGANISM",
      functionalRole: "BIOLOGICAL_N_FIXATION",
      organismOrTaxon: "Azospirillum brasilense",
      value: 4.2e5,
      unit: "UFC/g solo",
      methodFamily: "CULTURE_COUNT_CFU",
      methodText: "contagem em meio seletivo",
      protocolText: "método informado pelo laboratório",
    },
    {
      parameterName: "Bactérias solubilizadoras de fósforo",
      family: "FUNCTIONAL_MICROORGANISM",
      functionalRole: "PHOSPHORUS_SOLUBILIZATION",
      organismOrTaxon: null,
      value: 1.1e4,
      unit: "UFC/g solo",
      methodFamily: "CULTURE_COUNT_CFU",
      methodText: "contagem funcional informada pelo laboratório",
    },
  ],
});
assert.equal(functional.hasMicrobiologyEvidence, true);
assert.ok(functional.detectedFunctionalRoles.includes("BIOLOGICAL_N_FIXATION"));
assert.ok(functional.detectedFunctionalRoles.includes("PHOSPHORUS_SOLUBILIZATION"));
assert.equal(functional.agronomicPolicy.automaticNutrientCreditAllowed, false);
assert.equal(functional.agronomicPolicy.automaticDoseAdjustmentAllowed, false);
assert.equal(functional.interpretationPolicy.abundanceIsNotFieldNutrientFlux, true);

const qPCR = evaluateSoilMicrobiologyEvidence({
  observations: [{
    parameterName: "Bradyrhizobium spp.",
    family: "MOLECULAR_COMMUNITY_PROFILE",
    functionalRole: "BIOLOGICAL_N_FIXATION",
    organismOrTaxon: "Bradyrhizobium spp.",
    value: 2.3e6,
    unit: "cópias gene/g solo",
    methodFamily: "QPCR",
    methodText: "qPCR",
  }],
});
assert.equal(qPCR.interpretationPolicy.molecularPresenceIsNotAutomaticActivityProof, true);
assert.equal(qPCR.agronomicPolicy.automaticNutrientCreditAllowed, false);

const unknownMethod = evaluateSoilMicrobiologyEvidence({
  observations: [{
    parameterName: "Solubilizadores de potássio",
    family: "FUNCTIONAL_MICROORGANISM",
    functionalRole: "POTASSIUM_SOLUBILIZATION",
    value: 1200,
    unit: "UFC/g",
    methodFamily: "UNKNOWN",
    methodText: null,
  }],
});
assert.ok(unknownMethod.warnings.includes("MICROBIOLOGY_METHOD_NOT_EXPLICIT"));
assert.equal(unknownMethod.agronomicPolicy.missingMicrobiologyBlocksAnalysis, false);

const wrongMycorrhizaMatrix = evaluateSoilMicrobiologyEvidence({
  observations: [{
    parameterName: "Colonização micorrízica",
    family: "MYCORRHIZA",
    sampleMatrix: "SOIL",
    functionalRole: "MYCORRHIZAL_P_UPTAKE",
    value: 55,
    unit: "%",
    methodFamily: "MYCORRHIZAL_COLONIZATION",
    methodText: "Coloração e microscopia de raízes",
  }],
});
assert.ok(wrongMycorrhizaMatrix.warnings.includes("MYCORRHIZAL_COLONIZATION_REQUIRES_ROOT_MATRIX"));

const wrongSporeMatrix = evaluateSoilMicrobiologyEvidence({
  observations: [{
    parameterName: "Esporos micorrízicos",
    family: "MYCORRHIZA",
    sampleMatrix: "ROOT",
    functionalRole: "MYCORRHIZAL_P_UPTAKE",
    value: 180,
    unit: "esporos/50 g solo",
    methodFamily: "SPORE_COUNT",
    methodText: "Contagem de esporos",
  }],
});
assert.ok(wrongSporeMatrix.warnings.includes("MYCORRHIZAL_SPORE_COUNT_REQUIRES_SOIL_MATRIX"));

assert.deepEqual(
  NATIONAL_SOIL_BIOLOGY_METHOD_REFERENCES.BIOAS_EMBRAPA.standardSamplingDepthCm,
  { from: 0, to: 10 },
);
assert.equal(
  NATIONAL_SOIL_BIOLOGY_METHOD_REFERENCES.MAPA_INOCULANT_OFFICIAL_METHODS.nutrientDoseCreditAllowedByMethodAlone,
  false,
);
assert.equal(
  NATIONAL_SOIL_BIOLOGY_METHOD_REFERENCES.MICROBIAL_BIOMASS_C_FUMIGATION_EXTRACTION.methodFamily,
  "MICROBIAL_BIOMASS_C",
);
assert.equal(
  NATIONAL_SOIL_BIOLOGY_METHOD_REFERENCES.BASAL_RESPIRATION_AND_QCO2.nutrientDoseCreditAllowedByMethodAlone,
  false,
);
assert.equal(
  NATIONAL_SOIL_BIOLOGY_METHOD_REFERENCES.FDA_HYDROLYSIS.methodFamily,
  "FDA_HYDROLYSIS",
);
assert.equal(
  NATIONAL_SOIL_BIOLOGY_METHOD_REFERENCES.PHOSPHATASE_ACTIVITY.nutrientDoseCreditAllowedByMethodAlone,
  false,
);

console.log("soil-microbiology-evidence: microbiologia funcional opcional e firewall de crédito nutricional validados");
