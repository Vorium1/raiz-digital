import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { executeMultiseasonPlan, resolvePlanningScenarioPersistenceStatus } from "@/domain/multiseason-planning";
import { buildPlanningSnapshotPayload, verifyPlanningSnapshot } from "@/domain/planning-snapshot";

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
  const scenario=(await c.query(`SELECT ${scenarioSelect}, f.name AS "fieldName", f.area_ha::float8 AS "areaHa", p.name AS "propertyName", cl.name AS "clientName", ba.code AS "baseAnalysisCode", base_dates."sampledFrom" AS "baseAnalysisSampledFrom", base_dates."sampledTo" AS "baseAnalysisSampledTo", base_dates."receivedFrom" AS "baseAnalysisReceivedFrom", base_dates."receivedTo" AS "baseAnalysisReceivedTo" FROM planning_scenarios planning_scenarios JOIN fields f ON f.tenant_id=planning_scenarios.tenant_id AND f.id=planning_scenarios.field_id JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id JOIN clients cl ON cl.tenant_id=p.tenant_id AND cl.id=p.client_id LEFT JOIN analyses ba ON ba.tenant_id=planning_scenarios.tenant_id AND ba.id=planning_scenarios.base_analysis_id
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
  const crops=(await c.query(`SELECT id::text, position, crop_code AS "cropCode", season_label AS "seasonLabel", planned_date AS "plannedDate", target_yield::float8 AS "targetYield", target_unit AS "targetUnit", irrigated, notes FROM planning_scenario_crops WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid ORDER BY position,id`,[tenantId,scenarioId])).rows;
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
        hasFertilizationHistory:Boolean(row.fertilizationHistory),
        hasOrganicInputs:Boolean(row.organicInputs),
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

export async function calculatePlanningScenario(tenantId:string,scenarioId:string,userId?:string){
  return withTenant({tenantId,userId},async c=>{
    const scenario=await getPlanningScenarioWithClient(c,tenantId,scenarioId);
    const results=executeMultiseasonPlan({
      crops:scenario.crops.map((crop:{cropCode:string;targetYield?:number|null;targetUnit?:string|null})=>crop),
      hasBaseEvidence:Boolean(scenario.baseEvidenceReady),
    });
    const status=resolvePlanningScenarioPersistenceStatus(results);
    await c.query(
      `UPDATE planning_scenarios SET status=$3,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`,
      [tenantId,scenarioId,status],
    );
    if(userId){
      await writeAudit(c,{
        tenantId,
        userId,
        action:"PLANNING_SCENARIO_CALCULATED",
        entityType:"planning_scenario",
        entityId:scenarioId,
        metadata:{status,cropCount:results.length},
      });
    }
    return {scenarioId,status,results};
  });
}

export async function createPlanningSnapshot(tenantId:string,scenarioId:string,userId:string){
  return withTenant({tenantId,userId},async c=>{
    const scenario=await getPlanningScenarioWithClient(c,tenantId,scenarioId);
    const results=executeMultiseasonPlan({
      crops:scenario.crops.map((crop:{cropCode:string;targetYield?:number|null;targetUnit?:string|null})=>crop),
      hasBaseEvidence:Boolean(scenario.baseEvidenceReady),
    });
    const status=resolvePlanningScenarioPersistenceStatus(results);
    const calculation={scenarioId,status,results};
    const snapshotScenario={...scenario,status};
    const {payload,sha256}=buildPlanningSnapshotPayload({
      createdAt:new Date().toISOString(),
      scenario:snapshotScenario,
      calculation,
    });
    await c.query(
      `UPDATE planning_scenarios SET status=$3,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`,
      [tenantId,scenarioId,status],
    );
    const row=(await c.query(
      `INSERT INTO planning_scenario_snapshots(tenant_id,scenario_id,payload,sha256,created_by)
       VALUES($1::uuid,$2::uuid,$3::jsonb,$4,$5::uuid)
       RETURNING id::text,sha256,created_at AS "createdAt"`,
      [tenantId,scenarioId,JSON.stringify(payload),sha256,userId],
    )).rows[0];
    if(!row)throw new PlanningError("Planejamento não encontrado.",404);
    await writeAudit(c,{
      tenantId,
      userId,
      action:"PLANNING_SCENARIO_SNAPSHOT_CREATED",
      entityType:"planning_scenario_snapshot",
      entityId:row.id,
      metadata:{scenarioId,sha256,status},
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
