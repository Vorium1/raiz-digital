import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { executeMultiseasonPlan, resolvePlanningScenarioPersistenceStatus } from "@/domain/multiseason-planning";
import { buildPlanningSnapshotPayload, verifyPlanningSnapshot } from "@/domain/planning-snapshot";
import { runAgronomicEngine, type CropProfileDef, type LabResultInput } from "@/domain/agronomic-engine";
import { auxiliaryParameterCodesFor } from "@/domain/crop-profile-auxiliary-parameters";
import { normalizeAnalyticalMethod, normalizeUnit } from "@/domain/lab-method-normalization";
import { blockedPlanningPkTargets, computePlanningPkTargets, planningCropProfileCode, summarizePlanningPkResults } from "@/domain/multiseason-pk";
import { blockedPlanningSulfur, computePlanningSulfurTarget, summarizePlanningSulfurResults } from "@/domain/multiseason-sulfur";
import { blockedPlanningNitrogen, computePlanningNitrogenTarget, summarizePlanningNitrogenResults } from "@/domain/multiseason-nitrogen";
import { blockedPlanningLiming, computePlanningLimingTarget, summarizeInitialPlanningLiming } from "@/domain/multiseason-liming";
import { blockedPlanningMicronutrients, computePlanningMicronutrients } from "@/domain/multiseason-micronutrients";
import { getCompatiblePlanningAgroclimateSnapshotsWithClient } from "@/lib/repositories/planning-agroclimate";

export class PlanningError extends Error { constructor(message: string, public status = 400) { super(message); } }
const scenarioSelect = `planning_scenarios.id::text,
  planning_scenarios.field_id::text AS "fieldId",
  planning_scenarios.base_analysis_id::text AS "baseAnalysisId",
  planning_scenarios.name,
  planning_scenarios.status,
  planning_scenarios.irrigated,
  planning_scenarios.notes,
  planning_scenarios.management_system AS "managementSystem",
  planning_scenarios.irrigation_type AS "irrigationType",
  planning_scenarios.irrigation_capacity_notes AS "irrigationCapacityNotes",
  planning_scenarios.water_availability_notes AS "waterAvailabilityNotes",
  planning_scenarios.known_restrictions AS "knownRestrictions",
  planning_scenarios.previous_crop AS "previousCrop",
  planning_scenarios.previous_crop_code AS "previousCropCode",
  planning_scenarios.years_since_last_liming::float8 AS "yearsSinceLastLiming",
  planning_scenarios.liming_yield_below_local_average_drought AS "limingYieldBelowLocalAverageDrought",
  planning_scenarios.liming_compaction_restricts_root_growth AS "limingCompactionRestrictsRootGrowth",
  planning_scenarios.liming_phosphorus_10_20_below_critical AS "limingPhosphorus10To20BelowCritical",
  planning_scenarios.liming_agronomist_confirmed_incorporation AS "limingAgronomistConfirmedIncorporation",
  planning_scenarios.recent_crop_history AS "recentCropHistory",
  planning_scenarios.last_soil_correction AS "lastSoilCorrection",
  planning_scenarios.fertilization_history AS "fertilizationHistory",
  planning_scenarios.organic_inputs AS "organicInputs",
  planning_scenarios.created_at AS "createdAt",
  planning_scenarios.updated_at AS "updatedAt",
  CASE WHEN planning_scenarios.base_analysis_id IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM lab_samples pls
    JOIN lab_results plr ON plr.tenant_id=pls.tenant_id AND plr.lab_sample_id=pls.id
    WHERE pls.tenant_id=planning_scenarios.tenant_id
      AND pls.analysis_id=planning_scenarios.base_analysis_id
      AND plr.numeric_value IS NOT NULL
  ) END AS "baseEvidenceReady"`;

