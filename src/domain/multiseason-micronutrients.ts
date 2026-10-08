import type { LabResultInput } from "./agronomic-engine.ts";
import {
  classifyMicronutrientCqfs2016,
  type Micronutrient,
  type MicronutrientClass,
  type MicronutrientMethod,
  type SupportedMicronutrientCrop,
} from "./research-ready-rules.ts";

export type PlanningMicronutrientPoint = {
  sampleCode:string;
  valueMgPerDm3:number|null;
  classification:MicronutrientClass|null;
  blocker:string|null;
  ruleId:string|null;
  ruleVersion:string|null;
  doseKgPerHa:null;
};

export type PlanningMicronutrientDecision = {
  nutrient:Micronutrient;
  status:"NOT_AVAILABLE"|"BLOCKED"|"UNIFORM"|"SPATIAL";
  classification:MicronutrientClass|null;
  pointClassifications:PlanningMicronutrientPoint[];
  blockers:string[];
  doseKgPerHa:null;
  source:string|null;
};

export type PlanningMicronutrients = Record<Micronutrient,PlanningMicronutrientDecision>;

const NUTRIENTS:Micronutrient[]=["B","ZN","CU","MN"];

function cropCode(value:string):SupportedMicronutrientCrop|null{
  const code=value.trim().toUpperCase();
  if(code==="SOYBEAN"||code==="SOJA")return "SOJA";
  if(code==="WHEAT"||code==="TRIGO")return "TRIGO";
  return null;
}

function methodFor(nutrient:Micronutrient,method:string):MicronutrientMethod|null{
  if(nutrient==="B"&&method==="Água quente, colorimetria com curcumina")return "HOT_WATER";
  if((nutrient==="ZN"||nutrient==="CU")&&method==="Mehlich-1")return "MEHLICH_1";
  if(nutrient==="MN"&&method==="KCl 1 mol/L (acidificado com HCl 2%)")return "KCL_1M_ACIDIFIED_EXTRACT";
  return null;
}

function emptyDecision(
  nutrient:Micronutrient,
  status:"NOT_AVAILABLE"|"BLOCKED",
  blockers:string[],
):PlanningMicronutrientDecision{
  return {
    nutrient,
    status,
    classification:null,
    pointClassifications:[],
    blockers:[...new Set(blockers)],
    doseKgPerHa:null,
    source:null,
  };
}

function canonicalMgDm3(unit:string){
  return unit==="mg/dm³"||unit==="mg/dm3";
}

