import assert from "node:assert/strict";
import {
  computePlanningPkTargets,
  planningCropProfileCode,
  summarizePlanningPkResults,
} from "../src/domain/multiseason-pk.ts";

const item=(sampleCode,parameterCode,classification)=>({
  sampleCode,
  parameterCode,
  interpretable:true,
  classificationRole:"TARGET",
  classification,
});

const representative=[
  item("COMPOSTA","P","Alto"),
  item("COMPOSTA","K","Alto"),
];

assert.equal(planningCropProfileCode("SOYBEAN"),"SOJA");
assert.equal(planningCropProfileCode("WHEAT"),"TRIGO");
assert.equal(planningCropProfileCode("RICE"),"ARROZ");
assert.equal(planningCropProfileCode("UNKNOWN"),null);

const soybean=computePlanningPkTargets({
  cropCode:"SOYBEAN",
  interpretation:representative,
  targetYield:4.2,
  targetUnit:"t/ha",
  cultivationOrderAfterSoilAnalysis:1,
  reanalysisRequired:false,
});
assert.equal(soybean.P2O5.ready,true);
assert.equal(soybean.P2O5.doseKgPerHa,63);
assert.equal(soybean.K2O.ready,true);
assert.equal(soybean.K2O.doseKgPerHa,105);
assert.deepEqual(soybean.P2O5.assumptions,[],"planejamento não deve usar rendimento referência silencioso");

const missingGoal=computePlanningPkTargets({
  cropCode:"SOYBEAN",
  interpretation:representative,
  targetYield:null,
  targetUnit:null,
  cultivationOrderAfterSoilAnalysis:1,
  reanalysisRequired:false,
});
assert.equal(missingGoal.P2O5.ready,false);
assert.ok(missingGoal.P2O5.blockers.includes("PLANNING_YIELD_GOAL_REQUIRED"));
assert.ok(missingGoal.P2O5.blockers.includes("PLANNING_YIELD_UNIT_REQUIRED"));

const thirdCrop=computePlanningPkTargets({
  cropCode:"SOYBEAN",
  interpretation:representative,
  targetYield:4.2,
  targetUnit:"t/ha",
  cultivationOrderAfterSoilAnalysis:3,
  reanalysisRequired:false,
});
assert.equal(thirdCrop.P2O5.ready,false);
assert.ok(thirdCrop.P2O5.blockers.some((code)=>code.includes("POST_ANALYSIS_CULTIVATION_ORDER_UNSUPPORTED")));

const afterReanalysis=computePlanningPkTargets({
  cropCode:"SOYBEAN",
  interpretation:representative,
  targetYield:4.2,
  targetUnit:"t/ha",
  cultivationOrderAfterSoilAnalysis:1,
  reanalysisRequired:true,
});
assert.equal(afterReanalysis.P2O5.ready,false);
assert.deepEqual(afterReanalysis.P2O5.blockers,["REANALYSIS_REQUIRED_BEFORE_PK"]);

const rice=computePlanningPkTargets({
  cropCode:"RICE",
  interpretation:representative,
  targetYield:8,
  targetUnit:"t/ha",
  cultivationOrderAfterSoilAnalysis:1,
  reanalysisRequired:false,
});
assert.equal(rice.profileCode,"ARROZ");
assert.equal(rice.P2O5.ready,false,"motor uniforme não deve fingir suporte de arroz");
assert.ok(rice.P2O5.blockers.includes("PK_CROP_RULE_NOT_IMPLEMENTED"));

console.log("multiseason-pk: mapeamento, doses oficiais, metas explícitas e gates fail-closed aprovados");


const summary=summarizePlanningPkResults([
  {deterministicPk:soybean},
  {deterministicPk:{
    P2O5:{...soybean.P2O5,doseKgPerHa:45,minimumKgPerHa:45,maximumKgPerHa:45},
    K2O:{...soybean.K2O,doseKgPerHa:30,minimumKgPerHa:30,maximumKgPerHa:30},
  }},
],10);
assert.equal(summary.P2O5.complete,true);
assert.equal(summary.P2O5.minimumKgPerHa,108);
assert.equal(summary.P2O5.totalMinimumKg,1080);
assert.equal(summary.K2O.maximumKgPerHa,135);
assert.equal(summary.K2O.totalMaximumKg,1350);

const partialSummary=summarizePlanningPkResults([
  {deterministicPk:soybean},
  {deterministicPk:missingGoal},
],10);
assert.equal(partialSummary.P2O5.complete,false);
assert.equal(partialSummary.P2O5.readyCropCount,1);
assert.equal(partialSummary.P2O5.blockedCropCount,1);
assert.equal(partialSummary.P2O5.minimumKgPerHa,63,"acumulado parcial soma somente parcelas calculadas");