export async function listPlanningBaseAnalyses(tenantId:string,userId?:string){
  return withTenant({tenantId,userId},async c=>(await c.query(
    `SELECT a.id::text,
            a.code,
            f.id::text AS "fieldId",
            f.name AS "fieldName",
            cs.season_label AS "seasonLabel",
            cs.current_crop AS "currentCrop",
            min(ls.sampled_at)::text AS "sampledFrom",
            max(ls.sampled_at)::text AS "sampledTo",
            min(ls.received_at)::text AS "receivedFrom",
            max(ls.received_at)::text AS "receivedTo",
            a.created_at::text AS "registeredAt",
            count(lr.id)::int AS "resultCount"
     FROM analyses a
     JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
     JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
     LEFT JOIN lab_samples ls ON ls.tenant_id=a.tenant_id AND ls.analysis_id=a.id
     LEFT JOIN lab_results lr ON lr.tenant_id=ls.tenant_id AND lr.lab_sample_id=ls.id AND lr.numeric_value IS NOT NULL
     WHERE a.tenant_id=$1::uuid
     GROUP BY a.id,f.id,cs.id
     ORDER BY coalesce(max(ls.sampled_at), a.created_at::date) DESC, a.created_at DESC`,
    [tenantId],
  )).rows);
}
export async function listPlanningScenarios(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async c => (await c.query(`SELECT ${scenarioSelect}, f.name AS "fieldName", f.area_ha::float8 AS "areaHa", p.name AS "propertyName", cl.name AS "clientName", count(pc.id)::int AS "cropCount" FROM planning_scenarios planning_scenarios JOIN fields f ON f.tenant_id=planning_scenarios.tenant_id AND f.id=planning_scenarios.field_id JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id JOIN clients cl ON cl.tenant_id=p.tenant_id AND cl.id=p.client_id LEFT JOIN planning_scenario_crops pc ON pc.tenant_id=planning_scenarios.tenant_id AND pc.scenario_id=planning_scenarios.id GROUP BY planning_scenarios.id,f.id,p.id,cl.id ORDER BY planning_scenarios.updated_at DESC`)).rows);
}
async function getPlanningScenarioWithClient(
  c: import("pg").PoolClient,
  tenantId: string,
  scenarioId: string,
) {
  const scenario=(await c.query(`SELECT ${scenarioSelect}, f.name AS "fieldName", f.area_ha::float8 AS "areaHa", p.name AS "propertyName", p.state AS "state", p.municipality, cl.name AS "clientName", ba.code AS "baseAnalysisCode", base_dates."sampledFrom" AS "baseAnalysisSampledFrom", base_dates."sampledTo" AS "baseAnalysisSampledTo", base_dates."receivedFrom" AS "baseAnalysisReceivedFrom", base_dates."receivedTo" AS "baseAnalysisReceivedTo" FROM planning_scenarios planning_scenarios JOIN fields f ON f.tenant_id=planning_scenarios.tenant_id AND f.id=planning_scenarios.field_id JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id JOIN clients cl ON cl.tenant_id=p.tenant_id AND cl.id=p.client_id LEFT JOIN analyses ba ON ba.tenant_id=planning_scenarios.tenant_id AND ba.id=planning_scenarios.base_analysis_id
LEFT JOIN LATERAL (
  SELECT min(ls.sampled_at)::text AS "sampledFrom",
         max(ls.sampled_at)::text AS "sampledTo",
         min(ls.received_at)::text AS "receivedFrom",
         max(ls.received_at)::text AS "receivedTo"
  FROM lab_samples ls
  WHERE ls.tenant_id=planning_scenarios.tenant_id
    AND ls.analysis_id=planning_scenarios.base_analysis_id
) base_dates ON true
WHERE planning_scenarios.tenant_id=$1::uuid AND planning_scenarios.id=$2::uuid`,[tenantId,scenarioId])).rows[0];
  if(!scenario) throw new PlanningError("Planejamento não encontrado.",404);
  const crops=(await c.query(`SELECT id::text, position, crop_code AS "cropCode", season_label AS "seasonLabel", planned_date::text AS "plannedDate", target_yield::float8 AS "targetYield", target_unit AS "targetUnit", irrigated, notes, updated_at::text AS "updatedAt" FROM planning_scenario_crops WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid ORDER BY position,id`,[tenantId,scenarioId])).rows;
  return {...scenario,crops};
}
export async function getPlanningScenario(tenantId: string, scenarioId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async c => getPlanningScenarioWithClient(c,tenantId,scenarioId));
}
export async function createPlanningScenario(input:{tenantId:string;userId:string;fieldId:string;baseAnalysisId?:string|null;name:string;irrigated?:boolean|null;notes?:string}) {
  return withTenant({tenantId:input.tenantId,userId:input.userId},async c=>{
    const row=(await c.query(
      `INSERT INTO planning_scenarios(tenant_id,field_id,base_analysis_id,name,irrigated,notes,created_by)
       SELECT $1::uuid,f.id,a.id,$4,$5,$6,$7::uuid
       FROM fields f
       LEFT JOIN analyses a
         ON a.tenant_id=f.tenant_id AND a.id=$3::uuid
       LEFT JOIN crop_seasons cs
         ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
       WHERE f.tenant_id=$1::uuid
         AND f.id=$2::uuid
         AND ($3::uuid IS NULL OR (a.id IS NOT NULL AND cs.field_id=f.id))
       RETURNING ${scenarioSelect}`,
      [input.tenantId,input.fieldId,input.baseAnalysisId??null,input.name.trim(),input.irrigated??null,input.notes??"",input.userId],
    )).rows[0];
    if(!row) throw new PlanningError("Talhão ou análise-base compatível não encontrado.",404);
    await writeAudit(c,{tenantId:input.tenantId,userId:input.userId,action:"PLANNING_SCENARIO_CREATED",entityType:"planning_scenario",entityId:row.id,metadata:{name:row.name,hasBaseAnalysis:Boolean(row.baseAnalysisId)}});
    return row;
  });
}
export async function updatePlanningScenario(input:{
  tenantId:string;
  userId:string;
  scenarioId:string;
  name:string;
  irrigated?:boolean|null;
  notes?:string;
  managementSystem?:string|null;
  irrigationType?:string|null;
  irrigationCapacityNotes?:string|null;
  waterAvailabilityNotes?:string|null;
  knownRestrictions?:string|null;
  previousCrop?:string|null;
  previousCropCode?:"SOYBEAN"|"CORN"|"OTHER"|null;
  yearsSinceLastLiming?:number|null;
  limingYieldBelowLocalAverageDrought?:boolean|null;
  limingCompactionRestrictsRootGrowth?:boolean|null;
  limingPhosphorus10To20BelowCritical?:boolean|null;
  limingAgronomistConfirmedIncorporation?:boolean|null;
  recentCropHistory?:string|null;
  lastSoilCorrection?:string|null;
  fertilizationHistory?:string|null;
  organicInputs?:string|null;
}) {
  return withTenant({tenantId:input.tenantId,userId:input.userId},async c=>{
    const row=(await c.query(
      `UPDATE planning_scenarios
       SET name=$3,
           irrigated=$4,
           notes=$5,
           management_system=nullif($6,''),
           irrigation_type=nullif($7,''),
           irrigation_capacity_notes=nullif($8,''),
           water_availability_notes=nullif($9,''),
           known_restrictions=nullif($10,''),
           previous_crop=nullif($11,''),
           recent_crop_history=nullif($12,''),
           last_soil_correction=nullif($13,''),
           fertilization_history=nullif($14,''),
           organic_inputs=nullif($15,''),
           previous_crop_code=$16,
           years_since_last_liming=$17,
           liming_yield_below_local_average_drought=$18,
           liming_compaction_restricts_root_growth=$19,
           liming_phosphorus_10_20_below_critical=$20,
           liming_agronomist_confirmed_incorporation=$21,
           status='DRAFT',
           updated_at=now()
       WHERE tenant_id=$1::uuid AND id=$2::uuid
       RETURNING ${scenarioSelect}`,
      [
        input.tenantId,
        input.scenarioId,
        input.name.trim(),
        input.irrigated??null,
        input.notes??"",
        input.managementSystem?.trim()??"",
        input.irrigationType?.trim()??"",
        input.irrigationCapacityNotes?.trim()??"",
        input.waterAvailabilityNotes?.trim()??"",
        input.knownRestrictions?.trim()??"",
        input.previousCrop?.trim()??"",
        input.recentCropHistory?.trim()??"",
        input.lastSoilCorrection?.trim()??"",
        input.fertilizationHistory?.trim()??"",
        input.organicInputs?.trim()??"",
        input.previousCropCode??null,
        input.yearsSinceLastLiming??null,
        input.limingYieldBelowLocalAverageDrought??null,
        input.limingCompactionRestrictsRootGrowth??null,
        input.limingPhosphorus10To20BelowCritical??null,
        input.limingAgronomistConfirmedIncorporation??null,
      ],
    )).rows[0];
    if(!row)throw new PlanningError("Planejamento não encontrado.",404);
    await writeAudit(c,{
      tenantId:input.tenantId,
      userId:input.userId,
      action:"PLANNING_SCENARIO_CONTEXT_UPDATED",
      entityType:"planning_scenario",
      entityId:row.id,
      metadata:{
        irrigated:row.irrigated,
        hasManagement:Boolean(row.managementSystem),
        hasIrrigationType:Boolean(row.irrigationType),
        hasWaterContext:Boolean(row.waterAvailabilityNotes),
        hasCropHistory:Boolean(row.previousCrop||row.recentCropHistory),
        previousCropCode:row.previousCropCode??null,
        hasFertilizationHistory:Boolean(row.fertilizationHistory),
        hasOrganicInputs:Boolean(row.organicInputs),
        hasLimingStructuredContext:Boolean(
          row.yearsSinceLastLiming!=null
          || row.limingYieldBelowLocalAverageDrought!=null
          || row.limingCompactionRestrictsRootGrowth!=null
          || row.limingPhosphorus10To20BelowCritical!=null
          || row.limingAgronomistConfirmedIncorporation!=null
        ),
      },
    });
    return row;
  });
}
export async function addPlanningCrop(input:{
  tenantId:string;userId:string;scenarioId:string;cropCode:string;seasonLabel?:string;
  plannedDate?:string|null;targetYield?:number|null;targetUnit?:string|null;
  irrigated?:boolean|null;notes?:string;
}) {
  return withTenant({tenantId:input.tenantId,userId:input.userId},async c=>{
    const locked=(await c.query(
      `SELECT id::text FROM planning_scenarios
       WHERE tenant_id=$1::uuid AND id=$2::uuid
       FOR UPDATE`,
      [input.tenantId,input.scenarioId],
    )).rows[0];
    if(!locked)throw new PlanningError("Planejamento não encontrado.",404);

    const nextPosition=Number((await c.query(
      `SELECT coalesce(max(position)+1,0)::int AS position
       FROM planning_scenario_crops
       WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid`,
      [input.tenantId,input.scenarioId],
    )).rows[0]?.position??0);

    const row=(await c.query(
      `INSERT INTO planning_scenario_crops
       (tenant_id,scenario_id,position,crop_code,season_label,planned_date,target_yield,target_unit,irrigated,notes)
       VALUES($1::uuid,$2::uuid,$3,$4,$5,$6::date,$7,$8,$9,$10)
       RETURNING id::text,position,crop_code AS "cropCode",season_label AS "seasonLabel",
                 planned_date AS "plannedDate",target_yield::float8 AS "targetYield",
                 target_unit AS "targetUnit",irrigated,notes`,
      [
        input.tenantId,input.scenarioId,nextPosition,input.cropCode,input.seasonLabel??"",
        input.plannedDate??null,input.targetYield??null,input.targetUnit??null,
        input.irrigated??null,input.notes??"",
      ],
    )).rows[0];

    await c.query(
      `UPDATE planning_scenarios SET status='DRAFT',updated_at=now()
       WHERE tenant_id=$1::uuid AND id=$2::uuid`,
      [input.tenantId,input.scenarioId],
    );
    await writeAudit(c,{
      tenantId:input.tenantId,userId:input.userId,
      action:"PLANNING_CROP_ADDED",entityType:"planning_scenario_crop",entityId:row.id,
      metadata:{scenarioId:input.scenarioId,position:row.position,cropCode:row.cropCode},
    });
    return row;
  });
}

