import assert from "node:assert/strict";
import { adaptAgroclimateCatalogRows } from "../src/domain/agroclimate-profile-adapter.ts";

const base = {
  id: "row-1",
  semanticVersion: "1.0.0",
  technicalRegionCode: "RS-PLANALTO-MEDIO",
  technicalSourceId: "source-1",
  cropCode: "MILHO",
  technicalRegionName: "Planalto Médio",
  countryCode: "BR",
  stateCodes: ["RS"],
  municipalityCodes: [],
  climateZoneCode: "RS-PM",
  technicalSourceTitle: "Fonte teste",
  technicalSourceInstitution: "Embrapa",
};

const result = adaptAgroclimateCatalogRows([
  {
    ...base,
    code: "MILHO-RS-PM-CLIMA",
    kind: "REGIONAL_CLIMATE",
    diseaseCode: null,
    phenologicalStages: ["FLOWERING"],
    payload: {
      schemaVersion: 1,
      climateRules: [{
        hazard: "EXCESS_RAIN",
        stages: ["FLOWERING"],
        impact: "ADVERSE",
        severity: "HIGH",
        rationale: "Excesso hídrico em fase crítica.",
      }],
      metricRules: [{
        id: "HOT-NIGHT",
        stages: ["FLOWERING"],
        metric: "NIGHT_MEAN_TEMP_C",
        condition: { operator: "GT", value: 24 },
        hazard: "HOT_NIGHTS",
      }],
      phenologyRules: [{
        id: "MILHO-G1-FLOWERING",
        cultivarCycleGroups: ["G1"],
        stage: "FLOWERING",
        cumulativeGdd: { min: 760, max: 840 },
      }],
    },
  },
  {
    ...base,
    id: "row-2",
    code: "MILHO-RS-PM-DISEASE",
    kind: "DISEASE",
    diseaseCode: "DOENCA_TESTE",
    phenologicalStages: ["FLOWERING"],
    payload: {
      schemaVersion: 1,
      disease: {
        diseaseName: "Doença teste",
        conditions: {
          temperatureC: { min: 20, max: 28 },
          nightTemperatureC: { min: 17, max: 24 },
          dewPointC: { min: 16 },
          relativeHumidityPct: { min: 85 },
          vpdKpa: { max: 0.7 },
          leafWetnessHours: { min: 6 },
          rainfallIntensityMmH: { min: 2 },
          consecutiveWetDays: { min: 2 },
          soilMoisturePct: { min: 60 },
          sunshineHours: { max: 5 },
          cloudCoverPct: { min: 70 },
        },
        fieldContextConditions: {
          canopyDensityIn: ["DENSE"],
          irrigationMethodIn: ["CENTER_PIVOT"],
          drainageIn: ["POOR"],
          residueLevelIn: ["HIGH"],
          recentDiseaseHistory: true,
          cropRotationBreak: false,
        },
      },
    },
  },
  {
    ...base,
    id: "row-3",
    code: "MILHO-RS-PM-ZARC",
    kind: "ZARC_CONTEXT",
    diseaseCode: null,
    phenologicalStages: [],
    payload: {
      schemaVersion: 1,
      zarc: {
        riskLevels: [20, 30, 40],
        sourceKind: "MAPA_ZARC",
      },
    },
  },
  {
    ...base,
    id: "row-bad",
    code: "BAD-PROFILE",
    kind: "PHYSIOLOGY",
    diseaseCode: null,
    phenologicalStages: [],
    payload: {
      schemaVersion: 99,
    },
  },
]);

assert.equal(result.climateProfiles.length, 1);
assert.equal(result.metricRules.length, 1);
assert.equal(result.phenologyRules.length, 1);
assert.equal(result.diseaseProfiles.length, 1);
assert.equal(result.zarcContexts.length, 1);
assert.equal(result.rejected.length, 1);

assert.deepEqual(
  result.climateProfiles[0].region.technicalRegionCodes,
  ["RS-PLANALTO-MEDIO"],
);
assert.equal(result.climateProfiles[0].source.institution, "Embrapa");
assert.equal(result.metricRules[0].id, "HOT-NIGHT");
assert.equal(result.phenologyRules[0].id, "MILHO-G1-FLOWERING");
assert.equal(result.phenologyRules[0].stage, "FLOWERING");
assert.deepEqual(
  result.metricRules[0].region.technicalRegionCodes,
  ["RS-PLANALTO-MEDIO"],
);
assert.equal(result.diseaseProfiles[0].diseaseCode, "DOENCA_TESTE");
assert.deepEqual(result.diseaseProfiles[0].fieldContextConditions?.canopyDensityIn, ["DENSE"]);
assert.deepEqual(result.diseaseProfiles[0].fieldContextConditions?.irrigationMethodIn, ["CENTER_PIVOT"]);
assert.deepEqual(
  result.diseaseProfiles[0].region.technicalRegionCodes,
  ["RS-PLANALTO-MEDIO"],
);
assert.equal(result.zarcContexts[0].technicalRegionCode, "RS-PLANALTO-MEDIO");
assert.equal(result.rejected[0].reason, "UNSUPPORTED_OR_INVALID_SCHEMA_VERSION");

