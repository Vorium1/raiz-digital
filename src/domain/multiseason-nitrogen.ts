import {
  evaluateNitrogenRecommendationReadiness,
  isOrganicMatterPercentUnit,
} from "./nitrogen-context.ts";
import {
  computeWheatNitrogenRecommendation,
  type NitrogenRecommendation,
} from "./nitrogen-dose-engine.ts";
import type { LabResultInput } from "./agronomic-engine.ts";
import {
  computeRiceContinuousNitrogen,
  evaluateRiceContinuousNitrogenEnvelope,
  RESEARCH_READY_PROFILES,
  type RiceResponseClass,
} from "./research-ready-rules.ts";

export type PlanningPreviousCropCode = "SOYBEAN" | "CORN" | "OTHER" | null;

export type PlanningNitrogenTarget = {
  ready:boolean;
  blockers:string[];
  doseKind:"EXACT"|"RANGE"|"UPPER_BOUND"|"BLOCKED";
  doseKgNPerHa:number|null;
  minimumKgNPerHa:number|null;
  maximumKgNPerHa:number|null;
  sowingMinimumKgNPerHa:number|null;
  sowingMaximumKgNPerHa:number|null;
  ruleId:string|null;
  ruleVersion:string|null;
  sourceSnapshotId:string|null;
  source:string|null;
  requiresAgronomistReview:boolean;
  precedingCrop:"SOY"|"CORN"|null;
  organicMatterPct:number|null;
  organicMatterBand:string|null;
  riceResponseClass:RiceResponseClass|null;
  riceResponseClassApproved:boolean;
};

export function wheatPrecedingCropFromPlanningCode(
  value:string|null|undefined,
):"SOY"|"CORN"|null{
  const code=String(value??"").trim().toUpperCase();
  if(code==="SOYBEAN"||code==="SOJA")return "SOY";
  if(code==="CORN"||code==="MILHO")return "CORN";
  return null;
}

export function blockedPlanningNitrogen(
  blockers:string[],
  precedingCrop:"SOY"|"CORN"|null=null,
):PlanningNitrogenTarget{
  return {
    ready:false,
    blockers:[...new Set(blockers)],
    doseKind:"BLOCKED",
    doseKgNPerHa:null,
    minimumKgNPerHa:null,
    maximumKgNPerHa:null,
    sowingMinimumKgNPerHa:null,
    sowingMaximumKgNPerHa:null,
    ruleId:null,
    ruleVersion:null,
    sourceSnapshotId:null,
    source:null,
    requiresAgronomistReview:true,
    precedingCrop,
    organicMatterPct:null,
    organicMatterBand:null,
    riceResponseClass:null,
    riceResponseClassApproved:false,
  };
}

function mapWheatRecommendation(
  recommendation:NitrogenRecommendation,
  precedingCrop:"SOY"|"CORN",
  organicMatterPct:number,
  organicMatterBand:string|null,
):PlanningNitrogenTarget{
  if(recommendation.dose.kind==="BLOCKED"){
    return {
      ...blockedPlanningNitrogen(
        recommendation.blockers.length
          ? recommendation.blockers
          : [recommendation.dose.reason],
        precedingCrop,
      ),
      ruleId:recommendation.ruleId,
      ruleVersion:recommendation.ruleVersion,
      sourceSnapshotId:recommendation.sourceSnapshotId,
      source:recommendation.source,
      organicMatterPct,
      organicMatterBand,
      riceResponseClass:null,
      riceResponseClassApproved:false,
    };
  }

  const sowing=recommendation.sowingRangeKgNPerHa;
  if(recommendation.dose.kind==="EXACT"){
    return {
      ready:true,
      blockers:recommendation.blockers,
      doseKind:"EXACT",
      doseKgNPerHa:recommendation.dose.kgNPerHa,
      minimumKgNPerHa:recommendation.dose.kgNPerHa,
      maximumKgNPerHa:recommendation.dose.kgNPerHa,
      sowingMinimumKgNPerHa:sowing?.min??null,
      sowingMaximumKgNPerHa:sowing?.max??null,
      ruleId:recommendation.ruleId,
      ruleVersion:recommendation.ruleVersion,
      sourceSnapshotId:recommendation.sourceSnapshotId,
      source:recommendation.source,
      requiresAgronomistReview:recommendation.status!=="READY_FOR_IMPLEMENTATION",
      precedingCrop,
      organicMatterPct,
      organicMatterBand,
      riceResponseClass:null,
      riceResponseClassApproved:false,
    };
  }

  return {
    ready:true,
    blockers:recommendation.blockers,
    doseKind:"RANGE",
    doseKgNPerHa:null,
    minimumKgNPerHa:recommendation.dose.minKgNPerHa,
    maximumKgNPerHa:recommendation.dose.maxKgNPerHa,
    sowingMinimumKgNPerHa:sowing?.min??null,
    sowingMaximumKgNPerHa:sowing?.max??null,
    ruleId:recommendation.ruleId,
    ruleVersion:recommendation.ruleVersion,
    sourceSnapshotId:recommendation.sourceSnapshotId,
    source:recommendation.source,
    requiresAgronomistReview:true,
    precedingCrop,
    organicMatterPct,
    organicMatterBand,
    riceResponseClass:null,
    riceResponseClassApproved:false,
  };
}

