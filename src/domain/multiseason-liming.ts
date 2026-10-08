import type { LabResultInput } from "./agronomic-engine.ts";
import {
  evaluateSoybeanLimingFromEvidence,
  type SoybeanLimingUniformDecision,
} from "./soybean-liming-evidence.ts";
import {
  LIMING_METHOD_IDS,
  evaluateIntegrated020LimingLayerRequirement,
  selectLimingMethod,
  type LimingMethodScope,
} from "./liming-method-selector.ts";
import { resolveSelectedLimingDecision } from "./liming-method-decision.ts";
import type { SoybeanLimingRestrictionAssessment } from "./soybean-liming-rs-sc-2025.ts";

export type PlanningLimingTarget = {
  ready:boolean;
  status:"BLOCKED"|"NOT_APPLICABLE"|"UNIFORM_APPLY"|"UNIFORM_NO_APPLY"|"SPATIAL"|"DEFERRED";
  blockers:string[];
  warnings:string[];
  uniformDoseTonHaPrnt100:number|null;
  generalDoseTonHaPrnt100:number|null;
  minimumTonHaPrnt100:number|null;
  maximumTonHaPrnt100:number|null;
  applicationMode:"INCORPORATED"|"SURFACE"|null;
  methodId:string|null;
  methodScope:LimingMethodScope|null;
  samplingProfile:string|null;
  sampleCount:number;
  commercialTargetTonHaPrnt100:number|null;
};

export function blockedPlanningLiming(
  blockers:string[],
  status:PlanningLimingTarget["status"]="BLOCKED",
):PlanningLimingTarget{
  return {
    ready:false,
    status,
    blockers:[...new Set(blockers)],
    warnings:[],
    uniformDoseTonHaPrnt100:null,
    generalDoseTonHaPrnt100:null,
    minimumTonHaPrnt100:null,
    maximumTonHaPrnt100:null,
    applicationMode:null,
    methodId:null,
    methodScope:null,
    samplingProfile:null,
    sampleCount:0,
    commercialTargetTonHaPrnt100:null,
  };
}

function mapDecision(
  decision:SoybeanLimingUniformDecision,
  methodId:string|null,
  methodScope:LimingMethodScope|null,
  samplingProfile:string|null,
):PlanningLimingTarget{
  const sampleCount=decision.sampleDecisions.length;
  if(decision.status==="NOT_APPLICABLE"){
    return {
      ...blockedPlanningLiming(["LIMING_CROP_RULE_NOT_APPLICABLE"],"NOT_APPLICABLE"),
      methodId,
      methodScope,
      samplingProfile,
      sampleCount,
      warnings:decision.warnings,
    };
  }
  if(decision.status==="BLOCKED"){
    return {
      ...blockedPlanningLiming(
        decision.blockers.length?decision.blockers:["LIMING_DETERMINISTIC_DECISION_BLOCKED"],
      ),
      methodId,
      methodScope,
      samplingProfile,
      sampleCount,
      warnings:decision.warnings,
    };
  }

  const range=decision.doseRangeTonHaPrnt100;
  const general=decision.automaticGeneralDoseAllowed
    ? decision.operationalGeneralDoseTonHaPrnt100
    : null;
  const commercialTarget=
    methodScope==="APPLICATION_RECOMMENDATION"
    && decision.automaticGeneralDoseAllowed
    && general!=null
    && Number.isFinite(general)
    && general>0
      ? general
      : null;

  return {
    ready:true,
    status:decision.status,
    blockers:decision.blockers,
    warnings:decision.warnings,
    uniformDoseTonHaPrnt100:decision.uniformDoseTonHaPrnt100,
    generalDoseTonHaPrnt100:general,
    minimumTonHaPrnt100:range?.min??decision.uniformDoseTonHaPrnt100,
    maximumTonHaPrnt100:range?.max??decision.uniformDoseTonHaPrnt100,
    applicationMode:decision.applicationMode,
    methodId,
    methodScope,
    samplingProfile,
    sampleCount,
    commercialTargetTonHaPrnt100:commercialTarget,
  };
}

