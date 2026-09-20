import assert from "node:assert/strict";
import { resolveCropPhenology } from "../src/domain/crop-phenology-resolver.ts";

const rules = [
  {
    id: "MILHO-RS-G1-FLOWERING",
    cropCode: "MILHO",
    region: { countryCode: "BR", stateCodes: ["RS"] },
    cultivarCycleGroups: ["G1"],
    stage: "FLOWERING",
    cumulativeGdd: { min: 760, max: 840 },
    source: { institution: "TEST", title: "Regra térmica de teste" },
    status: "HOMOLOGATED",
  },
  {
    id: "MILHO-RS-G1-GRAIN-FILL",
    cropCode: "MILHO",
    region: { countryCode: "BR", stateCodes: ["RS"] },
    cultivarCycleGroups: ["G1"],
    stage: "GRAIN_FILL",
    cumulativeGdd: { min: 841, max: 1200 },
    source: { institution: "TEST", title: "Regra térmica de teste" },
    status: "HOMOLOGATED",
  },
  {
    id: "SOJA-RS-GMR55-FLOWERING",
    cropCode: "SOJA",
    region: { countryCode: "BR", stateCodes: ["RS"] },
    cultivarCycleGroups: ["GMR5.5"],
    stage: "FLOWERING",
    daysAfterSowing: { min: 28, max: 45 },
    photoperiodHours: { min: 12, max: 14.5 },
    source: { institution: "TEST", title: "Regra fototérmica de teste" },
    status: "HOMOLOGATED",
  },
];

const maize = resolveCropPhenology({
  cropCode: "MILHO",
  countryCode: "BR",
  stateCode: "RS",
  cultivarCycleGroup: "G1",
  cumulativeGdd: 810,
  rules,
});
assert.equal(maize.status, "READY");
assert.equal(maize.stage, "FLOWERING");
assert.deepEqual(maize.matchedRuleIds, ["MILHO-RS-G1-FLOWERING"]);

const soybean = resolveCropPhenology({
  cropCode: "SOJA",
  countryCode: "BR",
  stateCode: "RS",
  cultivarCycleGroup: "GMR5.5",
  daysAfterSowing: 34,
  photoperiodHours: 13.4,
  rules,
});
assert.equal(soybean.status, "READY");
assert.equal(soybean.stage, "FLOWERING");

const soybeanMissingPhotoperiod = resolveCropPhenology({
  cropCode: "SOJA",
  countryCode: "BR",
  stateCode: "RS",
  cultivarCycleGroup: "GMR5.5",
  daysAfterSowing: 34,
  rules,
});
assert.equal(soybeanMissingPhotoperiod.status, "INSUFFICIENT_INPUT");
assert.ok(soybeanMissingPhotoperiod.missingInputs.includes("PHOTOPERIOD_HOURS"));

const noCrossCrop = resolveCropPhenology({
  cropCode: "TRIGO",
  countryCode: "BR",
  stateCode: "RS",
  cumulativeGdd: 810,
  rules,
});
assert.equal(noCrossCrop.status, "NO_APPLICABLE_RULE");

const wrongRegion = resolveCropPhenology({
  cropCode: "MILHO",
  countryCode: "BR",
  stateCode: "SC",
  cultivarCycleGroup: "G1",
  cumulativeGdd: 810,
  rules,
});
assert.equal(wrongRegion.status, "NO_APPLICABLE_RULE");

const ambiguous = resolveCropPhenology({
  cropCode: "MILHO",
  countryCode: "BR",
  stateCode: "RS",
  cultivarCycleGroup: "G1",
  cumulativeGdd: 820,
  rules: [
    ...rules,
    {
      id: "MILHO-RS-G1-OVERLAP",
      cropCode: "MILHO",
      region: { countryCode: "BR", stateCodes: ["RS"] },
      cultivarCycleGroups: ["G1"],
      stage: "GRAIN_FILL",
      cumulativeGdd: { min: 800, max: 900 },
      source: { institution: "TEST", title: "Regra sobreposta de teste" },
      status: "HOMOLOGATED",
    },
  ],
});
assert.equal(ambiguous.status, "AMBIGUOUS_STAGE");
assert.ok(ambiguous.warnings.includes("MULTIPLE_PHENOLOGICAL_STAGES_MATCH"));

console.log("crop-phenology-resolver: GDD, fotoperíodo, ciclo e fail-closed validados");
