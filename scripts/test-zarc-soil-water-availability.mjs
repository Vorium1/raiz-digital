import assert from "node:assert/strict";
import {
  classifyZarcAvailableWater,
  evaluateZarcAvailableWaterFromGranulometry,
} from "../src/domain/zarc-soil-water-availability.ts";

assert.equal(classifyZarcAvailableWater(0.34),"AD1");
assert.equal(classifyZarcAvailableWater(0.459999),"AD1");
assert.equal(classifyZarcAvailableWater(0.46),"AD2");
assert.equal(classifyZarcAvailableWater(0.61),"AD3");
assert.equal(classifyZarcAvailableWater(0.80),"AD4");
assert.equal(classifyZarcAvailableWater(1.06),"AD5");
assert.equal(classifyZarcAvailableWater(1.40),"AD6");
assert.throws(()=>classifyZarcAvailableWater(0.339),/OUTSIDE_CLASSIFIED_RANGE/);

const ad1=evaluateZarcAvailableWaterFromGranulometry({
  totalSandPct:90,siltPct:5,clayPct:5,depthFromCm:0,depthToCm:40,
});
assert.equal(ad1.status,"READY");
assert.equal(ad1.availableWaterClass,"AD1");
assert.equal(ad1.zarcSoilCode,11);
assert.ok(Math.abs(ad1.availableWaterMmPerCm-0.375112109)<1e-6);

const ad2=evaluateZarcAvailableWaterFromGranulometry({
  totalSandPct:85,siltPct:5,clayPct:10,depthFromCm:0,depthToCm:40,
});
assert.equal(ad2.status,"READY");
assert.equal(ad2.availableWaterClass,"AD2");
assert.equal(ad2.zarcSoilCode,12);

const ad3=evaluateZarcAvailableWaterFromGranulometry({
  totalSandPct:70,siltPct:10,clayPct:20,depthFromCm:0,depthToCm:40,
});
assert.equal(ad3.status,"READY");
assert.equal(ad3.availableWaterClass,"AD3");
assert.equal(ad3.zarcSoilCode,13);

const ad4=evaluateZarcAvailableWaterFromGranulometry({
  totalSandPct:50,siltPct:20,clayPct:30,depthFromCm:0,depthToCm:40,
});
assert.equal(ad4.status,"READY");
assert.equal(ad4.availableWaterClass,"AD4");
assert.equal(ad4.zarcSoilCode,14);

const ad5=evaluateZarcAvailableWaterFromGranulometry({
  totalSandPct:20,siltPct:40,clayPct:40,depthFromCm:0,depthToCm:40,
});
assert.equal(ad5.status,"READY");
assert.equal(ad5.availableWaterClass,"AD5");
assert.equal(ad5.zarcSoilCode,15);

const ad6=evaluateZarcAvailableWaterFromGranulometry({
  totalSandPct:5,siltPct:40,clayPct:55,depthFromCm:0,depthToCm:40,
});
assert.equal(ad6.status,"READY");
assert.equal(ad6.availableWaterClass,"AD6");
assert.equal(ad6.zarcSoilCode,16);

const missing=evaluateZarcAvailableWaterFromGranulometry({
  clayPct:45,depthFromCm:0,depthToCm:40,
});
assert.equal(missing.status,"INSUFFICIENT_GRANULOMETRY");
assert.equal(missing.zarcSoilCode,null);
assert.ok(missing.warnings.includes("ZARC_AD_REQUIRES_MEASURED_SAND_SILT_AND_CLAY"));

const wrongDepth=evaluateZarcAvailableWaterFromGranulometry({
  totalSandPct:40,siltPct:20,clayPct:40,depthFromCm:0,depthToCm:20,
});
assert.equal(wrongDepth.status,"DEPTH_NOT_APPLICABLE");
assert.equal(wrongDepth.availableWaterClass,null);

const notClosed=evaluateZarcAvailableWaterFromGranulometry({
  totalSandPct:40,siltPct:20,clayPct:30,depthFromCm:0,depthToCm:40,
});
assert.equal(notClosed.status,"GRANULOMETRY_NOT_CLOSED");

console.log("zarc-soil-water-availability: fórmula oficial 0–40 cm e AD1–AD6 validadas");
