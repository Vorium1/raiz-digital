import assert from "node:assert/strict";
import {
  computePlanningNitrogenTarget,
  summarizePlanningNitrogenResults,
  wheatPrecedingCropFromPlanningCode,
} from "../src/domain/multiseason-nitrogen.ts";

const mo=(sampleCode,value,unit="%")=>({
  sampleCode,
  parameterCode:"MO",
  value,
  unit,
  method:"Oxidação sulfocrômica",
  sampleType:"SOLO",
  depthFromCm:0,
  depthToCm:20,
});

assert.equal(wheatPrecedingCropFromPlanningCode("SOYBEAN"),"SOY");
assert.equal(wheatPrecedingCropFromPlanningCode("SOJA"),"SOY");
assert.equal(wheatPrecedingCropFromPlanningCode("CORN"),"CORN");
assert.equal(wheatPrecedingCropFromPlanningCode("MILHO"),"CORN");
assert.equal(wheatPrecedingCropFromPlanningCode("OTHER"),null);

const afterSoy=computePlanningNitrogenTarget({
  cropCode:"WHEAT",
  targetYield:4,
  targetUnit:"t/ha",
  labResults:[mo("A",2)],
  reanalysisRequired:false,
  precedingCropCode:"SOYBEAN",
});
assert.equal(afterSoy.ready,true);
assert.equal(afterSoy.doseKind,"EXACT");
assert.equal(afterSoy.doseKgNPerHa,80);
assert.equal(afterSoy.precedingCrop,"SOY");
assert.equal(afterSoy.organicMatterPct,2);
assert.equal(afterSoy.ruleId,"N-TRIGO-EMBRAPA-2026");

const afterCorn=computePlanningNitrogenTarget({
  cropCode:"TRIGO",
  targetYield:4,
  targetUnit:"t/ha",
  labResults:[mo("A",2)],
  reanalysisRequired:false,
  precedingCropCode:"CORN",
});
assert.equal(afterCorn.ready,true);
assert.equal(afterCorn.doseKgNPerHa,110);
assert.equal(afterCorn.precedingCrop,"CORN");

const sameBand=computePlanningNitrogenTarget({
  cropCode:"WHEAT",
  targetYield:3,
  targetUnit:"t/ha",
  labResults:[mo("A",2),mo("B",2.4)],
  reanalysisRequired:false,
  precedingCropCode:"SOYBEAN",
});
assert.equal(sameBand.ready,true);
assert.equal(sameBand.organicMatterPct,2.2);
assert.equal(sameBand.doseKgNPerHa,60);

const bandConflict=computePlanningNitrogenTarget({
  cropCode:"WHEAT",
  targetYield:3,
  targetUnit:"t/ha",
  labResults:[mo("A",2),mo("B",3)],
  reanalysisRequired:false,
  precedingCropCode:"SOYBEAN",
});
assert.equal(bandConflict.ready,false);
assert.ok(bandConflict.blockers.includes("ORGANIC_MATTER_BAND_CONFLICT"));

const unknownPrevious=computePlanningNitrogenTarget({
  cropCode:"WHEAT",
  targetYield:3,
  targetUnit:"t/ha",
  labResults:[mo("A",2)],
  reanalysisRequired:false,
  precedingCropCode:null,
});
assert.equal(unknownPrevious.ready,false);
assert.ok(unknownPrevious.blockers.includes("WHEAT_PRECEDING_CROP_REQUIRED"));

const unsupportedUnit=computePlanningNitrogenTarget({
  cropCode:"WHEAT",
  targetYield:60,
  targetUnit:"sc/ha",
  labResults:[mo("A",2)],
  reanalysisRequired:false,
  precedingCropCode:"SOYBEAN",
});
assert.equal(unsupportedUnit.ready,false);
assert.ok(unsupportedUnit.blockers.includes("YIELD_UNIT_UNSUPPORTED"));

const wrongOmUnit=computePlanningNitrogenTarget({
  cropCode:"WHEAT",
  targetYield:3,
  targetUnit:"t/ha",
  labResults:[mo("A",20,"g/kg")],
  reanalysisRequired:false,
  precedingCropCode:"SOYBEAN",
});
assert.equal(wrongOmUnit.ready,false);
assert.ok(wrongOmUnit.blockers.includes("ORGANIC_MATTER_UNIT_UNSUPPORTED"));

const upperBand=computePlanningNitrogenTarget({
  cropCode:"WHEAT",
  targetYield:3,
  targetUnit:"t/ha",
  labResults:[mo("A",6)],
  reanalysisRequired:false,
  precedingCropCode:"SOYBEAN",
});
assert.equal(upperBand.ready,true);
assert.equal(upperBand.doseKind,"RANGE");
assert.equal(upperBand.minimumKgNPerHa,0);
assert.equal(upperBand.maximumKgNPerHa,20);
assert.equal(upperBand.requiresAgronomistReview,true);

const afterReanalysis=computePlanningNitrogenTarget({
  cropCode:"WHEAT",
  targetYield:3,
  targetUnit:"t/ha",
  labResults:[mo("A",2)],
  reanalysisRequired:true,
  precedingCropCode:"SOYBEAN",
});
assert.equal(afterReanalysis.ready,false);
assert.deepEqual(afterReanalysis.blockers,["REANALYSIS_REQUIRED_BEFORE_N"]);

