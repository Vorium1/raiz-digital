import {
  evaluateNitrogenRecommendationReadiness,
  isOrganicMatterPercentUnit,
} from "./nitrogen-context.ts";
import {
  computeWheatNitrogenRecommendation,
  type NitrogenRecommendation,
} from "./nitrogen-dose-engine.ts";
import type { LabResultInput } from "./agronomic-engine.ts";

export type PlanningPreviousCropCode = "SOYBEAN" | "CORN" | "OTHER" | null;

export type PlanningNitrogenTarget = {
  ready:boolean;
  blockers:string[];
  doseKind:"EXACT"|"RANGE"|"BLOCKED";
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
  };
}

function soilOrganicMatterRows(results:LabResultInput[]){
  const codes=new Set(["OM","MO","ORGANIC_MATTER"]);
  return results.filter((row)=>
    row.sampleType==="SOLO"
    && codes.has(row.parameterCode.trim().toUpperCase())
  );
}

export function computePlanningNitrogenTarget(input:{
  cropCode:string;
  targetYield:number|null|undefined;
  targetUnit:string|null|undefined;
  labResults:LabResultInput[];
  reanalysisRequired:boolean;
  precedingCropCode:string|null|undefined;
}):PlanningNitrogenTarget{
  const crop=input.cropCode.trim().toUpperCase();
  const precedingCrop=wheatPrecedingCropFromPlanningCode(input.precedingCropCode);

  if(input.reanalysisRequired){
    return blockedPlanningNitrogen(["REANALYSIS_REQUIRED_BEFORE_N"],precedingCrop);
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