function decisionForNutrient(input:{
  crop:SupportedMicronutrientCrop;
  nutrient:Micronutrient;
  labResults:LabResultInput[];
}):PlanningMicronutrientDecision{
  const rows=input.labResults.filter((row)=>
    row.sampleType==="SOLO"
    && row.parameterCode.trim().toUpperCase()===input.nutrient
  );
  if(rows.length===0)return emptyDecision(input.nutrient,"NOT_AVAILABLE",["MICRO_NO_OBSERVATION"]);

  const grouped=new Map<string,LabResultInput[]>();
  for(const row of rows){
    const list=grouped.get(row.sampleCode)??[];
    list.push(row);
    grouped.set(row.sampleCode,list);
  }

  const points:PlanningMicronutrientPoint[]=[];
  const blockers:string[]=[];
  let source:string|null=null;

  for(const [sampleCode,sampleRows] of grouped){
    const first=sampleRows[0];
    const conflict=sampleRows.some((row)=>
      Math.abs(row.value-first.value)>1e-9
      || row.unit!==first.unit
      || row.method!==first.method
      || row.depthFromCm!==first.depthFromCm
      || row.depthToCm!==first.depthToCm
    );
    if(conflict){
      const blocker=`MICRO_DUPLICATE_CONFLICT:${sampleCode}:${input.nutrient}`;
      blockers.push(blocker);
      points.push({
        sampleCode,
        valueMgPerDm3:null,
        classification:null,
        blocker,
        ruleId:null,
        ruleVersion:null,
        doseKgPerHa:null,
      });
      continue;
    }

    if(!Number.isFinite(first.value)||first.value<0){
      const blocker=`MICRO_VALUE_INVALID:${sampleCode}:${input.nutrient}`;
      blockers.push(blocker);
      points.push({sampleCode,valueMgPerDm3:null,classification:null,blocker,ruleId:null,ruleVersion:null,doseKgPerHa:null});
      continue;
    }
    if(!canonicalMgDm3(first.unit)){
      const blocker=`MICRO_UNIT_NOT_VALIDATED:${sampleCode}:${input.nutrient}`;
      blockers.push(blocker);
      points.push({sampleCode,valueMgPerDm3:first.value,classification:null,blocker,ruleId:null,ruleVersion:null,doseKgPerHa:null});
      continue;
    }
    if(first.depthFromCm!==0||first.depthToCm!==20){
      const blocker=`MICRO_DEPTH_NOT_0_20_CM:${sampleCode}:${input.nutrient}`;
      blockers.push(blocker);
      points.push({sampleCode,valueMgPerDm3:first.value,classification:null,blocker,ruleId:null,ruleVersion:null,doseKgPerHa:null});
      continue;
    }
    const method=methodFor(input.nutrient,first.method);
    if(!method){
      const blocker=`MICRO_METHOD_NOT_VALIDATED:${sampleCode}:${input.nutrient}`;
      blockers.push(blocker);
      points.push({sampleCode,valueMgPerDm3:first.value,classification:null,blocker,ruleId:null,ruleVersion:null,doseKgPerHa:null});
      continue;
    }

    try{
      const classified=classifyMicronutrientCqfs2016({
        crop:input.crop,
        nutrient:input.nutrient,
        valueMgPerDm3:first.value,
        method,
        // A evidência foi validada acima como mg/dm³ ou mg/dm3; só a grafia muda na borda.
        unit:"mg/dm3",
        depthProtocolValidated:true,
      });
      source=classified.source;
      points.push({
        sampleCode,
        valueMgPerDm3:first.value,
        classification:classified.classification,
        blocker:null,
        ruleId:classified.ruleId,
        ruleVersion:classified.ruleVersion,
        doseKgPerHa:null,
      });
    }catch{
      const blocker=`MICRO_RULE_EXECUTION_BLOCKED:${sampleCode}:${input.nutrient}`;
      blockers.push(blocker);
      points.push({sampleCode,valueMgPerDm3:first.value,classification:null,blocker,ruleId:null,ruleVersion:null,doseKgPerHa:null});
    }
  }

  if(blockers.length){
    return {
      nutrient:input.nutrient,
      status:"BLOCKED",
      classification:null,
      pointClassifications:points,
      blockers:[...new Set(blockers)],
      doseKgPerHa:null,
      source,
    };
  }

  const classes=[...new Set(points.map((point)=>point.classification).filter((value):value is MicronutrientClass=>value!=null))];
  return {
    nutrient:input.nutrient,
    status:classes.length===1?"UNIFORM":"SPATIAL",
    classification:classes.length===1?classes[0]:null,
    pointClassifications:points,
    blockers:[],
    doseKgPerHa:null,
    source,
  };
}

export function blockedPlanningMicronutrients(blockers:string[]):PlanningMicronutrients{
  return Object.fromEntries(NUTRIENTS.map((nutrient)=>[
    nutrient,
    emptyDecision(nutrient,"BLOCKED",blockers),
  ])) as PlanningMicronutrients;
}

export function computePlanningMicronutrients(input:{
  cropCode:string;
  labResults:LabResultInput[];
  reanalysisRequired:boolean;
}):PlanningMicronutrients{
  const crop=cropCode(input.cropCode);
  if(input.reanalysisRequired){
    return blockedPlanningMicronutrients(["REANALYSIS_REQUIRED_BEFORE_MICRONUTRIENT_CLASSIFICATION"]);
  }
  if(!crop){
    return blockedPlanningMicronutrients(["MICRO_CROP_RULE_NOT_IMPLEMENTED"]);
  }
  return Object.fromEntries(NUTRIENTS.map((nutrient)=>[
    nutrient,
    decisionForNutrient({crop,nutrient,labResults:input.labResults}),
  ])) as PlanningMicronutrients;
}