const riceUnresolved=computePlanningNitrogenTarget({
  cropCode:"RICE",
  targetYield:8,
  targetUnit:"t/ha",
  labResults:[mo("A",2.5)],
  reanalysisRequired:false,
  precedingCropCode:null,
  irrigated:true,
  riceResponseClass:null,
  riceResponseClassApproved:false,
});
assert.equal(riceUnresolved.ready,false);
assert.deepEqual(riceUnresolved.blockers,["RICE_RESPONSE_CLASS_NOT_RESOLVED"]);

const riceNotIrrigated=computePlanningNitrogenTarget({
  cropCode:"RICE",
  targetYield:8,
  targetUnit:"t/ha",
  labResults:[mo("A",2.5)],
  reanalysisRequired:false,
  precedingCropCode:null,
  irrigated:false,
  riceResponseClass:"MEDIA",
  riceResponseClassApproved:true,
});
assert.equal(riceNotIrrigated.ready,false);
assert.deepEqual(riceNotIrrigated.blockers,["RICE_N_RULE_REQUIRES_IRRIGATED"]);

const riceMediaApproved=computePlanningNitrogenTarget({
  cropCode:"RICE",
  targetYield:8,
  targetUnit:"t/ha",
  labResults:[mo("A",2.5)],
  reanalysisRequired:false,
  precedingCropCode:null,
  irrigated:true,
  riceResponseClass:"MEDIA",
  riceResponseClassApproved:true,
});
assert.equal(riceMediaApproved.ready,true);
assert.equal(riceMediaApproved.doseKind,"EXACT");
assert.equal(riceMediaApproved.doseKgNPerHa,110);
assert.equal(riceMediaApproved.riceResponseClass,"MEDIA");
assert.equal(riceMediaApproved.riceResponseClassApproved,true);
assert.equal(riceMediaApproved.ruleId,"N-ARROZ-CONTINUO-SOSBAI-2025");

const riceAltaSameBand=computePlanningNitrogenTarget({
  cropCode:"ARROZ",
  targetYield:null,
  targetUnit:null,
  labResults:[mo("A",2),mo("B",2.4)],
  reanalysisRequired:false,
  precedingCropCode:null,
  irrigated:true,
  riceResponseClass:"ALTA",
  riceResponseClassApproved:true,
});
assert.equal(riceAltaSameBand.ready,true);
assert.equal(riceAltaSameBand.doseKind,"EXACT");
assert.equal(riceAltaSameBand.doseKgNPerHa,135);
assert.equal(riceAltaSameBand.organicMatterPct,2.2);

const riceBandConflict=computePlanningNitrogenTarget({
  cropCode:"RICE",
  targetYield:null,
  targetUnit:null,
  labResults:[mo("A",2.5),mo("B",3)],
  reanalysisRequired:false,
  precedingCropCode:null,
  irrigated:true,
  riceResponseClass:"ALTA",
  riceResponseClassApproved:true,
});
assert.equal(riceBandConflict.ready,false);
assert.deepEqual(riceBandConflict.blockers,["RICE_N_OM_BANDS_CONFLICT_NO_UNIFORM_DOSE"]);

const riceUpperBound=computePlanningNitrogenTarget({
  cropCode:"RICE",
  targetYield:null,
  targetUnit:null,
  labResults:[mo("A",6)],
  reanalysisRequired:false,
  precedingCropCode:null,
  irrigated:true,
  riceResponseClass:"ALTA",
  riceResponseClassApproved:true,
});
assert.equal(riceUpperBound.ready,true);
assert.equal(riceUpperBound.doseKind,"UPPER_BOUND");
assert.equal(riceUpperBound.doseKgNPerHa,null);
assert.equal(riceUpperBound.minimumKgNPerHa,0);
assert.equal(riceUpperBound.maximumKgNPerHa,110);

const ricePrecisionGap=computePlanningNitrogenTarget({
  cropCode:"RICE",
  targetYield:null,
  targetUnit:null,
  labResults:[mo("A",2.55)],
  reanalysisRequired:false,
  precedingCropCode:null,
  irrigated:true,
  riceResponseClass:"MEDIA",
  riceResponseClassApproved:true,
});
assert.equal(ricePrecisionGap.ready,false);
assert.deepEqual(ricePrecisionGap.blockers,["RICE_N_ORGANIC_MATTER_BAND_UNRESOLVED"]);

const soybean=computePlanningNitrogenTarget({
  cropCode:"SOYBEAN",
  targetYield:4,
  targetUnit:"t/ha",
  labResults:[mo("A",2)],
  reanalysisRequired:false,
  precedingCropCode:"CORN",
});
assert.equal(soybean.ready,false);
assert.deepEqual(soybean.blockers,["N_CROP_RULE_NOT_IMPLEMENTED"]);

const summary=summarizePlanningNitrogenResults([
  {deterministicNitrogen:afterSoy},
  {deterministicNitrogen:afterCorn},
],10);
assert.equal(summary.complete,true);
assert.equal(summary.minimumKgPerHa,190);
assert.equal(summary.totalMinimumKg,1900);

const partial=summarizePlanningNitrogenResults([
  {deterministicNitrogen:afterSoy},
  {deterministicNitrogen:soybean},
],10);
assert.equal(partial.complete,false);
assert.equal(partial.readyCropCount,1);
assert.equal(partial.blockedCropCount,1);
assert.equal(partial.minimumKgPerHa,80);

console.log("multiseason-nitrogen: trigo + arroz SOSBAI, MO, predecessor, aprovação explícita, reanálise e acumulado aprovados");
