import assert from "node:assert/strict";
import { evaluateGypsumResponseDiagnostic } from "../src/domain/gypsum-response-diagnostic.ts";

const baseCereal = {
  crop: "MAIZE",
  managementSystem: "NO_TILL",
  diagnosticLayer: "20_40_CM",
  alSaturationPct: 8,
  alSaturationSourceValidated: true,
  waterDeficiency: false,
};

const cereal = evaluateGypsumResponseDiagnostic(baseCereal);
assert.equal(cereal.responseClass, "HIGHER_RESPONSE_LIKELIHOOD");
assert.equal(cereal.criterion.alSaturationThresholdPct, 5);
assert.deepEqual(cereal.evidenceObservation.positiveResponseProbabilityPct, { min: 77, max: 97 });
assert.equal(cereal.evidenceObservation.averageYieldIncreasePct, 7);
assert.equal(cereal.gypsumDoseKgHa, null);
assert.equal(cereal.policy.automaticDoseAllowed, false);

const cerealWaterDeficit = evaluateGypsumResponseDiagnostic({ ...baseCereal, waterDeficiency: true });
assert.equal(cerealWaterDeficit.evidenceObservation.averageYieldIncreasePct, 14);

const cerealUnknownWater = evaluateGypsumResponseDiagnostic({ ...baseCereal, waterDeficiency: null });
assert.equal(cerealUnknownWater.responseClass, "HIGHER_RESPONSE_LIKELIHOOD");
assert.equal(cerealUnknownWater.evidenceObservation.averageYieldIncreasePct, null);

const cerealBoundary = evaluateGypsumResponseDiagnostic({ ...baseCereal, alSaturationPct: 5 });
assert.equal(cerealBoundary.responseClass, "CRITERION_NOT_MET");
assert.equal(cerealBoundary.evidenceObservation.positiveResponseProbabilityPct, null);

const soybean = evaluateGypsumResponseDiagnostic({
  ...baseCereal,
  crop: "SOYBEAN",
  alSaturationPct: 11,
  waterDeficiency: true,
});
assert.equal(soybean.responseClass, "HIGHER_RESPONSE_LIKELIHOOD");
assert.equal(soybean.criterion.alSaturationThresholdPct, 10);
assert.deepEqual(soybean.evidenceObservation.positiveResponseProbabilityPct, { min: 88, max: 88 });
assert.equal(soybean.evidenceObservation.averageYieldIncreasePct, 12);

const soybeanNoWaterDeficit = evaluateGypsumResponseDiagnostic({ ...soybeanInput(), waterDeficiency: false });
assert.equal(soybeanNoWaterDeficit.responseClass, "CRITERION_NOT_MET");
assert.ok(soybeanNoWaterDeficit.warnings.includes("SOYBEAN_WATER_DEFICIT_REQUIRED_BY_META_ANALYSIS"));

const soybeanUnknownWater = evaluateGypsumResponseDiagnostic({ ...soybeanInput(), waterDeficiency: null });
assert.equal(soybeanUnknownWater.responseClass, "INSUFFICIENT_CONTEXT");
assert.ok(soybeanUnknownWater.blockers.includes("WATER_DEFICIENCY_CONTEXT_MISSING_FOR_SOYBEAN"));

const wrongLayer = evaluateGypsumResponseDiagnostic({ ...baseCereal, diagnosticLayer: "OTHER" });
assert.equal(wrongLayer.responseClass, "OUTSIDE_EVIDENCE_DOMAIN");
assert.ok(wrongLayer.blockers.includes("DIAGNOSTIC_LAYER_NOT_20_40_CM"));

const conventional = evaluateGypsumResponseDiagnostic({ ...baseCereal, managementSystem: "OTHER" });
assert.equal(conventional.responseClass, "OUTSIDE_EVIDENCE_DOMAIN");
assert.ok(conventional.blockers.includes("OUTSIDE_NO_TILL_EVIDENCE_DOMAIN"));

const invalidAl = evaluateGypsumResponseDiagnostic({ ...baseCereal, alSaturationPct: null });
assert.equal(invalidAl.responseClass, "INSUFFICIENT_CONTEXT");
assert.ok(invalidAl.blockers.includes("AL_SATURATION_MISSING_OR_INVALID"));

const unvalidatedAl = evaluateGypsumResponseDiagnostic({ ...baseCereal, alSaturationSourceValidated: false });
assert.equal(unvalidatedAl.responseClass, "INSUFFICIENT_CONTEXT");
assert.ok(unvalidatedAl.blockers.includes("AL_SATURATION_SOURCE_NOT_VALIDATED"));

const pampaRisk = evaluateGypsumResponseDiagnostic({
  ...baseCereal,
  soilOrder: "ULTISOL",
  textureGroup: "COARSE",
  effectiveCecCmolcDm3: 7.4,
  lowSubsurfaceAcidityValidated: true,
  surfaceMagnesiumStatus: "LOW",
  surfacePotassiumStatus: "LOW",
});
assert.ok(pampaRisk.warnings.includes("COARSE_ULTISOL_LOW_CEC_NEGATIVE_RESPONSE_RISK"));
assert.ok(pampaRisk.warnings.includes("SURFACE_MAGNESIUM_LOW"));
assert.ok(pampaRisk.warnings.includes("SURFACE_POTASSIUM_LOW"));
assert.equal(pampaRisk.gypsumDoseKgHa, null);

const sulfurConfounder = evaluateGypsumResponseDiagnostic({ ...baseCereal, sulfurStatus: "LOW" });
assert.ok(sulfurConfounder.warnings.includes("SULFUR_RESPONSE_CAN_CONFOUND_AMENDMENT_RESPONSE"));

function soybeanInput() {
  return {
    crop: "SOYBEAN",
    managementSystem: "NO_TILL",
    diagnosticLayer: "20_40_CM",
    alSaturationPct: 11,
    alSaturationSourceValidated: true,
    waterDeficiency: true,
  };
}

console.log("gypsum-response-diagnostic: meta-análise 2020 aplicada como diagnóstico sem dose automática");
