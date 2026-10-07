import assert from "node:assert/strict";
import { buildPlanningCommercialSourceTargets } from "../src/lib/repositories/planning-commercial.ts";

const crop={
  id:"00000000-0000-4000-8000-000000000127",
  position:0,
  cropCode:"SOYBEAN",
  seasonLabel:"2026/2027",
  plannedDate:"2026-11-05",
};

const result={
  deterministicPk:{
    P2O5:{ready:true,doseKgPerHa:60,minimumKgPerHa:60,maximumKgPerHa:60,ruleId:"P-TEST",source:"Fonte P"},
    K2O:{ready:true,doseKgPerHa:null,minimumKgPerHa:40,maximumKgPerHa:60,ruleId:"K-TEST",source:"Fonte K"},
  },
  deterministicSulfur:{
    ready:true,doseKind:"EXACT",doseKgSPerHa:20,minimumKgSPerHa:20,maximumKgSPerHa:20,
    ruleId:"S-TEST",ruleVersion:"1.0.0",source:"Fonte S",
  },
  deterministicNitrogen:{
    ready:true,doseKind:"RANGE",doseKgNPerHa:null,minimumKgNPerHa:0,maximumKgNPerHa:20,
    ruleId:"N-TEST",ruleVersion:"1.0.0",source:"Fonte N",
  },
  deterministicLiming:{
    ready:true,
    methodScope:"APPLICATION_RECOMMENDATION",
    commercialTargetTonHaPrnt100:4.5,
    methodId:"LIME-TEST",
  },
  deterministicMicronutrients:{
    B:{status:"UNIFORM",classification:"BAIXO",doseKgPerHa:null},
  },
};

const targets=buildPlanningCommercialSourceTargets({
  scenarioId:"00000000-0000-4000-8000-000000000001",
  crop,
  result,
});
assert.deepEqual(
  targets.map((target)=>target.canonicalTarget),
  ["P2O5","S","LIME_PRNT100"],
);
assert.equal(targets.find((target)=>target.canonicalTarget==="P2O5")?.quantity,60);
assert.equal(targets.find((target)=>target.canonicalTarget==="S")?.quantity,20);
assert.equal(targets.find((target)=>target.canonicalTarget==="LIME_PRNT100")?.quantity,4.5);
assert.equal(targets.some((target)=>target.canonicalTarget==="K2O"),false,"faixa P/K não pode virar alvo comercial único");
assert.equal(targets.some((target)=>target.canonicalTarget==="N"),false,"faixa de N não pode virar alvo comercial único");
assert.equal(targets.some((target)=>target.canonicalTarget==="B"),false,"micronutriente classificado não pode virar dose comercial");

const layerOnly=buildPlanningCommercialSourceTargets({
  scenarioId:"00000000-0000-4000-8000-000000000001",
  crop,
  result:{
    ...result,
    deterministicLiming:{
      ...result.deterministicLiming,
      methodScope:"LAYER_REQUIREMENT",
      commercialTargetTonHaPrnt100:null,
    },
  },
});
assert.equal(
  layerOnly.some((target)=>target.canonicalTarget==="LIME_PRNT100"),
  false,
  "necessidade da camada não pode virar compra de calcário",
);

const laterCrop=buildPlanningCommercialSourceTargets({
  scenarioId:"00000000-0000-4000-8000-000000000001",
  crop:{...crop,position:1},
  result:{
    ...result,
    deterministicLiming:{
      ...result.deterministicLiming,
      methodScope:"APPLICATION_RECOMMENDATION",
      commercialTargetTonHaPrnt100:4.5,
    },
  },
});
assert.equal(
  laterCrop.some((target)=>target.canonicalTarget==="LIME_PRNT100"),
  false,
  "calagem baseada na análise inicial não pode ser repetida em cultivo posterior",
);

const zero=buildPlanningCommercialSourceTargets({
  scenarioId:"00000000-0000-4000-8000-000000000001",
  crop,
  result:{
    ...result,
    deterministicPk:{
      P2O5:{...result.deterministicPk.P2O5,doseKgPerHa:0,minimumKgPerHa:0,maximumKgPerHa:0},
      K2O:{ready:false,doseKgPerHa:null,minimumKgPerHa:null,maximumKgPerHa:null},
    },
    deterministicSulfur:{...result.deterministicSulfur,doseKgSPerHa:0,minimumKgSPerHa:0,maximumKgSPerHa:0},
    deterministicLiming:{...result.deterministicLiming,commercialTargetTonHaPrnt100:0},
  },
});
assert.equal(zero.find((target)=>target.canonicalTarget==="P2O5")?.quantity,0,"zero técnico pode ser rastreado");
assert.equal(zero.find((target)=>target.canonicalTarget==="S")?.quantity,0,"zero técnico pode ser rastreado");
assert.equal(
  zero.some((target)=>target.canonicalTarget==="LIME_PRNT100"),
  true,
  "não aplicar calcário pode permanecer rastreável como alvo técnico zero",
);

console.log("multiseason-commercial: só alvos exatos/rastreáveis entram na camada comercial");