function soilOrganicMatterRows(results:LabResultInput[]){
  const codes=new Set(["OM","MO","ORGANIC_MATTER"]);
  return results.filter((row)=>
    row.sampleType==="SOLO"
    && codes.has(row.parameterCode.trim().toUpperCase())
  );
}


function riceOrganicMatterEvidence(results:LabResultInput[]){
  const rows=soilOrganicMatterRows(results);
  if(rows.length===0){
    return {ready:false as const,blockers:["RICE_N_REQUIRES_ORGANIC_MATTER_PERCENT"],organicMatterPct:null,organicMatterBand:null,sourceSnapshotId:null};
  }
  if(rows.some((row)=>!isOrganicMatterPercentUnit(row.unit))){
    return {ready:false as const,blockers:["ORGANIC_MATTER_UNIT_UNSUPPORTED"],organicMatterPct:null,organicMatterBand:null,sourceSnapshotId:null};
  }
  if(rows.some((row)=>!Number.isFinite(row.value)||row.value<0)){
    return {ready:false as const,blockers:["ORGANIC_MATTER_VALUE_INVALID"],organicMatterPct:null,organicMatterBand:null,sourceSnapshotId:null};
  }

  const envelopes=[];
  try{
    for(const row of rows){
      envelopes.push(evaluateRiceContinuousNitrogenEnvelope({
        profileId:RESEARCH_READY_PROFILES.rice,
        organicMatterPct:row.value,
      }));
    }
  }catch{
    return {ready:false as const,blockers:["RICE_N_ORGANIC_MATTER_BAND_UNRESOLVED"],organicMatterPct:null,organicMatterBand:null,sourceSnapshotId:null};
  }

  const bands=[...new Set(envelopes.map((envelope)=>envelope.organicMatterBand))];
  if(bands.length!==1){
    return {
      ready:false as const,
      blockers:["RICE_N_OM_BANDS_CONFLICT_NO_UNIFORM_DOSE"],
      organicMatterPct:null,
      organicMatterBand:null,
      sourceSnapshotId:envelopes[0]?.sourceSnapshotId??null,
    };
  }

  const organicMatterPct=Math.round(
    (rows.reduce((sum,row)=>sum+row.value,0)/rows.length+Number.EPSILON)*100,
  )/100;
  return {
    ready:true as const,
    blockers:[],
    organicMatterPct,
    organicMatterBand:bands[0],
    sourceSnapshotId:envelopes[0]?.sourceSnapshotId??null,
  };
}

function computePlanningRiceNitrogen(input:{
  labResults:LabResultInput[];
  reanalysisRequired:boolean;
  irrigated:boolean|null|undefined;
  responseClass:RiceResponseClass|null|undefined;
  responseClassApproved:boolean|null|undefined;
}):PlanningNitrogenTarget{
  if(input.reanalysisRequired){
    return blockedPlanningNitrogen(["REANALYSIS_REQUIRED_BEFORE_N"]);
  }
  if(input.irrigated!==true){
    return blockedPlanningNitrogen([
      input.irrigated===false
        ?"RICE_N_RULE_REQUIRES_IRRIGATED"
        :"RICE_IRRIGATION_CONTEXT_REQUIRED",
    ]);
  }
  if(!input.responseClass||input.responseClassApproved!==true){
    const blocked=blockedPlanningNitrogen(["RICE_RESPONSE_CLASS_NOT_RESOLVED"]);
    blocked.riceResponseClass=input.responseClass??null;
    blocked.riceResponseClassApproved=false;
    return blocked;
  }

  const evidence=riceOrganicMatterEvidence(input.labResults);
  if(!evidence.ready){
    const blocked=blockedPlanningNitrogen(evidence.blockers);
    blocked.organicMatterPct=evidence.organicMatterPct;
    blocked.organicMatterBand=evidence.organicMatterBand;
    blocked.sourceSnapshotId=evidence.sourceSnapshotId;
    blocked.riceResponseClass=input.responseClass;
    blocked.riceResponseClassApproved=true;
    return blocked;
  }

  const recommendation=computeRiceContinuousNitrogen({
    profileId:RESEARCH_READY_PROFILES.rice,
    organicMatterPct:evidence.organicMatterPct!,
    responseClass:input.responseClass,
    responseClassApproved:true,
  });

  if(recommendation.dose.kind==="EXACT"){
    return {
      ready:true,
      blockers:[],
      doseKind:"EXACT",
      doseKgNPerHa:recommendation.dose.kgPerHa,
      minimumKgNPerHa:recommendation.dose.kgPerHa,
      maximumKgNPerHa:recommendation.dose.kgPerHa,
      sowingMinimumKgNPerHa:null,
      sowingMaximumKgNPerHa:null,
      ruleId:recommendation.ruleId,
      ruleVersion:recommendation.ruleVersion,
      sourceSnapshotId:evidence.sourceSnapshotId,
      source:recommendation.source,
      requiresAgronomistReview:true,
      precedingCrop:null,
      organicMatterPct:evidence.organicMatterPct,
      organicMatterBand:recommendation.organicMatterBand,
      riceResponseClass:input.responseClass,
      riceResponseClassApproved:true,
    };
  }

  return {
    ready:true,
    blockers:[],
    doseKind:"UPPER_BOUND",
    doseKgNPerHa:null,
    minimumKgNPerHa:0,
    maximumKgNPerHa:recommendation.dose.maxKgPerHa,
    sowingMinimumKgNPerHa:null,
    sowingMaximumKgNPerHa:null,
    ruleId:recommendation.ruleId,
    ruleVersion:recommendation.ruleVersion,
    sourceSnapshotId:evidence.sourceSnapshotId,
    source:recommendation.source,
    requiresAgronomistReview:true,
    precedingCrop:null,
    organicMatterPct:evidence.organicMatterPct,
    organicMatterBand:recommendation.organicMatterBand,
    riceResponseClass:input.responseClass,
    riceResponseClassApproved:true,
  };
}

