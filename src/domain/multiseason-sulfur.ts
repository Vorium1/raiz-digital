import {
  computeRiceSulfurRecommendation,
  computeSoybeanSulfurRecommendation,
  computeWheatSulfurRecommendation,
  RICE_S_SOSBAI_2025_PROFILE,
  type SulfurDoseDecision,
} from "./sulfur-dose-engine.ts";
import type { LabResultInput } from "./agronomic-engine.ts";

const S_METHOD = "Ca(H2PO4)2 500mg P/L, turbidimetria";
const S_UNIT = "mg/dm³";

export type PlanningSulfurTarget = {
  ready:boolean;
  blockers:string[];
  needed:boolean|null;
  doseKind:"EXACT"|"RANGE"|"BLOCKED";
  doseKgSPerHa:number|null;
  minimumKgSPerHa:number|null;
  maximumKgSPerHa:number|null;
  ruleId:string|null;
  ruleVersion:string|null;
  source:string|null;
  basis:string|null;
  observationCount:number;
};

export function blockedPlanningSulfur(
  blockers:string[],
  observationCount=0,
):PlanningSulfurTarget{
  return {
    ready:false,
    blockers:[...new Set(blockers)],
    needed:null,
    doseKind:"BLOCKED",
    doseKgSPerHa:null,
    minimumKgSPerHa:null,
    maximumKgSPerHa:null,
    ruleId:null,
    ruleVersion:null,
    source:null,
    basis:null,
    observationCount,
  };
}

function mapDecision(
  decision:SulfurDoseDecision,
  observationCount:number,
  basis:string|null=null,
):PlanningSulfurTarget{
  if(decision.dose.kind==="BLOCKED"){
    return {
      ...blockedPlanningSulfur(decision.blockers.length?decision.blockers:[decision.dose.reason],observationCount),
      needed:decision.needed,
      ruleId:decision.ruleId,
      ruleVersion:decision.ruleVersion,
      source:decision.source,
      basis,
    };
  }
  if(decision.dose.kind==="EXACT"){
    return {
      ready:true,
      blockers:decision.blockers,
      needed:decision.needed,
      doseKind:"EXACT",
      doseKgSPerHa:decision.dose.kgSPerHa,
      minimumKgSPerHa:decision.dose.kgSPerHa,
      maximumKgSPerHa:decision.dose.kgSPerHa,
      ruleId:decision.ruleId,
      ruleVersion:decision.ruleVersion,
      source:decision.source,
      basis,
      observationCount,
    };
  }
  return {
    ready:true,
    blockers:decision.blockers,
    needed:decision.needed,
    doseKind:"RANGE",
    doseKgSPerHa:null,
    minimumKgSPerHa:decision.dose.minKgSPerHa,
    maximumKgSPerHa:decision.dose.maxKgSPerHa,
    ruleId:decision.ruleId,
    ruleVersion:decision.ruleVersion,
    source:decision.source,
    basis,
    observationCount,
  };
}

function sulfurObservations(results:LabResultInput[]){
  return results.filter((row)=>row.parameterCode.trim().toUpperCase()==="S");
}

function commonObservationBlockers(rows:LabResultInput[]){
  const blockers:string[]=[];
  if(rows.length===0)blockers.push("S_NO_OBSERVATION");
  if(rows.some((row)=>row.sampleType!=="SOLO"))blockers.push("S_SAMPLE_TYPE_NOT_SOIL");
  if(rows.some((row)=>row.unit!==S_UNIT))blockers.push("ANALYTICAL_UNIT_NOT_VALIDATED");
  if(rows.some((row)=>row.method!==S_METHOD))blockers.push("ANALYTICAL_METHOD_NOT_VALIDATED");
  if(rows.some((row)=>row.depthFromCm!==0||row.depthToCm!==20))blockers.push("S_DEPTH_NOT_0_20_CM");
  if(rows.some((row)=>!Number.isFinite(row.value)||row.value<0))blockers.push("S_VALUE_INVALID");
  return [...new Set(blockers)];
}