/**
 * A análise-base pode autorizar uma intervenção inicial de calagem.
 * Ela NÃO é reaplicada automaticamente em cada safra do horizonte.
 */
export function computePlanningLimingTarget(input:{
  cropCode:string;
  position:number;
  state:string|null|undefined;
  managementSystem:string|null|undefined;
  labResults:LabResultInput[];
  yearsSinceLastLiming:number|null|undefined;
  restrictionAssessment:SoybeanLimingRestrictionAssessment|null;
  reanalysisRequired:boolean;
}):PlanningLimingTarget{
  if(input.position>0){
    return blockedPlanningLiming(
      ["LIMING_REEVALUATION_REQUIRED_FOR_LATER_CROP"],
      "DEFERRED",
    );
  }

  if(input.reanalysisRequired){
    return blockedPlanningLiming(["REANALYSIS_REQUIRED_BEFORE_LIMING"]);
  }

  const crop=input.cropCode.trim().toUpperCase();
  if(crop!=="SOYBEAN"&&crop!=="SOJA"){
    return blockedPlanningLiming(["LIMING_CROP_RULE_NOT_IMPLEMENTED"],"NOT_APPLICABLE");
  }

  const soilResults=input.labResults
    .filter((row)=>row.sampleType==="SOLO")
    .map((row)=>({
      sampleCode:row.sampleCode,
      parameterCode:row.parameterCode,
      value:row.value,
      unit:row.unit,
      depthFromCm:row.depthFromCm??null,
      depthToCm:row.depthToCm??null,
    }));

  if(soilResults.length===0){
    return blockedPlanningLiming(["LIMING_SAMPLE_RESULTS_REQUIRED"]);
  }

  const methodSelection=selectLimingMethod({
    state:input.state??null,
    cropCode:"SOJA",
    managementSystem:input.managementSystem??null,
    results:soilResults,
  });

  const integrated020Requirement=
    methodSelection.selectedMethodId===LIMING_METHOD_IDS.cqfsRsSc2016Integrated020
      ? evaluateIntegrated020LimingLayerRequirement({
          cropCode:"SOJA",
          results:soilResults,
          allowEqualWeightOperationalAverage:false,
        })
      : null;

  const modernDecision=evaluateSoybeanLimingFromEvidence({
    cropCode:"SOJA",
    state:input.state??null,
    managementSystem:input.managementSystem??null,
    results:soilResults,
    allowEqualWeightOperationalAverage:false,
    yearsSinceLastLiming:input.yearsSinceLastLiming??null,
    restrictionAssessment:input.restrictionAssessment,
  });

  const selected=resolveSelectedLimingDecision({
    cropCode:"SOJA",
    state:input.state??null,
    managementSystem:input.managementSystem??null,
    results:soilResults,
    methodSelection,
    integrated020Requirement,
    modernDecision,
  });

  const mapped=mapDecision(
    selected,
    methodSelection.selectedMethodId,
    methodSelection.scope,
    methodSelection.samplingProfile,
  );

  if(methodSelection.blockers.length){
    mapped.blockers=[...new Set([...mapped.blockers,...methodSelection.blockers])];
    if(!methodSelection.automaticCalculationAllowed)mapped.ready=false;
  }
  mapped.warnings=[...new Set([...mapped.warnings,...methodSelection.warnings])];
  if(!mapped.ready)mapped.commercialTargetTonHaPrnt100=null;
  return mapped;
}

export function summarizeInitialPlanningLiming(
  results:Array<{position:number;deterministicLiming?:PlanningLimingTarget|null}>,
  areaHa:number|null|undefined,
){
  const initial=results.find((result)=>result.position===0)?.deterministicLiming??null;
  if(!initial)return null;
  const validArea=typeof areaHa==="number"&&Number.isFinite(areaHa)&&areaHa>0?areaHa:null;
  const target=initial.commercialTargetTonHaPrnt100;
  return {
    ...initial,
    totalCommercialTargetTon:
      target!=null&&validArea!=null
        ? Math.round((target*validArea+Number.EPSILON)*100)/100
        : null,
  };
}
