import type { CommercialNutrient } from "./commercial-input-engine.ts";

export type PlanningCommercialSourceTarget = {
  scenarioId:string;
  planningCropId:string;
  cropPosition:number;
  cropCode:string;
  seasonLabel:string;
  plannedDate:string|null;
  canonicalTarget:CommercialNutrient|"LIME_PRNT100";
  quantity:number;
  unit:"kg/ha"|"t/ha PRNT100";
  sourceKind:"PLANNING_DETERMINISTIC_TARGET";
  ruleId:string|null;
  ruleVersion:string|null;
  source:string|null;
};

function exactPkTarget(target:any){
  return target?.ready===true
    && typeof target.doseKgPerHa==="number"
    && Number.isFinite(target.doseKgPerHa)
    && target.minimumKgPerHa===target.maximumKgPerHa
      ? target.doseKgPerHa
      : null;
}

function exactSulfurTarget(target:any){
  return target?.ready===true
    && target.doseKind==="EXACT"
    && typeof target.doseKgSPerHa==="number"
    && Number.isFinite(target.doseKgSPerHa)
      ? target.doseKgSPerHa
      : null;
}

function exactNitrogenTarget(target:any){
  return target?.ready===true
    && target.doseKind==="EXACT"
    && typeof target.doseKgNPerHa==="number"
    && Number.isFinite(target.doseKgNPerHa)
      ? target.doseKgNPerHa
      : null;
}

/**
 * Extrai somente alvos comerciais fisicamente inequívocos do cálculo plurissafras.
 * Faixas, bloqueios e micronutrientes classificados sem dose nunca são promovidos
 * para uma quantidade de compra.
 */
export function buildPlanningCommercialSourceTargets(input:{
  scenarioId:string;
  crop:any;
  result:any;
}){
  const targets:PlanningCommercialSourceTarget[]=[];
  const base={
    scenarioId:input.scenarioId,
    planningCropId:String(input.crop.id),
    cropPosition:Number(input.crop.position),
    cropCode:String(input.crop.cropCode),
    seasonLabel:String(input.crop.seasonLabel??""),
    plannedDate:input.crop.plannedDate??null,
    sourceKind:"PLANNING_DETERMINISTIC_TARGET" as const,
  };

  const p=exactPkTarget(input.result.deterministicPk?.P2O5);
  if(p!=null){
    const target=input.result.deterministicPk.P2O5;
    targets.push({...base,canonicalTarget:"P2O5",quantity:p,unit:"kg/ha",ruleId:target.ruleId??null,ruleVersion:null,source:target.source??null});
  }

  const k=exactPkTarget(input.result.deterministicPk?.K2O);
  if(k!=null){
    const target=input.result.deterministicPk.K2O;
    targets.push({...base,canonicalTarget:"K2O",quantity:k,unit:"kg/ha",ruleId:target.ruleId??null,ruleVersion:null,source:target.source??null});
  }

  const s=exactSulfurTarget(input.result.deterministicSulfur);
  if(s!=null){
    const target=input.result.deterministicSulfur;
    targets.push({...base,canonicalTarget:"S",quantity:s,unit:"kg/ha",ruleId:target.ruleId??null,ruleVersion:target.ruleVersion??null,source:target.source??null});
  }

  const n=exactNitrogenTarget(input.result.deterministicNitrogen);
  if(n!=null){
    const target=input.result.deterministicNitrogen;
    targets.push({...base,canonicalTarget:"N",quantity:n,unit:"kg/ha",ruleId:target.ruleId??null,ruleVersion:target.ruleVersion??null,source:target.source??null});
  }

  const lime=input.result.deterministicLiming;
  if(
    input.crop.position===0
    && lime?.ready===true
    && lime.methodScope==="APPLICATION_RECOMMENDATION"
    && typeof lime.commercialTargetTonHaPrnt100==="number"
    && Number.isFinite(lime.commercialTargetTonHaPrnt100)
  ){
    targets.push({
      ...base,
      canonicalTarget:"LIME_PRNT100",
      quantity:lime.commercialTargetTonHaPrnt100,
      unit:"t/ha PRNT100",
      ruleId:lime.methodId??null,
      ruleVersion:null,
      source:"RAIZ deterministic liming decision",
    });
  }

  return targets;
}