export async function updatePlanningCrop(input:{
  tenantId:string;userId:string;scenarioId:string;cropId:string;cropCode:string;
  seasonLabel?:string;plannedDate?:string|null;targetYield?:number|null;
  targetUnit?:string|null;irrigated?:boolean|null;notes?:string;
}) {
  return withTenant({tenantId:input.tenantId,userId:input.userId},async c=>{
    await c.query(
      `SELECT id FROM planning_scenarios
       WHERE tenant_id=$1::uuid AND id=$2::uuid
       FOR UPDATE`,
      [input.tenantId,input.scenarioId],
    );
    const row=(await c.query(
      `UPDATE planning_scenario_crops
       SET crop_code=$4,season_label=$5,planned_date=$6::date,target_yield=$7,
           target_unit=$8,irrigated=$9,notes=$10,updated_at=now()
       WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid AND id=$3::uuid
       RETURNING id::text,position,crop_code AS "cropCode",season_label AS "seasonLabel",
                 planned_date AS "plannedDate",target_yield::float8 AS "targetYield",
                 target_unit AS "targetUnit",irrigated,notes`,
      [
        input.tenantId,input.scenarioId,input.cropId,input.cropCode,input.seasonLabel??"",
        input.plannedDate??null,input.targetYield??null,input.targetUnit??null,
        input.irrigated??null,input.notes??"",
      ],
    )).rows[0];
    if(!row)throw new PlanningError("Cultivo não encontrado.",404);
    await c.query(
      `UPDATE planning_scenarios SET status='DRAFT',updated_at=now()
       WHERE tenant_id=$1::uuid AND id=$2::uuid`,
      [input.tenantId,input.scenarioId],
    );
    await writeAudit(c,{
      tenantId:input.tenantId,userId:input.userId,
      action:"PLANNING_CROP_UPDATED",entityType:"planning_scenario_crop",entityId:row.id,
      metadata:{scenarioId:input.scenarioId,position:row.position,cropCode:row.cropCode},
    });
    return row;
  });
}

