import assert from "node:assert/strict";
import { computePlanningMicronutrients } from "../src/domain/multiseason-micronutrients.ts";

const row=(sampleCode,parameterCode,value,method,unit="mg/dm³",depthFromCm=0,depthToCm=20)=>({
  sampleCode,
  parameterCode,
  value,
  unit,
  method,
  sampleType:"SOLO",
  depthFromCm,
  depthToCm,
});

const soybean=computePlanningMicronutrients({
  cropCode:"SOYBEAN",
  reanalysisRequired:false,
  labResults:[
    row("A","B",0.15,"Água quente, colorimetria com curcumina"),
    row("A","ZN",0.3,"Mehlich-1"),
    row("A","CU",0.1,"Mehlich-1"),
    row("A","MN",3,"KCl 1 mol/L (acidificado com HCl 2%)"),
  ],
});
assert.equal(soybean.B.status,"UNIFORM");
assert.equal(soybean.B.classification,"INDETERMINATE");
assert.equal(soybean.ZN.classification,"MEDIO");
assert.equal(soybean.CU.classification,"BAIXO");
assert.equal(soybean.MN.classification,"MEDIO");
for(const decision of Object.values(soybean)){
  assert.equal(decision.doseKgPerHa,null);
  assert.ok(decision.pointClassifications.every((point)=>point.doseKgPerHa===null));
}

const spatialZn=computePlanningMicronutrients({
  cropCode:"WHEAT",
  reanalysisRequired:false,
  labResults:[
    row("A","ZN",0.1,"Mehlich-1"),
    row("B","ZN",0.6,"Mehlich-1"),
  ],
});
assert.equal(spatialZn.ZN.status,"SPATIAL");
assert.equal(spatialZn.ZN.classification,null);
assert.deepEqual(
  spatialZn.ZN.pointClassifications.map((point)=>point.classification),
  ["BAIXO","ALTO"],
);
assert.equal(spatialZn.ZN.doseKgPerHa,null);

const tedescoZn=computePlanningMicronutrients({
  cropCode:"SOYBEAN",
  reanalysisRequired:false,
  labResults:[
    row("A","ZN",0.3,"HCl 0,1 mol/L (Tedesco 1995)"),
  ],
});
assert.equal(tedescoZn.ZN.status,"BLOCKED");
assert.ok(tedescoZn.ZN.blockers.some((blocker)=>blocker.includes("MICRO_METHOD_NOT_VALIDATED")));

const tedescoMn=computePlanningMicronutrients({
  cropCode:"SOYBEAN",
  reanalysisRequired:false,
  labResults:[
    row("A","MN",3,"KCl 1 mol/L (Tedesco 1995)"),
  ],
});
assert.equal(tedescoMn.MN.status,"BLOCKED");
assert.ok(tedescoMn.MN.blockers.some((blocker)=>blocker.includes("MICRO_METHOD_NOT_VALIDATED")));

const wrongDepth=computePlanningMicronutrients({
  cropCode:"SOYBEAN",
  reanalysisRequired:false,
  labResults:[
    row("A","B",0.15,"Água quente, colorimetria com curcumina","mg/dm³",0,10),
  ],
});
assert.equal(wrongDepth.B.status,"BLOCKED");
assert.ok(wrongDepth.B.blockers.some((blocker)=>blocker.includes("MICRO_DEPTH_NOT_0_20_CM")));

const duplicateConflict=computePlanningMicronutrients({
  cropCode:"SOYBEAN",
  reanalysisRequired:false,
  labResults:[
    row("A","CU",0.1,"Mehlich-1"),
    row("A","CU",0.5,"Mehlich-1"),
  ],
});
assert.equal(duplicateConflict.CU.status,"BLOCKED");
assert.ok(duplicateConflict.CU.blockers.some((blocker)=>blocker.includes("MICRO_DUPLICATE_CONFLICT")));

const rice=computePlanningMicronutrients({
  cropCode:"RICE",
  reanalysisRequired:false,
  labResults:[row("A","B",0.15,"Água quente, colorimetria com curcumina")],
});
for(const decision of Object.values(rice)){
  assert.equal(decision.status,"BLOCKED");
  assert.deepEqual(decision.blockers,["MICRO_CROP_RULE_NOT_IMPLEMENTED"]);
  assert.equal(decision.doseKgPerHa,null);
}

const stale=computePlanningMicronutrients({
  cropCode:"SOYBEAN",
  reanalysisRequired:true,
  labResults:[row("A","B",0.15,"Água quente, colorimetria com curcumina")],
});
for(const decision of Object.values(stale)){
  assert.equal(decision.status,"BLOCKED");
  assert.deepEqual(decision.blockers,["REANALYSIS_REQUIRED_BEFORE_MICRONUTRIENT_CLASSIFICATION"]);
  assert.equal(decision.doseKgPerHa,null);
}

console.log("multiseason-micronutrients: classificação por ponto, métodos, camada e ausência de dose automática aprovados");
