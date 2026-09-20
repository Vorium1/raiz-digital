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
          relativeHumidityPct: { min: 85 },
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
assert.equal(result.diseaseProfiles.length, 1);
assert.equal(result.zarcContexts.length, 1);
assert.equal(result.rejected.length, 1);

assert.deepEqual(
  result.climateProfiles[0].region.technicalRegionCodes,
  ["RS-PLANALTO-MEDIO"],
);
assert.equal(result.climateProfiles[0].source.institution, "Embrapa");
assert.equal(result.metricRules[0].id, "HOT-NIGHT");
assert.deepEqual(
  result.metricRules[0].region.technicalRegionCodes,
  ["RS-PLANALTO-MEDIO"],
);
assert.equal(result.diseaseProfiles[0].diseaseCode, "DOENCA_TESTE");
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
assert.equal(invalidMetric.rejected[0].reason, "INVALID_CLIMATE_OR_METRIC_RULE");

console.log("agroclimate-profile-adapter: catálogo ACTIVE convertido e payload inválido rejeitado");
