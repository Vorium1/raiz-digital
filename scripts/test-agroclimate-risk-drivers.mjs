import assert from "node:assert/strict";
import { buildAgroclimateRiskDrivers } from "../src/domain/agroclimate-risk-drivers.ts";

const drivers = buildAgroclimateRiskDrivers({
  cropClimate: {
    status: "READY",
    cropCode: "MILHO",
    driver: "EL_NINO",
    appliesToPlannedCropWindow: true,
    riskClass: "ADVERSE",
    matchedProfileIds: ["MILHO-BR-EMBRAPA-CLIMA"],
    impacts: [
      {
        hazard: "HOT_NIGHTS",
        stage: "GRAIN_FILL",
        impact: "ADVERSE",
        severity: "HIGH",
        rationale: "Noites quentes elevam respiração e reduzem assimilados.",
        profileId: "MILHO-BR-EMBRAPA-CLIMA",
      },
      {
        hazard: "LOW_RADIATION",
        stage: "GRAIN_FILL",
        impact: "ADVERSE",
        severity: "MEDIUM",
        rationale: "Baixa radiação limita fotossíntese e enchimento.",
        profileId: "MILHO-BR-EMBRAPA-CLIMA",
      },
    ],
    warnings: [],
  },
  diseaseClimate: {
    status: "READY",
    cropCode: "MILHO",
    stage: "GRAIN_FILL",
    diseaseRisks: [
      {
        diseaseCode: "TEST_FUNGUS",
        diseaseName: "Doença fúngica de teste",
        profileId: "MILHO-DISEASE-TEST",
        climateFavorability: "HIGH",
        infectionConfirmed: false,
        pathogenPresenceStatus: "REGIONAL_ALERT",
        hostSusceptibility: "SUSCEPTIBLE",
        monitoringPriority: "HIGH",
        treatmentAutomaticallyAuthorized: false,
        matchedFactors: ["AIR_TEMPERATURE", "LEAF_WETNESS"],
        missingFactors: [],
        rationale: "Ambiente favorável, sem diagnóstico automático.",
      },
    ],
    warnings: ["DO_NOT_TRIGGER_FUNGICIDE_FROM_CLIMATE_ALONE"],
  },
});

assert.equal(drivers.length, 3);
assert.ok(drivers.some((item) =>
  item.kind === "TEMPERATURE"
  && item.code === "HOT_NIGHTS"
  && item.severity === "HIGH"
));
assert.ok(drivers.some((item) =>
  item.kind === "RADIATION"
  && item.code === "LOW_RADIATION"
));
const disease = drivers.find((item) => item.kind === "DISEASE");
assert.ok(disease);
assert.equal(disease.severity, "HIGH");
assert.match(disease.description, /não confirma infecção/i);

const lowDiseaseIgnored = buildAgroclimateRiskDrivers({
  diseaseClimate: {
    status: "READY",
    cropCode: "SOJA",
    stage: "VEGETATIVE",
    diseaseRisks: [
      {
        diseaseCode: "LOW_TEST",
        diseaseName: "Baixa favorabilidade",
        profileId: "TEST",
        climateFavorability: "LOW",
        infectionConfirmed: false,
        pathogenPresenceStatus: "UNKNOWN",
        hostSusceptibility: "UNKNOWN",
        monitoringPriority: "LOW",
        treatmentAutomaticallyAuthorized: false,
        matchedFactors: [],
        missingFactors: [],
        rationale: "Baixa favorabilidade.",
      },
    ],
    warnings: [],
  },
});
assert.equal(lowDiseaseIgnored.length, 0);

console.log("agroclimate-risk-drivers: fisiologia e doença conectadas ao risco econômico");