export async function removePlanningCrop(input:{
  tenantId:string;userId:string;scenarioId:string;cropId:string;
}) {
  return withTenant({tenantId:input.tenantId,userId:input.userId},async c=>{
    const scenario=(await c.query(
      `SELECT id::text FROM planning_scenarios
       WHERE tenant_id=$1::uuid AND id=$2::uuid
       FOR UPDATE`,
      [input.tenantId,input.scenarioId],
    )).rows[0];
    if(!scenario)throw new PlanningError("Planejamento não encontrado.",404);

    const removed=(await c.query(
      `DELETE FROM planning_scenario_crops
       WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid AND id=$3::uuid
       RETURNING position,crop_code AS "cropCode"`,
      [input.tenantId,input.scenarioId,input.cropId],
    )).rows[0];
    if(!removed)throw new PlanningError("Cultivo não encontrado.",404);

    await c.query(
      `UPDATE planning_scenario_crops
       SET position=position-1,updated_at=now()
       WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid AND position>$3`,
      [input.tenantId,input.scenarioId,removed.position],
    );
    await c.query(
      `UPDATE planning_scenarios SET status='DRAFT',updated_at=now()
       WHERE tenant_id=$1::uuid AND id=$2::uuid`,
      [input.tenantId,input.scenarioId],
    );
    await writeAudit(c,{
      tenantId:input.tenantId,userId:input.userId,
      action:"PLANNING_CROP_REMOVED",entityType:"planning_scenario",entityId:input.scenarioId,
      metadata:{cropId:input.cropId,position:removed.position,cropCode:removed.cropCode},
    });
    return getPlanningScenarioWithClient(c,input.tenantId,input.scenarioId);
  });
}