export function computePlanningNitrogenTarget(input:{
  cropCode:string;
  targetYield:number|null|undefined;
  targetUnit:string|null|undefined;
  labResults:LabResultInput[];
  reanalysisRequired:boolean;
  precedingCropCode:string|null|undefined;
  irrigated?:boolean|null;
  riceResponseClass?:RiceResponseClass|null;
  riceResponseClassApproved?:boolean|null;
}):PlanningNitrogenTarget{
  const crop=input.cropCode.trim().toUpperCase();
  const precedingCrop=wheatPrecedingCropFromPlanningCode(input.precedingCropCode);

  if(input.reanalysisRequired){
    return blockedPlanningNitrogen(["REANALYSIS_REQUIRED_BEFORE_N"],precedingCrop);
  }

  if(crop==="RICE"||crop==="ARROZ"){
    return computePlanningRiceNitrogen({
      labResults:input.labResults,
      reanalysisRequired:input.reanalysisRequired,
      irrigated:input.irrigated,
      responseClass:input.riceResponseClass,
      responseClassApproved:input.riceResponseClassApproved,
    });
  }

  if(crop!=="WHEAT"&&crop!=="TRIGO"){
    return blockedPlanningNitrogen(["N_CROP_RULE_NOT_IMPLEMENTED"],precedingCrop);
  }

  const omRows=soilOrganicMatterRows(input.labResults);
  const allUnits=[...new Set(omRows.map((row)=>row.unit))];
  const percentRows=omRows.filter((row)=>isOrganicMatterPercentUnit(row.unit));

  const readiness=evaluateNitrogenRecommendationReadiness({
    targetCropRaw:"TRIGO",
    yieldGoal:input.targetYield,
    yieldGoalUnit:input.targetUnit,
    organicMatterValuesPct:percentRows.map((row)=>row.value),
    organicMatterUnits:allUnits,
    context:{wheatPrecedingCrop:precedingCrop},
  });

  if(!readiness.ready){
    const blocked=blockedPlanningNitrogen(readiness.blockers,precedingCrop);
    blocked.organicMatterPct=readiness.normalized.representativeOrganicMatterPct;
    blocked.organicMatterBand=readiness.normalized.organicMatterBand;
    return blocked;
  }

  const organicMatterPct=readiness.normalized.representativeOrganicMatterPct!;
  const recommendation=computeWheatNitrogenRecommendation({
    organicMatterPct,
    precedingCrop:precedingCrop!,
    targetYieldTonPerHa:readiness.normalized.targetYieldTonPerHa!,
    lateQualityNitrogenRequested:false,
  });

  return mapWheatRecommendation(
    recommendation,
    precedingCrop!,
    organicMatterPct,
    readiness.normalized.organicMatterBand,
  );
}

function round1(value:number){
  return Math.round((value+Number.EPSILON)*10)/10;
}

export function summarizePlanningNitrogenResults(
  results:Array<{deterministicNitrogen?:PlanningNitrogenTarget|null}>,
  areaHa:number|null|undefined,
){
  const targets=results.map((result)=>result.deterministicNitrogen??null);
  const ready=targets.filter((target):target is PlanningNitrogenTarget=>Boolean(target?.ready));
  const minimumKgPerHa=round1(ready.reduce((sum,target)=>sum+(target.minimumKgNPerHa??0),0));
  const maximumKgPerHa=round1(ready.reduce((sum,target)=>sum+(target.maximumKgNPerHa??0),0));
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
