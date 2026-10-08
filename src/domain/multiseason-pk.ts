import { computeDeterministicPkDose } from "./uniform-pk-readiness.ts";

export type PlanningPkTarget = {
  ready:boolean;
  blockers:string[];
  doseKgPerHa:number|null;
  minimumKgPerHa:number|null;
  maximumKgPerHa:number|null;
  isDiscretionaryRange:boolean;
  ruleId:string|null;
  soilLevel:string|null;
  source:string|null;
  assumptions:string[];
};

const PROFILE_CODE_BY_PLANNING_CROP:Record<string,string>={
  SOYBEAN:"SOJA",
  SOJA:"SOJA",
  WHEAT:"TRIGO",
  TRIGO:"TRIGO",
  RICE:"ARROZ",
  ARROZ:"ARROZ",
};

export function planningCropProfileCode(cropCode:string|null|undefined){
  const normalized=String(cropCode??"").trim().toUpperCase();
  return PROFILE_CODE_BY_PLANNING_CROP[normalized]??null;
}

export function blockedPlanningPkTarget(blockers:string[]):PlanningPkTarget{
  return {
    ready:false,
    blockers:[...new Set(blockers)],
    doseKgPerHa:null,
    minimumKgPerHa:null,
    maximumKgPerHa:null,
    isDiscretionaryRange:false,
    ruleId:null,
    soilLevel:null,
    source:null,
    assumptions:[],
  };
}

function mapDose(
  decision:ReturnType<typeof computeDeterministicPkDose>,
):PlanningPkTarget{
  if(!decision.ready||!decision.expected)return blockedPlanningPkTarget(decision.blockers);
  return {
    ready:true,
    blockers:[],
    doseKgPerHa:decision.expected.doseKgPerHa,
    minimumKgPerHa:decision.expected.minimumKgPerHa,
    maximumKgPerHa:decision.expected.maximumKgPerHa,
    isDiscretionaryRange:decision.expected.isDiscretionaryRange,
    ruleId:decision.expected.ruleId,
    soilLevel:decision.expected.soilLevel,
    source:decision.expected.source,
    assumptions:decision.expected.assumptions,
  };
}

export function blockedPlanningPkTargets(
  cropCode:string|null|undefined,
  blockers:string[],
){
  const gate=blockedPlanningPkTarget(blockers);
  return {
    profileCode:planningCropProfileCode(cropCode),
    P2O5:gate,
    K2O:gate,
  };
}

export function computePlanningPkTargets(input:{
  cropCode:string;
  interpretation:unknown;
  targetYield:number|null|undefined;
  targetUnit:string|null|undefined;
  cultivationOrderAfterSoilAnalysis:number;
  reanalysisRequired:boolean;
}){
  if(input.reanalysisRequired){
    const gate=blockedPlanningPkTarget(["REANALYSIS_REQUIRED_BEFORE_PK"]);
    return {profileCode:planningCropProfileCode(input.cropCode),P2O5:gate,K2O:gate};
  }

  const profileCode=planningCropProfileCode(input.cropCode);
  if(!profileCode){
    const gate=blockedPlanningPkTarget(["PLANNING_CROP_PROFILE_NOT_MAPPED"]);
    return {profileCode:null,P2O5:gate,K2O:gate};
  }

  const contextBlockers:string[]=[];
  if(input.targetYield==null||!Number.isFinite(input.targetYield)||input.targetYield<=0){
    contextBlockers.push("PLANNING_YIELD_GOAL_REQUIRED");
  }
  if(!input.targetUnit?.trim()){
    contextBlockers.push("PLANNING_YIELD_UNIT_REQUIRED");
  }
  if(contextBlockers.length){
    const gate=blockedPlanningPkTarget(contextBlockers);
    return {profileCode,P2O5:gate,K2O:gate};
  }

  return {
    profileCode,
    P2O5:mapDose(computeDeterministicPkDose({
      cropCode:profileCode,
      interpretation:input.interpretation,
      yieldGoal:input.targetYield,
      yieldGoalUnit:input.targetUnit,
      cultivationOrderAfterSoilAnalysis:input.cultivationOrderAfterSoilAnalysis,
      nutrient:"P2O5",
    })),
    K2O:mapDose(computeDeterministicPkDose({
      cropCode:profileCode,
      interpretation:input.interpretation,
      yieldGoal:input.targetYield,
      yieldGoalUnit:input.targetUnit,
      cultivationOrderAfterSoilAnalysis:input.cultivationOrderAfterSoilAnalysis,
      nutrient:"K2O",
    })),
  };
}


function round1(value:number){
  return Math.round((value+Number.EPSILON)*10)/10;
}

export function summarizePlanningPkResults(
  results:Array<{
    deterministicPk?:{
      P2O5:PlanningPkTarget;
      K2O:PlanningPkTarget;
    }|null;
  }>,
  areaHa:number|null|undefined,
){
  function nutrientSummary(nutrient:"P2O5"|"K2O"){
    const targets=results.map((result)=>result.deterministicPk?.[nutrient]??null);
    const ready=targets.filter((target):target is PlanningPkTarget=>Boolean(target?.ready));
    const minimumKgPerHa=round1(ready.reduce((sum,target)=>sum+(target.minimumKgPerHa??0),0));
    const maximumKgPerHa=round1(ready.reduce((sum,target)=>sum+(target.maximumKgPerHa??0),0));
    const validArea=typeof areaHa==="number"&&Number.isFinite(areaHa)&&areaHa>0?areaHa:null;
    return {
      nutrient,
      complete:results.length>0&&ready.length===results.length,
      readyCropCount:ready.length,
      blockedCropCount:results.length-ready.length,
      minimumKgPerHa,
      maximumKgPerHa,
      totalMinimumKg:validArea==null?null:round1(minimumKgPerHa*validArea),
      totalMaximumKg:validArea==null?null:round1(maximumKgPerHa*validArea),
    };
  }

  return {
    P2O5:nutrientSummary("P2O5"),
    K2O:nutrientSummary("K2O"),
  };
}