export async function reorderPlanningCrops(input:{
  tenantId:string;userId:string;scenarioId:string;cropIds:string[];
}) {
  return withTenant({tenantId:input.tenantId,userId:input.userId},async c=>{
    const scenario=(await c.query(
      `SELECT id::text FROM planning_scenarios
       WHERE tenant_id=$1::uuid AND id=$2::uuid
       FOR UPDATE`,
      [input.tenantId,input.scenarioId],
    )).rows[0];
    if(!scenario)throw new PlanningError("Planejamento não encontrado.",404);

    const found=(await c.query(
      `SELECT id::text FROM planning_scenario_crops
       WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid`,
      [input.tenantId,input.scenarioId],
    )).rows.map((row:{id:string})=>row.id);

    if(
      found.length!==input.cropIds.length
      || new Set(input.cropIds).size!==input.cropIds.length
      || found.some((id:string)=>!input.cropIds.includes(id))
    ) throw new PlanningError("A ordem deve conter exatamente os cultivos deste planejamento.",400);

    for(let index=0;index<input.cropIds.length;index+=1){
      await c.query(
        `UPDATE planning_scenario_crops SET position=$4,updated_at=now()
         WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid AND id=$3::uuid`,
        [input.tenantId,input.scenarioId,input.cropIds[index],-(index+1)],
      );
    }
    for(let index=0;index<input.cropIds.length;index+=1){
      await c.query(
        `UPDATE planning_scenario_crops SET position=$4,updated_at=now()
         WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid AND id=$3::uuid`,
        [input.tenantId,input.scenarioId,input.cropIds[index],index],
      );
    }

    await c.query(
      `UPDATE planning_scenarios SET status='DRAFT',updated_at=now()
       WHERE tenant_id=$1::uuid AND id=$2::uuid`,
      [input.tenantId,input.scenarioId],
    );
    await writeAudit(c,{
      tenantId:input.tenantId,userId:input.userId,
      action:"PLANNING_CROPS_REORDERED",entityType:"planning_scenario",entityId:input.scenarioId,
      metadata:{cropCount:input.cropIds.length},
    });
    return getPlanningScenarioWithClient(c,input.tenantId,input.scenarioId);
  });
}


async function loadPlanningBaseLabResults(
  client: import("pg").PoolClient,
  tenantId: string,
  analysisId: string,
): Promise<LabResultInput[]> {
  const result=await client.query<LabResultInput>(
    `SELECT ls.laboratory_code AS "sampleCode",
            lr.parameter_code AS "parameterCode",
            lr.numeric_value::float8 AS "value",
            lr.unit,
            lr.analytical_method AS "method",
            lr.original_payload->>'protocol' AS "protocol",
            lr.source,
            ls.sample_type AS "sampleType",
            sp.depth_from_cm::float8 AS "depthFromCm",
            sp.depth_to_cm::float8 AS "depthToCm"
     FROM lab_samples ls
     JOIN lab_results lr
       ON lr.tenant_id=ls.tenant_id AND lr.lab_sample_id=ls.id
     LEFT JOIN sample_points sp
       ON sp.tenant_id=ls.tenant_id AND sp.id=ls.sample_point_id
     WHERE ls.tenant_id=$1::uuid AND ls.analysis_id=$2::uuid
     ORDER BY ls.laboratory_code,lr.parameter_code`,
    [tenantId,analysisId],
  );

  return result.rows.map((row)=>({
    ...row,
    unit:normalizeUnit(row.parameterCode,row.unit),
    method:normalizeAnalyticalMethod(row.parameterCode,row.method,row.protocol),
    depthFromCm:row.depthFromCm??null,
    depthToCm:row.depthToCm??null,
  }));
}

async function loadPlanningCropProfile(
  client: import("pg").PoolClient,
  profileCode: string,
): Promise<CropProfileDef|null> {
  const profile=(await client.query<{
    id:string;
    code:string;
    name:string;
    status:"DRAFT"|"ACTIVE"|"SUPERSEDED";
    semanticVersion:string;
    contentHash:string|null;
  }>(
    `SELECT id::text,code,name,status,
            semantic_version AS "semanticVersion",
            content_hash AS "contentHash"
     FROM crop_profiles
     WHERE code=$1
     ORDER BY CASE status WHEN 'ACTIVE' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END,updated_at DESC
     LIMIT 1`,
    [profileCode],
  )).rows[0];
  if(!profile)return null;

  const parameters=(await client.query(
    `SELECT id::text,
            parameter_code AS "parameterCode",
            parameter_category AS "parameterCategory",
            sample_type AS "sampleType",
            depth_from_cm::float8 AS "depthFromCm",
            depth_to_cm::float8 AS "depthToCm",
            analytical_method_allowed AS "analyticalMethodAllowed",
            unit_expected AS "unitExpected",
            sufficiency_ranges AS "sufficiencyRanges",
            criticality,
            status,
            condition_parameter_code AS "conditionParameterCode",
            condition_min::float8 AS "conditionMin",
            condition_max::float8 AS "conditionMax",
            derived_parameter_code AS "derivedParameterCode"
     FROM crop_profile_parameters
     WHERE crop_profile_id=$1::uuid`,
    [profile.id],
  )).rows;

  return {
    ...profile,
    parameters,
    auxiliaryParameterCodes:auxiliaryParameterCodesFor(profile.code),
  } as CropProfileDef;
}

