import assert from "node:assert/strict";
import {
  computeSoybeanMolybdenumRsSc2025,
  SOYBEAN_MO_RS_SC_2025_PROFILE,
} from "../src/domain/soybean-molybdenum-rs-sc-2025.ts";
import { evaluateAgronomicRuleAutomation } from "../src/domain/agronomic-rule-catalog.ts";

const catalog = evaluateAgronomicRuleAutomation("MO-SOJA-RS-SC-2025");
assert.equal(catalog.allowed, false);
assert.equal(catalog.status, "REQUIRES_AGRONOMIST_REVIEW");

const base = {
  profileId: SOYBEAN_MO_RS_SC_2025_PROFILE,
  professionalIndicationConfirmed: true,
  applicationRoute: "FOLIAR",
  applicationRouteConfirmedByAgronomist: true,
  soilTexture: "NON_SANDY",
  foliarStage: "V2",
  integratedCropLivestock: false,
  phWater: 5.4,
  initialNitrogenDeficiencyObserved: true,
};

const withoutProfessionalIndication = computeSoybeanMolybdenumRsSc2025({
  ...base,
  professionalIndicationConfirmed: false,
});
assert.equal(withoutProfessionalIndication.decision, "BLOCKED_PROFESSIONAL_REVIEW");
assert.deepEqual(withoutProfessionalIndication.blockers, ["MO_INDICATION_REQUIRES_AGRONOMIST_CONFIRMATION"]);
assert.equal(withoutProfessionalIndication.doseRangeGMoPerHa, null);

const routeNotProfessionallySelected = computeSoybeanMolybdenumRsSc2025({
  ...base,
  applicationRouteConfirmedByAgronomist: false,
});
assert.equal(routeNotProfessionallySelected.decision, "BLOCKED_PROFESSIONAL_REVIEW");
assert.deepEqual(routeNotProfessionallySelected.blockers, ["APPLICATION_ROUTE_REQUIRES_AGRONOMIST_SELECTION"]);

const foliar = computeSoybeanMolybdenumRsSc2025(base);
assert.equal(foliar.catalogExecutionStatus, "REQUIRES_AGRONOMIST_REVIEW");
assert.equal(foliar.decision, "RANGE_AVAILABLE_AFTER_PROFESSIONAL_INDICATION");
assert.equal(foliar.postProfessionalGateRangeAvailable, true);
assert.deepEqual(foliar.doseRangeGMoPerHa, { min: 25, max: 50 });
assert.equal(foliar.foliarStage, "V2");
assert.equal(foliar.sourceResponseContextMatch, true);
assert.equal(foliar.exactDoseSelected, false);
assert.equal(foliar.automaticIndicationAllowed, false);
assert.equal(foliar.productMassConversionAllowedHere, false);

const foliarWrongStage = computeSoybeanMolybdenumRsSc2025({
  ...base,
  foliarStage: "OTHER",
});
assert.equal(foliarWrongStage.decision, "BLOCKED_SOURCE_DOMAIN");
assert.deepEqual(foliarWrongStage.blockers, ["FOLIAR_APPLICATION_REQUIRES_V2_OR_V3"]);
assert.equal(foliarWrongStage.doseRangeGMoPerHa, null);

const seedSandy = computeSoybeanMolybdenumRsSc2025({
  ...base,
  applicationRoute: "SEED",
  foliarStage: null,
  soilTexture: "SANDY",
});
assert.equal(seedSandy.decision, "RANGE_AVAILABLE_AFTER_PROFESSIONAL_INDICATION");
assert.deepEqual(seedSandy.doseRangeGMoPerHa, { min: 12, max: 25 });
assert.equal(seedSandy.timing, "BEFORE_INOCULATION");
assert.ok(seedSandy.warnings.includes("SEED_APPLICATION_MUST_PRECEDE_INOCULATION"));
assert.ok(seedSandy.warnings.includes("SEED_ROUTE_MAY_HARM_SURVIVAL_OF_N_FIXING_BACTERIA"));
assert.ok(seedSandy.warnings.includes("SOURCE_INDICATES_HIGHER_DOSES_FOR_SANDY_SOILS_EXACT_POINT_REQUIRES_PROFESSIONAL_SELECTION"));
assert.equal(seedSandy.exactDoseSelected, false, "solo arenoso não escolhe automaticamente 25 g/ha");

