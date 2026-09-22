import assert from "node:assert/strict";
import {
  normalizeSharedEngineContext,
  resolveThreeEngineReadiness,
} from "../src/domain/raiz-engine-orchestration.ts";

const baseContext = {
  schemaVersion: 1,
  location: {
    countryCode: "br",
    stateCode: "rs",
    municipalityCode: "4314100",
    latitude: -28.262,
    longitude: -52.408,
    technicalRegionCodes: ["br-rs", "rs-planalto-medio"],
    resolution: "POLYGON",
  },
  crop: {
    cropCode: "milho",
    phenologicalStage: "flowering",
    plannedStart: "2026-10-01",
    plannedEnd: "2027-02-15",
    targetYieldTonPerHa: 14,
  },
  soilCycle: {
    analysisId: "analysis-1",
    fieldId: "field-1",
    fertilityPlanningHorizonYears: 3,
  },
};

const normalized = normalizeSharedEngineContext(baseContext);
assert.equal(normalized.location.countryCode, "BR");
assert.equal(normalized.location.stateCode, "RS");
assert.deepEqual(normalized.location.technicalRegionCodes, ["BR-RS", "RS-PLANALTO-MEDIO"]);
assert.equal(normalized.crop.cropCode, "MILHO");
assert.equal(normalized.crop.phenologicalStage, "FLOWERING");

const ready = resolveThreeEngineReadiness({
  context: normalized,
  fertility: {
    status: "READY",
    sourceGenerationId: "fert-1",
    deterministicCorrectionReady: true,
    annualMaintenanceReady: true,
  },
  agroclimate: {
    status: "READY",
    sourceGenerationId: "climate-1",
    matchedClimateProfileIds: ["MILHO-RS-THERMAL-1"],
    riskDriverCount: 2,
  },
});
assert.equal(ready.canCompareCorrectionCashFlow, true);
assert.equal(ready.canUseClimatePreference, true);
assert.equal(ready.canUseYieldScenarioPosture, true);
assert.deepEqual(ready.blockers, []);

const noRegion = resolveThreeEngineReadiness({
  context: {
    ...normalized,
    location: {
      ...normalized.location,
      technicalRegionCodes: [],
      resolution: "UNRESOLVED",
    },
  },
  fertility: {
    status: "READY",
    sourceGenerationId: "fert-1",
    deterministicCorrectionReady: true,
    annualMaintenanceReady: true,
  },
  agroclimate: {
    status: "READY",
    sourceGenerationId: "climate-1",
    matchedClimateProfileIds: ["MILHO-RS-THERMAL-1"],
    riskDriverCount: 2,
  },
});
assert.equal(noRegion.canCompareCorrectionCashFlow, true);
assert.equal(noRegion.canUseClimatePreference, false);
assert.ok(noRegion.warnings.includes("TECHNICAL_REGION_NOT_RESOLVED"));

const noCropProfile = resolveThreeEngineReadiness({
  context: normalized,
  fertility: {
    status: "READY",
    sourceGenerationId: "fert-1",
    deterministicCorrectionReady: true,
    annualMaintenanceReady: false,
  },
  agroclimate: {
    status: "PARTIAL",
    sourceGenerationId: "climate-1",
    matchedClimateProfileIds: [],
    riskDriverCount: 0,
  },
});
assert.equal(noCropProfile.canCompareCorrectionCashFlow, true);
assert.equal(noCropProfile.canUseClimatePreference, false);
assert.ok(noCropProfile.warnings.includes("ANNUAL_MAINTENANCE_PARTIAL"));
assert.ok(noCropProfile.warnings.includes("AGROCLIMATE_PROFILE_NOT_READY"));

const fertilityBlocked = resolveThreeEngineReadiness({
  context: normalized,
  fertility: {
    status: "BLOCKED",
    sourceGenerationId: null,
    deterministicCorrectionReady: false,
    annualMaintenanceReady: false,
  },
  agroclimate: {
    status: "READY",
    sourceGenerationId: "climate-1",
    matchedClimateProfileIds: ["MILHO-RS-THERMAL-1"],
    riskDriverCount: 2,
  },
});
assert.equal(fertilityBlocked.canCompareCorrectionCashFlow, false);
assert.equal(fertilityBlocked.canUseClimatePreference, false);
assert.ok(fertilityBlocked.blockers.includes("DETERMINISTIC_CORRECTION_NOT_READY"));

console.log("raiz-engine-orchestration: três motores, região e dependências validados");