async function enrichPlanningResultsWithDeterministicNutrients(
  client: import("pg").PoolClient,
  tenantId: string,
  scenario: any,
  baseResults: ReturnType<typeof executeMultiseasonPlan>,
){
  if(!scenario.baseAnalysisId||!scenario.baseEvidenceReady){
    return baseResults.map((result)=>({
      ...result,
      targetCropProfile:null,
      deterministicPk:blockedPlanningPkTargets(result.crop.cropCode,["INSUFFICIENT_EVIDENCE"]),
      deterministicSulfur:blockedPlanningSulfur(["INSUFFICIENT_EVIDENCE"]),
      deterministicNitrogen:blockedPlanningNitrogen(["INSUFFICIENT_EVIDENCE"]),
      deterministicLiming:blockedPlanningLiming(["INSUFFICIENT_EVIDENCE"]),
      deterministicMicronutrients:blockedPlanningMicronutrients(["INSUFFICIENT_EVIDENCE"]),
    }));
  }

  const labResults=await loadPlanningBaseLabResults(client,tenantId,scenario.baseAnalysisId);
  if(labResults.length===0){
    return baseResults.map((result)=>({
      ...result,
      targetCropProfile:null,
      deterministicPk:blockedPlanningPkTargets(result.crop.cropCode,["INSUFFICIENT_EVIDENCE"]),
      deterministicSulfur:blockedPlanningSulfur(["INSUFFICIENT_EVIDENCE"]),
      deterministicNitrogen:blockedPlanningNitrogen(["INSUFFICIENT_EVIDENCE"]),
      deterministicLiming:blockedPlanningLiming(["INSUFFICIENT_EVIDENCE"]),
      deterministicMicronutrients:blockedPlanningMicronutrients(["INSUFFICIENT_EVIDENCE"]),
    }));
  }

  const cache=new Map<string,CropProfileDef|null>();
  const enriched=[];

  for(const result of baseResults){
    const profileCode=planningCropProfileCode(result.crop.cropCode);
    if(!profileCode){
      enriched.push({
        ...result,
        limitations:[...new Set([...result.limitations,"TARGET_CROP_PROFILE_NOT_MAPPED"])],
        targetCropProfile:null,
        deterministicPk:blockedPlanningPkTargets(result.crop.cropCode,["PLANNING_CROP_PROFILE_NOT_MAPPED"]),
        deterministicSulfur:blockedPlanningSulfur(["S_CROP_RULE_NOT_IMPLEMENTED"]),
        deterministicNitrogen:blockedPlanningNitrogen(["N_CROP_RULE_NOT_IMPLEMENTED"]),
        deterministicLiming:blockedPlanningLiming(["LIMING_CROP_RULE_NOT_IMPLEMENTED"],"NOT_APPLICABLE"),
        deterministicMicronutrients:blockedPlanningMicronutrients(["MICRO_CROP_RULE_NOT_IMPLEMENTED"]),
      });
      continue;
    }

    let profile=cache.get(profileCode);
    if(profile===undefined){
      profile=await loadPlanningCropProfile(client,profileCode);
      cache.set(profileCode,profile);
    }

    if(!profile||profile.status!=="ACTIVE"){
      enriched.push({
        ...result,
        limitations:[...new Set([...result.limitations,"TARGET_CROP_PROFILE_NOT_ACTIVE"])],
        targetCropProfile:profile?{
          id:profile.id,
          code:profile.code,
          status:profile.status,
          semanticVersion:profile.semanticVersion,
          contentHash:profile.contentHash,
          engineInterpretable:false,
          pendencies:["PROFILE_NOT_ACTIVE"],
        }:null,
        deterministicPk:blockedPlanningPkTargets(result.crop.cropCode,["TARGET_CROP_PROFILE_NOT_ACTIVE"]),
        deterministicSulfur:blockedPlanningSulfur(["TARGET_CROP_PROFILE_NOT_ACTIVE"]),
        deterministicNitrogen:blockedPlanningNitrogen(["TARGET_CROP_PROFILE_NOT_ACTIVE"]),
        deterministicLiming:blockedPlanningLiming(["TARGET_CROP_PROFILE_NOT_ACTIVE"]),
        deterministicMicronutrients:blockedPlanningMicronutrients(["TARGET_CROP_PROFILE_NOT_ACTIVE"]),
      });
      continue;
    }

    const engine=runAgronomicEngine({cropProfile:profile,labResults});
    const deterministicPk=computePlanningPkTargets({
      cropCode:result.crop.cropCode,
      interpretation:engine.interpretation,
      targetYield:result.crop.targetYield,
      targetUnit:result.crop.targetUnit,
      cultivationOrderAfterSoilAnalysis:result.position+1,
      reanalysisRequired:result.reanalysisRequired,
    });
    const deterministicSulfur=computePlanningSulfurTarget({
      cropCode:result.crop.cropCode,
      labResults,
      reanalysisRequired:result.reanalysisRequired,
      irrigated:scenario.crops[result.position]?.irrigated??null,
    });
    const precedingCropCode=result.position===0
      ? scenario.previousCropCode??null
      : scenario.crops[result.position-1]?.cropCode??null;
    const deterministicNitrogen=computePlanningNitrogenTarget({
      cropCode:result.crop.cropCode,
      targetYield:result.crop.targetYield,
      targetUnit:result.crop.targetUnit,
      labResults,
      reanalysisRequired:result.reanalysisRequired,
      precedingCropCode,
    });
    const deterministicLiming=computePlanningLimingTarget({
      cropCode:result.crop.cropCode,
      position:result.position,
      state:scenario.state??null,
      managementSystem:scenario.managementSystem??null,
      labResults,
      yearsSinceLastLiming:scenario.yearsSinceLastLiming??null,
      restrictionAssessment:{
        yieldBelowLocalAverageEspeciallyInDrought:scenario.limingYieldBelowLocalAverageDrought??null,
        compactionRestrictsRootGrowthAtDepth:scenario.limingCompactionRestrictsRootGrowth??null,
        phosphorus10To20BelowCritical:scenario.limingPhosphorus10To20BelowCritical??null,
        agronomistConfirmedIncorporationDecision:scenario.limingAgronomistConfirmedIncorporation??null,
      },
      reanalysisRequired:result.reanalysisRequired,
    });
    const deterministicMicronutrients=computePlanningMicronutrients({
      cropCode:result.crop.cropCode,
      labResults,
      reanalysisRequired:result.reanalysisRequired,
    });

    enriched.push({
      ...result,
      limitations:engine.interpretable
        ? result.limitations
        : [...new Set([...result.limitations,"TARGET_CROP_PROFILE_PARTIAL"])],
      targetCropProfile:{
        id:profile.id,
        code:profile.code,
        status:profile.status,
        semanticVersion:profile.semanticVersion,
        contentHash:profile.contentHash,
        engineInterpretable:engine.interpretable,
        pendencies:engine.pendencies,
      },
      deterministicPk,
      deterministicSulfur,
      deterministicNitrogen,
      deterministicLiming,
      deterministicMicronutrients,
    });
  }

  return enriched;
}