const invalidMetric = adaptAgroclimateCatalogRows([{
  ...base,
  code: "BAD-METRIC",
  kind: "PHYSIOLOGY",
  diseaseCode: null,
  phenologicalStages: [],
  payload: {
    schemaVersion: 1,
    metricRules: [{
      stages: ["FLOWERING"],
      metric: "NIGHT_MEAN_TEMP_C",
      condition: { operator: "GT", value: "24" },
      hazard: "HOT_NIGHTS",
    }],
  },
}]);

assert.equal(invalidMetric.metricRules.length, 0);
assert.equal(invalidMetric.rejected[0].reason, "INVALID_CLIMATE_METRIC_OR_PHENOLOGY_RULE");

const extendedMetric = adaptAgroclimateCatalogRows([{
  ...base,
  code: "EXTENDED-METRIC",
  kind: "PHYSIOLOGY",
  diseaseCode: null,
  phenologicalStages: ["FRUIT_DEVELOPMENT"],
  payload: {
    schemaVersion: 1,
    metricRules: [
      {
        stages: ["FRUIT_DEVELOPMENT"],
        metric: "PAR_MJ_M2_DAY",
        condition: { operator: "LT", value: 5 },
        hazard: "LOW_RADIATION",
      },
      {
        stages: ["DORMANCY"],
        metric: "CHILL_HOURS",
        condition: { operator: "LT", value: 400 },
        hazard: "INSUFFICIENT_CHILL",
      },
      {
        stages: ["VEGETATIVE"],
        metric: "PHOTOPERIOD_HOURS",
        condition: { operator: "GT", value: 13.5 },
        hazard: "PHOTOPERIOD_MISMATCH",
      },
      {
        stages: ["DORMANCY"],
        metric: "CHILL_PORTIONS",
        condition: { operator: "LT", value: 45 },
        hazard: "INSUFFICIENT_CHILL",
      },
    ],
  },
}]);
assert.equal(extendedMetric.metricRules.length, 4);

const invalidDiseaseCondition = adaptAgroclimateCatalogRows([{
  ...base,
  code: "BAD-DISEASE-CONDITION",
  kind: "DISEASE",
  diseaseCode: "FUNGUS_TEST",
  phenologicalStages: ["FLOWERING"],
  payload: {
    schemaVersion: 1,
    disease: {
      diseaseName: "Doença inválida de teste",
      conditions: {
        relativeHumidityPct: { min: "90" },
      },
    },
  },
}]);
assert.equal(invalidDiseaseCondition.diseaseProfiles.length, 0);
assert.equal(invalidDiseaseCondition.rejected[0].reason, "INVALID_DISEASE_PROFILE");

const unknownDiseaseFactor = adaptAgroclimateCatalogRows([{
  ...base,
  code: "UNKNOWN-DISEASE-FACTOR",
  kind: "DISEASE",
  diseaseCode: "FUNGUS_TEST",
  phenologicalStages: ["FLOWERING"],
  payload: {
    schemaVersion: 1,
    disease: {
      diseaseName: "Doença com fator não suportado",
      conditions: {
        magicHumidityIndex: { min: 1 },
      },
    },
  },
}]);
assert.equal(unknownDiseaseFactor.diseaseProfiles.length, 0);
assert.equal(unknownDiseaseFactor.rejected[0].reason, "INVALID_DISEASE_PROFILE");

const invalidFieldContext = adaptAgroclimateCatalogRows([{
  ...base,
  code: "BAD-DISEASE-FIELD-CONTEXT",
  kind: "DISEASE",
  diseaseCode: "FUNGUS_TEST",
  phenologicalStages: ["FLOWERING"],
  payload: {
    schemaVersion: 1,
    disease: {
      diseaseName: "Doença com microclima inválido",
      conditions: { relativeHumidityPct: { min: 90 } },
      fieldContextConditions: {
        canopyDensityIn: ["SUPER_DENSE"],
      },
    },
  },
}]);
assert.equal(invalidFieldContext.diseaseProfiles.length, 0);
assert.equal(invalidFieldContext.rejected[0].reason, "INVALID_DISEASE_PROFILE");

const invalidPhenology = adaptAgroclimateCatalogRows([{
  ...base,
  code: "BAD-PHENOLOGY",
  kind: "PHYSIOLOGY",
  diseaseCode: null,
  phenologicalStages: [],
  payload: {
    schemaVersion: 1,
    phenologyRules: [{
      stage: "FLOWERING",
      cumulativeGdd: { min: 900, max: 700 },
    }],
  },
}]);
assert.equal(invalidPhenology.phenologyRules.length, 0);
assert.equal(invalidPhenology.rejected[0].reason, "INVALID_CLIMATE_METRIC_OR_PHENOLOGY_RULE");

console.log("agroclimate-profile-adapter: catálogo ACTIVE convertido e payload inválido rejeitado");
