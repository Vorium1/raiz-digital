import assert from "node:assert/strict";
import { visibleFertilityParameters } from "../src/domain/visible-fertility-parameters.ts";
assert.deepEqual(visibleFertilityParameters({ available:["P","K","S"], classified:["P","P"] }),["P"]);
assert.deepEqual(visibleFertilityParameters({ available:["P"], classified:["K"] }),[]);
assert.deepEqual(visibleFertilityParameters({ available:[], classified:[] }),[]);
console.log("visible-fertility-parameters: somente classificações correntes viram navegação principal; dados brutos não são descartados");