async function buildPlanningCalculationWithClient(
  client: import("pg").PoolClient,
  tenantId: string,
  scenario: any,
){
  if(scenario.baseAnalysisId){
    const locked=(await client.query(
      `SELECT id::text
       FROM analyses
       WHERE tenant_id=$1::uuid AND id=$2::uuid
       FOR SHARE`,
      [tenantId,scenario.baseAnalysisId],
    )).rows[0];
    if(!locked)throw new PlanningError("Análise-base não encontrada nesta empresa.",404);
  }

  const readinessResults=executeMultiseasonPlan({
    crops:scenario.crops.map((crop:{cropCode:string;plannedDate?:string|null;targetYield?:number|null;targetUnit?:string|null})=>crop),
    hasBaseEvidence:Boolean(scenario.baseEvidenceReady),
    baseSampledFrom:scenario.baseAnalysisSampledFrom??null,
  });
  const results=await enrichPlanningResultsWithDeterministicNutrients(client,tenantId,scenario,readinessResults);
  const status=resolvePlanningScenarioPersistenceStatus(results);
  const accumulatedPk=summarizePlanningPkResults(results,scenario.areaHa);
  const accumulatedSulfur=summarizePlanningSulfurResults(results,scenario.areaHa);
  const accumulatedNitrogen=summarizePlanningNitrogenResults(results,scenario.areaHa);
  const initialLiming=summarizeInitialPlanningLiming(results,scenario.areaHa);
  return {scenarioId:scenario.id,status,results,accumulatedPk,accumulatedSulfur,accumulatedNitrogen,initialLiming};
}

export async function getPlanningCalculationPreview(
  tenantId:string,
  scenarioId:string,
  userId?:string,
){
  return withTenant({tenantId,userId},async client=>{
    const scenario=await getPlanningScenarioWithClient(client,tenantId,scenarioId);
    const calculation=await buildPlanningCalculationWithClient(client,tenantId,scenario);
    return {scenario,calculation};
  });
}

