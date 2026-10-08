import assert from "node:assert/strict";
import {
  computePlanningLimingTarget,
  summarizeInitialPlanningLiming,
} from "../src/domain/multiseason-liming.ts";

const row=(sampleCode,parameterCode,value,unit="",depthFromCm=0,depthToCm=20)=>({
  sampleCode,
  parameterCode,
  value,
  unit,
  method:"",
  sampleType:"SOLO",
  depthFromCm,
  depthToCm,
});

const uniform=computePlanningLimingTarget({
  cropCode:"SOYBEAN",
  position:0,
  state:"RS",
  managementSystem:"NO_TILL_ESTABLISHMENT",
  labResults:[
    row("A","PH",5.2),
    row("A","SMP",5.6),
    row("B","PH",5.3),
    row("B","SMP",5.6),
  ],
  yearsSinceLastLiming:null,
  restrictionAssessment:null,
  reanalysisRequired:false,
});
assert.equal(uniform.ready,true);
assert.equal(uniform.status,"UNIFORM_APPLY");
assert.equal(uniform.uniformDoseTonHaPrnt100,5.4);
assert.equal(uniform.generalDoseTonHaPrnt100,5.4);
assert.equal(uniform.commercialTargetTonHaPrnt100,5.4);
assert.equal(uniform.applicationMode,"INCORPORATED");

const laterCrop=computePlanningLimingTarget({
  cropCode:"SOYBEAN",
  position:1,
  state:"RS",
  managementSystem:"NO_TILL_ESTABLISHMENT",
  labResults:[row("A","PH",5.2),row("A","SMP",5.6)],
  yearsSinceLastLiming:null,
  restrictionAssessment:null,
  reanalysisRequired:false,
});
assert.equal(laterCrop.ready,false);
assert.equal(laterCrop.status,"DEFERRED");
assert.deepEqual(laterCrop.blockers,["LIMING_REEVALUATION_REQUIRED_FOR_LATER_CROP"]);

const unsupportedCrop=computePlanningLimingTarget({
  cropCode:"WHEAT",
  position:0,
  state:"RS",
  managementSystem:"NO_TILL_ESTABLISHMENT",
  labResults:[row("A","PH",5.2),row("A","SMP",5.6)],
  yearsSinceLastLiming:null,
  restrictionAssessment:null,
  reanalysisRequired:false,
});
assert.equal(unsupportedCrop.ready,false);
assert.equal(unsupportedCrop.status,"NOT_APPLICABLE");
assert.deepEqual(unsupportedCrop.blockers,["LIMING_CROP_RULE_NOT_IMPLEMENTED"]);

const spatial=computePlanningLimingTarget({
  cropCode:"SOYBEAN",
  position:0,
  state:"RS",
  managementSystem:"CONVENTIONAL",
  labResults:[
    row("A","PH",5.2),
    row("A","SMP",5.6),
    row("A","V",60,"%"),
    row("A","M",12,"%"),
    row("B","PH",5.2),
    row("B","SMP",5.8),
    row("B","V",60,"%"),
    row("B","M",12,"%"),
  ],
  yearsSinceLastLiming:null,
  restrictionAssessment:null,
  reanalysisRequired:false,
});
assert.equal(spatial.ready,true);
assert.equal(spatial.status,"SPATIAL");
assert.equal(spatial.generalDoseTonHaPrnt100,null);
assert.equal(spatial.commercialTargetTonHaPrnt100,null);
assert.deepEqual(
  {min:spatial.minimumTonHaPrnt100,max:spatial.maximumTonHaPrnt100},
  {min:4.2,max:5.4},
);

const layerOnly=computePlanningLimingTarget({
  cropCode:"SOYBEAN",
  position:0,
  state:"RS",
  managementSystem:"NO_TILL_CONSOLIDATED_UNSPECIFIED",
  labResults:[
    row("A","PH",5.2),
    row("A","SMP",5.6),
  ],
  yearsSinceLastLiming:null,
  restrictionAssessment:null,
  reanalysisRequired:false,
});
assert.equal(layerOnly.ready,true);
assert.equal(layerOnly.methodScope,"LAYER_REQUIREMENT");
assert.equal(layerOnly.generalDoseTonHaPrnt100,5.4);
assert.equal(layerOnly.commercialTargetTonHaPrnt100,null,"necessidade de camada não pode virar aplicação/produto");

const noApply=computePlanningLimingTarget({
  cropCode:"SOYBEAN",
  position:0,
  state:"SC",
  managementSystem:"CONVENTIONAL",
  labResults:[
    row("A","PH",5.8),
    row("A","SMP",6.0),
    row("A","V",72,"%"),
    row("A","M",2,"%"),
  ],
  yearsSinceLastLiming:null,
  restrictionAssessment:null,
  reanalysisRequired:false,
});
assert.equal(noApply.ready,true);
assert.equal(noApply.status,"UNIFORM_NO_APPLY");
assert.equal(noApply.uniformDoseTonHaPrnt100,0);
assert.equal(noApply.commercialTargetTonHaPrnt100,null);

const recentLiming=computePlanningLimingTarget({
  cropCode:"SOYBEAN",
  position:0,
  state:"RS",
  managementSystem:"NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS",
  labResults:[
    row("A","PH",5.2,"",0,10),
    row("A","SMP",5.6,"",0,10),
    row("A","V",60,"%",0,10),
    row("A","M",12,"%",0,10),
    row("A","PH",5.4,"",10,20),
  ],
  yearsSinceLastLiming:1,
  restrictionAssessment:null,
  reanalysisRequired:false,
});
assert.equal(recentLiming.ready,false);
assert.ok(recentLiming.blockers.includes("RECENT_LIMING_CAN_MASK_SMP_RESPONSE_REVIEW_BEFORE_REAPPLICATION"));

const afterReanalysis=computePlanningLimingTarget({
  cropCode:"SOYBEAN",
  position:0,
  state:"RS",
  managementSystem:"NO_TILL_ESTABLISHMENT",
  labResults:[row("A","PH",5.2),row("A","SMP",5.6)],
  yearsSinceLastLiming:null,
  restrictionAssessment:null,
  reanalysisRequired:true,
});
assert.equal(afterReanalysis.ready,false);
assert.deepEqual(afterReanalysis.blockers,["REANALYSIS_REQUIRED_BEFORE_LIMING"]);

const summary=summarizeInitialPlanningLiming([
  {position:0,deterministicLiming:uniform},
  {position:1,deterministicLiming:laterCrop},
],10);
assert.equal(summary.commercialTargetTonHaPrnt100,5.4);
assert.equal(summary.totalCommercialTargetTon,54);

const spatialSummary=summarizeInitialPlanningLiming([
  {position:0,deterministicLiming:spatial},
],10);
assert.equal(spatialSummary.totalCommercialTargetTon,null);

console.log("multiseason-liming: intervenção inicial, uniformidade, espacialidade, histórico e reanálise aprovados");
