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

function blocked(blockers:string[]):PlanningPkTarget{
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
  if(!decision.ready||!decision.expected)return blocked(decision.blockers);
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

export function computePlanningPkTargets(input:{
  cropCode:string;
  interpretation:unknown;
  targetYield:number|null|undefined;
  targetUnit:string|null|undefined;
  cultivationOrderAfterSoilAnalysis:number;
  reanalysisRequired:boolean;
}){
  if(input.reanalysisRequired){
    const gate=blocked(["REANALYSIS_REQUIRED_BEFORE_PK"]);
    return {profileCode:planningCropProfileCode(input.cropCode),P2O5:gate,K2O:gate};
  }

  const profileCode=planningCropProfileCode(input.cropCode);
  if(!profileCode){
    const gate=blocked(["PLANNING_CROP_PROFILE_NOT_MAPPED"]);
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
    const gate=blocked(contextBlockers);
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