export async function calculatePlanningScenario(tenantId:string,scenarioId:string,userId?:string){
  return withTenant({tenantId,userId},async client=>{
    const scenario=await getPlanningScenarioWithClient(client,tenantId,scenarioId);
    const calculation=await buildPlanningCalculationWithClient(client,tenantId,scenario);
    await client.query(
      `UPDATE planning_scenarios SET status=$3,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`,
      [tenantId,scenarioId,calculation.status],
    );
    if(userId){
      await writeAudit(client,{
        tenantId,
        userId,
        action:"PLANNING_SCENARIO_CALCULATED",
        entityType:"planning_scenario",
        entityId:scenarioId,
        metadata:{
          status:calculation.status,
          cropCount:calculation.results.length,
          pkReadyCount:calculation.results.filter((result:any)=>
            result.deterministicPk?.P2O5?.ready || result.deterministicPk?.K2O?.ready
          ).length,
          sulfurReadyCount:calculation.results.filter((result:any)=>
            result.deterministicSulfur?.ready
          ).length,
          nitrogenReadyCount:calculation.results.filter((result:any)=>
            result.deterministicNitrogen?.ready
          ).length,
          limingReadyCount:calculation.results.filter((result:any)=>
            result.deterministicLiming?.ready
          ).length,
          limingCommercialTargetTonHaPrnt100:calculation.initialLiming?.commercialTargetTonHaPrnt100??null,
          micronutrientClassifiedCropCount:calculation.results.filter((result:any)=>
            Object.values(result.deterministicMicronutrients??{}).some((decision:any)=>
              decision.status==="UNIFORM" || decision.status==="SPATIAL"
            )
          ).length,
        },
      });
    }
    return calculation;
  });
}

export async function createPlanningSnapshot(tenantId:string,scenarioId:string,userId:string){
  return withTenant({tenantId,userId},async client=>{
    const scenario=await getPlanningScenarioWithClient(client,tenantId,scenarioId);
    const calculation=await buildPlanningCalculationWithClient(client,tenantId,scenario);
    const scenarioUpdatedAt=new Date(scenario.updatedAt).toISOString();
    const agroclimateByCrop=await getCompatiblePlanningAgroclimateSnapshotsWithClient(client,{
      tenantId,
      scenarioId,
      scenarioUpdatedAt,
      crops:scenario.crops.map((crop:{id:string;updatedAt:string})=>({
        id:crop.id,
        updatedAt:crop.updatedAt,
      })),
    });
    const frozenCalculation={...calculation,agroclimateByCrop};
    const snapshotScenario={...scenario,status:calculation.status};
    const {payload,sha256}=buildPlanningSnapshotPayload({
      createdAt:new Date().toISOString(),
      scenario:snapshotScenario,
      calculation:frozenCalculation,
    });

    await client.query(
      `UPDATE planning_scenarios SET status=$3,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`,
      [tenantId,scenarioId,calculation.status],
    );
    const row=(await client.query(
      `INSERT INTO planning_scenario_snapshots(tenant_id,scenario_id,payload,sha256,created_by)
       VALUES($1::uuid,$2::uuid,$3::jsonb,$4,$5::uuid)
       RETURNING id::text,sha256,created_at AS "createdAt"`,
      [tenantId,scenarioId,JSON.stringify(payload),sha256,userId],
    )).rows[0];
    if(!row)throw new PlanningError("Planejamento não encontrado.",404);

    await writeAudit(client,{
      tenantId,
      userId,
      action:"PLANNING_SCENARIO_SNAPSHOT_CREATED",
      entityType:"planning_scenario_snapshot",
      entityId:row.id,
      metadata:{scenarioId,sha256,status:calculation.status},
    });
    return row;
  });
}

export async function getPlanningSnapshot(
  tenantId:string,
  scenarioId:string,
  snapshotId:string,
  userId?:string,
){
  return withTenant({tenantId,userId},async c=>{
    const row=(await c.query(
      `SELECT id::text,payload,sha256,created_at::text AS "createdAt"
       FROM planning_scenario_snapshots
       WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid AND id=$3::uuid`,
      [tenantId,scenarioId,snapshotId],
    )).rows[0];
    if(!row)throw new PlanningError("Snapshot de planejamento não encontrado.",404);
    const version=Number(row.payload?.version??1);
    if(version>=2&&!verifyPlanningSnapshot(row.payload,row.sha256)){
      throw new PlanningError("Integridade do snapshot de planejamento não confere.",409);
    }
    return {
      ...row,
      integrity:version>=2?"VERIFIED":"LEGACY_UNVERIFIABLE",
    };
  });
}

export async function listPlanningSnapshots(tenantId:string,scenarioId:string,userId?:string){return withTenant({tenantId,userId},async c=>(await c.query(`SELECT id::text,sha256,created_at AS "createdAt" FROM planning_scenario_snapshots WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid ORDER BY created_at DESC`,[tenantId,scenarioId])).rows);}
