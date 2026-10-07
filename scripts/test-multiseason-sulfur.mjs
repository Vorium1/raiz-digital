import assert from "node:assert/strict";
import {
  computePlanningSulfurTarget,
  summarizePlanningSulfurResults,
} from "../src/domain/multiseason-sulfur.ts";

const row=(sampleCode,value,overrides={})=>({
  sampleCode,
  parameterCode:"S",
  value,
  unit:"mg/dm³",
  method:"Ca(H2PO4)2 500mg P/L, turbidimetria",
  sampleType:"SOLO",
  depthFromCm:0,
  depthToCm:20,
  ...overrides,
});

const soybean=computePlanningSulfurTarget({
  cropCode:"SOYBEAN",
  labResults:[row("A",6),row("B",7),row("C",8)],
  reanalysisRequired:false,
  irrigated:false,
});
assert.equal(soybean.ready,true);
assert.equal(soybean.doseKind,"EXACT");
assert.equal(soybean.doseKgSPerHa,20);
assert.equal(soybean.ruleId,"S-SOJA-RS-SC-2025");

const soybeanSplit=computePlanningSulfurTarget({
  cropCode:"SOYBEAN",
  labResults:[row("A",6),row("B",7),row("C",12),row("D",13)],
  reanalysisRequired:false,
  irrigated:false,
});
assert.equal(soybeanSplit.ready,false);
assert.ok(soybeanSplit.blockers.includes("S_NO_STRICT_PREDOMINANCE"));

const wheat=computePlanningSulfurTarget({
  cropCode:"WHEAT",
  labResults:[row("A",4)],
  reanalysisRequired:false,
  irrigated:false,
});
assert.equal(wheat.ready,true);
assert.equal(wheat.doseKind,"RANGE");
assert.equal(wheat.minimumKgSPerHa,20);
assert.equal(wheat.maximumKgSPerHa,30);
assert.equal(wheat.ruleId,"S-TRIGO-EMBRAPA-2026");

const wheatMultiple=computePlanningSulfurTarget({
  cropCode:"WHEAT",
  labResults:[row("A",4),row("B",4)],
  reanalysisRequired:false,
  irrigated:false,
});
assert.equal(wheatMultiple.ready,false);
assert.deepEqual(wheatMultiple.blockers,["S_MULTIPLE_SAMPLES_NO_UNIFORM_RULE"]);

const rice=computePlanningSulfurTarget({
  cropCode:"RICE",
  labResults:[row("A",8)],
  reanalysisRequired:false,
  irrigated:true,
});
assert.equal(rice.ready,true);
assert.equal(rice.doseKind,"RANGE");
assert.equal(rice.minimumKgSPerHa,20);
assert.equal(rice.maximumKgSPerHa,30);
assert.equal(rice.ruleId,"S-ARROZ-SOSBAI-2025");

const riceDry=computePlanningSulfurTarget({
  cropCode:"RICE",
  labResults:[row("A",8)],
  reanalysisRequired:false,
  irrigated:false,
});
assert.equal(riceDry.ready,false);
assert.deepEqual(riceDry.blockers,["RICE_S_RULE_REQUIRES_IRRIGATED"]);

const riceUnknown=computePlanningSulfurTarget({
  cropCode:"RICE",
  labResults:[row("A",8)],
  reanalysisRequired:false,
  irrigated:null,
});
assert.equal(riceUnknown.ready,false);
assert.deepEqual(riceUnknown.blockers,["RICE_IRRIGATION_CONTEXT_REQUIRED"]);

const wrongMethod=computePlanningSulfurTarget({
  cropCode:"SOYBEAN",
  labResults:[row("A",6,{method:"NÃO INFORMADO"})],
  reanalysisRequired:false,
  irrigated:false,
});
assert.equal(wrongMethod.ready,false);
assert.ok(wrongMethod.blockers.includes("ANALYTICAL_METHOD_NOT_VALIDATED"));

const wrongDepth=computePlanningSulfurTarget({
  cropCode:"SOYBEAN",
  labResults:[row("A",6,{depthToCm:10})],
  reanalysisRequired:false,
  irrigated:false,
});
assert.equal(wrongDepth.ready,false);
assert.ok(wrongDepth.blockers.includes("S_DEPTH_NOT_0_20_CM"));

const afterReanalysis=computePlanningSulfurTarget({
  cropCode:"SOYBEAN",
  labResults:[row("A",6)],
  reanalysisRequired:true,
  irrigated:false,
});
assert.equal(afterReanalysis.ready,false);
assert.deepEqual(afterReanalysis.blockers,["REANALYSIS_REQUIRED_BEFORE_S"]);

const summary=summarizePlanningSulfurResults([
  {deterministicSulfur:soybean},
  {deterministicSulfur:wheat},
],10);
assert.equal(summary.complete,true);
assert.equal(summary.minimumKgPerHa,40);
assert.equal(summary.maximumKgPerHa,50);
assert.equal(summary.totalMinimumKg,400);
assert.equal(summary.totalMaximumKg,500);

const partial=summarizePlanningSulfurResults([
  {deterministicSulfur:soybean},
  {deterministicSulfur:wheatMultiple},
],10);
assert.equal(partial.complete,false);
assert.equal(partial.readyCropCount,1);
assert.equal(partial.blockedCropCount,1);
assert.equal(partial.minimumKgPerHa,20);

console.log("multiseason-sulfur: soja/trigo/arroz, método, camada, irrigação, reanálise e acumulado aprovados");
