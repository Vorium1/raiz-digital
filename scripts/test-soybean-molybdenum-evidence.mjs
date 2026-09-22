import assert from "node:assert/strict";
import { evaluateAgronomicRuleAutomation } from "../src/domain/agronomic-rule-catalog.ts";
import {
  buildSoybeanMolybdenumReviewPacket,
  compareSoybeanMoProfiles,
  getSoybeanMoProfile,
} from "../src/domain/soybean-molybdenum-evidence.ts";

const regionalRule = evaluateAgronomicRuleAutomation("MO-SOJA-RS-SC-2025");
assert.equal(regionalRule.allowed, false);
assert.equal(regionalRule.status, "REQUIRES_AGRONOMIST_REVIEW");

const comparison = compareSoybeanMoProfiles();
assert.equal(comparison.autoSelectionAllowed, false);
assert.equal(comparison.automaticDoseAllowed, false);
assert.ok(comparison.conflictDimensions.includes("FOLIAR_DOSE_RANGE"));
assert.ok(comparison.conflictDimensions.includes("APPLICATION_FREQUENCY"));
assert.equal(comparison.profiles.length, 2);

const regionalFoliar = buildSoybeanMolybdenumReviewPacket({
  profileId: "RS_SC_2025",
  region: "RS",
  applicationMethod: "FOLIAR",
  soilPhWater: 5.2,
  earlyNitrogenDeficiencyObserved: true,
  soilTexture: "SANDY",
  integratedCropLivestock: false,
  pastureMoDryMatterMgPerKg: null,
});
assert.deepEqual(regionalFoliar.sourceRangeGMoPerHa, { minGMoPerHa: 25, maxGMoPerHa: 50 });
assert.equal(regionalFoliar.foliarStage, "V2_V3");
assert.equal(regionalFoliar.responseContextMatched, true);
assert.equal(regionalFoliar.sandySoilHighEndSignal, true);
assert.equal(regionalFoliar.professionalReviewRequired, true);
assert.equal(regionalFoliar.canAutoPrescribe, false);
assert.equal(regionalFoliar.automaticDoseGMoPerHa, null);
assert.deepEqual(regionalFoliar.blockers, []);
assert.equal(regionalFoliar.applicationBlockedBySafety, false);

const regionalSeed = buildSoybeanMolybdenumReviewPacket({
  profileId: "RS_SC_2025",
  region: "SC",
  applicationMethod: "SEED",
  soilPhWater: 5.8,
  earlyNitrogenDeficiencyObserved: false,
  soilTexture: "NON_SANDY",
  integratedCropLivestock: false,
  pastureMoDryMatterMgPerKg: null,
});
assert.deepEqual(regionalSeed.sourceRangeGMoPerHa, { minGMoPerHa: 12, maxGMoPerHa: 25 });
assert.equal(regionalSeed.responseContextMatched, false);
assert.ok(regionalSeed.warnings.some((warning) => warning.includes("maior probabilidade de resposta")));

const ilpUnknownPasture = buildSoybeanMolybdenumReviewPacket({
  profileId: "RS_SC_2025",
  region: "RS",
  applicationMethod: "FOLIAR",
  soilPhWater: 5.1,
  earlyNitrogenDeficiencyObserved: true,
  soilTexture: "NON_SANDY",
  integratedCropLivestock: true,
  pastureMoDryMatterMgPerKg: null,
});
assert.ok(ilpUnknownPasture.blockers.includes("PASTURE_MO_MONITORING_REQUIRED"));
assert.equal(ilpUnknownPasture.applicationBlockedBySafety, true);

const ilpThreshold = buildSoybeanMolybdenumReviewPacket({
  profileId: "RS_SC_2025",
  region: "RS",
  applicationMethod: "FOLIAR",
  soilPhWater: 5.1,
  earlyNitrogenDeficiencyObserved: true,
  soilTexture: "NON_SANDY",
  integratedCropLivestock: true,
  pastureMoDryMatterMgPerKg: 5,
});
assert.ok(ilpThreshold.blockers.includes("PASTURE_MO_THRESHOLD_REACHED"));
assert.equal(ilpThreshold.applicationBlockedBySafety, true);

const outsideRegion = buildSoybeanMolybdenumReviewPacket({
  profileId: "RS_SC_2025",
  region: "OTHER_BRAZIL",
  applicationMethod: "FOLIAR",
  soilPhWater: 5,
  earlyNitrogenDeficiencyObserved: true,
  soilTexture: "NON_SANDY",
  integratedCropLivestock: false,
  pastureMoDryMatterMgPerKg: null,
});
assert.ok(outsideRegion.blockers.includes("REGIONAL_PROFILE_OUTSIDE_RS_SC"));
assert.equal(outsideRegion.applicationBlockedBySafety, true);

const nationalFoliar = buildSoybeanMolybdenumReviewPacket({
  profileId: "EMBRAPA_BR_2020",
  region: "OTHER_BRAZIL",
  applicationMethod: "FOLIAR",
  soilPhWater: null,
  earlyNitrogenDeficiencyObserved: null,
  soilTexture: "UNKNOWN",
  integratedCropLivestock: false,
  pastureMoDryMatterMgPerKg: null,
});
assert.deepEqual(nationalFoliar.sourceRangeGMoPerHa, { minGMoPerHa: 12, maxGMoPerHa: 25 });
assert.equal(nationalFoliar.foliarStage, "V3_V5");
assert.equal(nationalFoliar.annualUsePolicy, "MINIMUM_EXPORT_EACH_CROP_CYCLE");
assert.equal(nationalFoliar.automaticDoseGMoPerHa, null);

assert.throws(() => getSoybeanMoProfile("AUTO"), /desconhecido/);
assert.throws(() => buildSoybeanMolybdenumReviewPacket({
  profileId: "RS_SC_2025",
  region: "RS",
  applicationMethod: "FOLIAR",
  soilPhWater: 15,
  earlyNitrogenDeficiencyObserved: true,
  soilTexture: "NON_SANDY",
  integratedCropLivestock: false,
  pastureMoDryMatterMgPerKg: null,
}), /pH em água/);

console.log("soybean-molybdenum-evidence: perfis 2025/2020 explícitos, conflitos preservados, ILP protegido e nenhuma dose automática");