export function computePlanningSulfurTarget(input:{
  cropCode:string;
  labResults:LabResultInput[];
  reanalysisRequired:boolean;
  irrigated:boolean|null|undefined;
}):PlanningSulfurTarget{
  const rows=sulfurObservations(input.labResults);
  if(input.reanalysisRequired){
    return blockedPlanningSulfur(["REANALYSIS_REQUIRED_BEFORE_S"],rows.length);
  }

  const crop=input.cropCode.trim().toUpperCase();
  const common=commonObservationBlockers(rows);
  if(common.length)return blockedPlanningSulfur(common,rows.length);

  if(crop==="SOYBEAN"||crop==="SOJA"){
    const decision=computeSoybeanSulfurRecommendation({
      cropCode:"SOJA",
      observations:rows.map((row)=>({
        sampleCode:row.sampleCode,
        sulfurMgDm3:row.value,
        method:row.method,
        depthFromCm:row.depthFromCm,
        depthToCm:row.depthToCm,
      })),
      allowEqualWeightOperationalAverage:false,
    });
    return mapDecision(decision,rows.length,decision.basis);
  }

  if(crop==="WHEAT"||crop==="TRIGO"){
    if(rows.length!==1){
      return blockedPlanningSulfur(["S_MULTIPLE_SAMPLES_NO_UNIFORM_RULE"],rows.length);
    }
    return mapDecision(
      computeWheatSulfurRecommendation({
        sulfurMgDm3:rows[0].value,
        methodValidated:true,
      }),
      1,
      "SINGLE_SAMPLE",
    );
  }

  if(crop==="RICE"||crop==="ARROZ"){
    if(input.irrigated!==true){
      return blockedPlanningSulfur(
        [input.irrigated===false?"RICE_S_RULE_REQUIRES_IRRIGATED":"RICE_IRRIGATION_CONTEXT_REQUIRED"],
        rows.length,
      );
    }
    if(rows.length!==1){
      return blockedPlanningSulfur(["S_MULTIPLE_SAMPLES_NO_UNIFORM_RULE"],rows.length);
    }
    return mapDecision(
      computeRiceSulfurRecommendation({
        profileId:RICE_S_SOSBAI_2025_PROFILE,
        sulfurMgDm3:rows[0].value,
        extractionMethod:"CALCIUM_PHOSPHATE_500_MG_L",
        // O motor legado usa a grafia ASCII "mg/dm3"; a evidência já foi validada acima como mg/dm³.
        // É somente adaptação de notação da mesma unidade, sem alterar numeric_value.
        unit:"mg/dm3",
      }),
      1,
      "SINGLE_SAMPLE",
    );
  }

  return blockedPlanningSulfur(["S_CROP_RULE_NOT_IMPLEMENTED"],rows.length);
}

function round1(value:number){
  return Math.round((value+Number.EPSILON)*10)/10;
}

export function summarizePlanningSulfurResults(
  results:Array<{deterministicSulfur?:PlanningSulfurTarget|null}>,
  areaHa:number|null|undefined,
){
  const targets=results.map((result)=>result.deterministicSulfur??null);
  const ready=targets.filter((target):target is PlanningSulfurTarget=>Boolean(target?.ready));
  const minimumKgPerHa=round1(ready.reduce((sum,target)=>sum+(target.minimumKgSPerHa??0),0));
  const maximumKgPerHa=round1(ready.reduce((sum,target)=>sum+(target.maximumKgSPerHa??0),0));
  const validArea=typeof areaHa==="number"&&Number.isFinite(areaHa)&&areaHa>0?areaHa:null;
  return {
    complete:results.length>0&&ready.length===results.length,
    readyCropCount:ready.length,
    blockedCropCount:results.length-ready.length,
    minimumKgPerHa,
    maximumKgPerHa,
    totalMinimumKg:validArea==null?null:round1(minimumKgPerHa*validArea),
    totalMaximumKg:validArea==null?null:round1(maximumKgPerHa*validArea),
  };
}