const contextDoesNotAutoBlockOrIndicate = computeSoybeanMolybdenumRsSc2025({
  ...base,
  phWater: 6.2,
  initialNitrogenDeficiencyObserved: false,
});
assert.equal(contextDoesNotAutoBlockOrIndicate.sourceResponseContextMatch, false);
assert.equal(contextDoesNotAutoBlockOrIndicate.decision, "RANGE_AVAILABLE_AFTER_PROFESSIONAL_INDICATION");
assert.equal(contextDoesNotAutoBlockOrIndicate.automaticIndicationAllowed, false);

const ilpUnknownHistory = computeSoybeanMolybdenumRsSc2025({
  ...base,
  integratedCropLivestock: true,
  moAppliedInPreviousSoybeanSeason: null,
  pastureMoMgPerKgDryMatter: 1,
});
assert.equal(ilpUnknownHistory.decision, "BLOCKED_PROFESSIONAL_REVIEW");
assert.deepEqual(ilpUnknownHistory.blockers, ["ILP_PREVIOUS_MO_APPLICATION_HISTORY_REQUIRED"]);

const ilpConsecutive = computeSoybeanMolybdenumRsSc2025({
  ...base,
  integratedCropLivestock: true,
  moAppliedInPreviousSoybeanSeason: true,
  pastureMoMgPerKgDryMatter: 1,
});
assert.equal(ilpConsecutive.decision, "DO_NOT_APPLY");
assert.deepEqual(ilpConsecutive.doseRangeGMoPerHa, { min: 0, max: 0 });

const ilpMissingPastureMonitoring = computeSoybeanMolybdenumRsSc2025({
  ...base,
  integratedCropLivestock: true,
  moAppliedInPreviousSoybeanSeason: false,
  pastureMoMgPerKgDryMatter: null,
});
assert.equal(ilpMissingPastureMonitoring.decision, "BLOCKED_PROFESSIONAL_REVIEW");
assert.deepEqual(ilpMissingPastureMonitoring.blockers, ["ILP_PASTURE_MO_MONITORING_REQUIRED"]);

const ilpPastureAtLimit = computeSoybeanMolybdenumRsSc2025({
  ...base,
  integratedCropLivestock: true,
  moAppliedInPreviousSoybeanSeason: false,
  pastureMoMgPerKgDryMatter: 5,
});
assert.equal(ilpPastureAtLimit.decision, "DO_NOT_APPLY");
assert.deepEqual(ilpPastureAtLimit.doseRangeGMoPerHa, { min: 0, max: 0 });

const ilpBelowLimit = computeSoybeanMolybdenumRsSc2025({
  ...base,
  foliarStage: "V3",
  integratedCropLivestock: true,
  moAppliedInPreviousSoybeanSeason: false,
  pastureMoMgPerKgDryMatter: 4.99,
});
assert.equal(ilpBelowLimit.decision, "RANGE_AVAILABLE_AFTER_PROFESSIONAL_INDICATION");
assert.deepEqual(ilpBelowLimit.doseRangeGMoPerHa, { min: 25, max: 50 });

assert.throws(() => computeSoybeanMolybdenumRsSc2025({ ...base, phWater: 14.1 }), /pH em água/);
assert.throws(() => computeSoybeanMolybdenumRsSc2025({
  ...base,
  integratedCropLivestock: true,
  moAppliedInPreviousSoybeanSeason: false,
  pastureMoMgPerKgDryMatter: -0.01,
}), /não pode ser negativo/);
assert.throws(() => computeSoybeanMolybdenumRsSc2025({ ...base, profileId: "OUTRO_PERFIL" }), /Perfil incompatível/);

console.log("soybean-molybdenum-rs-sc-2025: indicação e via seguem profissionais; faixas, V2-V3 e gates ILP permanecem fail-closed");
