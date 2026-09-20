import assert from "node:assert/strict";
import { auditAgroclimateCoverage } from "../src/domain/agroclimate-coverage.ts";

const catalog = {
  climateProfiles: [{
    id: "MILHO-RS-PM-CLIMATE",
    cropCode: "MILHO",
    region: { countryCode: "BR", technicalRegionCodes: ["RS-PLANALTO-MEDIO"] },
    rules: [],
    source: { institution: "TEST", title: "Teste" },
    status: "HOMOLOGATED",
  }],
  metricRules: [{
    id: "MILHO-RS-PM-METRIC",
    cropCode: "MILHO",
    region: { countryCode: "BR", technicalRegionCodes: ["RS-PLANALTO-MEDIO"] },
    stages: ["FLOWERING"],
    metric: "NIGHT_MEAN_TEMP_C",
    condition: { operator: "GT", value: 24 },
    hazard: "HOT_NIGHTS",
    source: { institution: "TEST", title: "Teste" },
    status: "HOMOLOGATED",
  }],
  phenologyRules: [{
    id: "MILHO-RS-PM-PHENOLOGY",
    cropCode: "MILHO",
    region: { countryCode: "BR", technicalRegionCodes: ["RS-PLANALTO-MEDIO"] },
    cultivarCycleGroups: ["G1"],
    stage: "FLOWERING",
    cumulativeGdd: { min: 760, max: 840 },
    source: { institution: "TEST", title: "Teste" },
    status: "HOMOLOGATED",
  }],
  diseaseProfiles: [{
    id: "MILHO-RS-PM-DISEASE",
    cropCode: "MILHO",
    diseaseCode: "TEST",
    diseaseName: "Teste",
    region: { countryCode: "BR", technicalRegionCodes: ["RS-PLANALTO-MEDIO"] },
    stages: ["FLOWERING"],
    conditions: { relativeHumidityPct: { min: 90 } },
    source: { institution: "TEST", title: "Teste" },
    status: "HOMOLOGATED",
  }],
  zarcContexts: [{
    profileCode: "MILHO-RS-PM-ZARC",
    technicalRegionCode: "RS-PLANALTO-MEDIO",
    cropCode: "MILHO",
    payload: {},
    source: { institution: "TEST", title: "Teste" },
  }],
  rejected: [],
};

const full = auditAgroclimateCoverage({
  cropCode: "milho",
  technicalRegionCodes: ["br-rs", "rs-planalto-medio"],
  catalog,
});
assert.equal(full.status, "FULL");
assert.equal(full.climateDecisionReady, true);
assert.equal(full.phenologyDecisionReady, true);
assert.equal(full.diseaseDecisionReady, true);
assert.equal(full.zarcContextReady, true);
assert.equal(full.researchRequired, false);
assert.deepEqual(full.gaps, []);

const otherRegion = auditAgroclimateCoverage({
  cropCode: "MILHO",
  technicalRegionCodes: ["BR-BA"],
  catalog,
});
assert.equal(otherRegion.status, "NO_COVERAGE");
assert.equal(otherRegion.climateDecisionReady, false);
assert.equal(otherRegion.researchRequired, true);
assert.ok(otherRegion.gaps.includes("CLIMATE_PROFILE_REQUIRED"));
assert.ok(otherRegion.gaps.includes("PHENOLOGY_RULES_REQUIRED"));
assert.ok(otherRegion.gaps.includes("DISEASE_PROFILE_REQUIRED"));

const otherCrop = auditAgroclimateCoverage({
  cropCode: "TOMATE",
  technicalRegionCodes: ["RS-PLANALTO-MEDIO"],
  catalog,
});
assert.equal(otherCrop.status, "NO_COVERAGE");
assert.equal(otherCrop.researchRequired, true);

const partialCatalog = {
  ...catalog,
  phenologyRules: [],
  diseaseProfiles: [],
  zarcContexts: [],
};
const partial = auditAgroclimateCoverage({
  cropCode: "MILHO",
  technicalRegionCodes: ["RS-PLANALTO-MEDIO"],
  catalog: partialCatalog,
});
assert.equal(partial.status, "PARTIAL");
assert.equal(partial.climateDecisionReady, true);
assert.equal(partial.phenologyDecisionReady, false);
assert.equal(partial.diseaseDecisionReady, false);
assert.equal(partial.zarcContextReady, false);
assert.ok(partial.gaps.includes("PHENOLOGY_RULES_REQUIRED"));
assert.ok(partial.gaps.includes("DISEASE_PROFILE_REQUIRED"));
assert.ok(partial.gaps.includes("ZARC_CONTEXT_REQUIRED"));

const unresolved = auditAgroclimateCoverage({
  cropCode: "MILHO",
  technicalRegionCodes: [],
  catalog,
});
assert.equal(unresolved.status, "UNRESOLVED_REGION");
assert.equal(unresolved.researchRequired, true);

console.log("agroclimate-coverage: expansão por cultura/região fail-closed validada");
