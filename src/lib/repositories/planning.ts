import { createHash } from "node:crypto";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { executeMultiseasonPlan } from "@/domain/multiseason-planning";

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
            a.created_at::text AS "createdAt",
            count(lr.id)::int AS "resultCount"
     FROM analyses a
     JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
     JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
     LEFT JOIN lab_samples ls ON ls.tenant_id=a.tenant_id AND ls.analysis_id=a.id
     LEFT JOIN lab_results lr ON lr.tenant_id=ls.tenant_id AND lr.lab_sample_id=ls.id AND lr.numeric_value IS NOT NULL
     WHERE a.tenant_id=$1::uuid
     GROUP BY a.id,f.id,cs.id
     ORDER BY a.created_at DESC`,
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
  const scenario=(await c.query(`SELECT ${scenarioSelect}, f.name AS "fieldName", f.area_ha::float8 AS "areaHa", p.name AS "propertyName", cl.name AS "clientName", ba.code AS "baseAnalysisCode", ba.created_at::text AS "baseAnalysisCreatedAt" FROM planning_scenarios planning_scenarios JOIN fields f ON f.tenant_id=planning_scenarios.tenant_id AND f.id=planning_scenarios.field_id JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id JOIN clients cl ON cl.tenant_id=p.tenant_id AND cl.id=p.client_id LEFT JOIN analyses ba ON ba.tenant_id=planning_scenarios.tenant_id AND ba.id=planning_scenarios.base_analysis_id WHERE planning_scenarios.tenant_id=$1::uuid AND planning_scenarios.id=$2::uuid`,[tenantId,scenarioId])).rows[0];
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
export async function updatePlanningScenario(input:{tenantId:string;userId:string;scenarioId:string;name:string;irrigated?:boolean|null;notes?:string}) { return withTenant({tenantId:input.tenantId,userId:input.userId},async c=>{const row=(await c.query(`UPDATE planning_scenarios SET name=$3,irrigated=$4,notes=$5,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid RETURNING ${scenarioSelect}`,[input.tenantId,input.scenarioId,input.name.trim(),input.irrigated??null,input.notes??""])).rows[0];if(!row)throw new PlanningError("Planejamento não encontrado.",404);return row;}); }
export async function addPlanningCrop(input:{tenantId:string;userId:string;scenarioId:string;cropCode:string;seasonLabel?:string;plannedDate?:string|null;targetYield?:number|null;targetUnit?:string|null;irrigated?:boolean|null;notes?:string}) { return withTenant({tenantId:input.tenantId,userId:input.userId},async c=>{const row=(await c.query(`INSERT INTO planning_scenario_crops(tenant_id,scenario_id,position,crop_code,season_label,planned_date,target_yield,target_unit,irrigated,notes) SELECT $1::uuid,ps.id,coalesce(max(pc.position)+1,0),$3,$4,$5::date,$6,$7,$8,$9 FROM planning_scenarios ps LEFT JOIN planning_scenario_crops pc ON pc.tenant_id=ps.tenant_id AND pc.scenario_id=ps.id WHERE ps.tenant_id=$1::uuid AND ps.id=$2::uuid GROUP BY ps.id RETURNING id::text,position,crop_code AS "cropCode",season_label AS "seasonLabel"`,[input.tenantId,input.scenarioId,input.cropCode,input.seasonLabel??"",input.plannedDate??null,input.targetYield??null,input.targetUnit??null,input.irrigated??null,input.notes??""])).rows[0];if(!row)throw new PlanningError("Planejamento não encontrado.",404);return row;}); }
export async function updatePlanningCrop(input:{tenantId:string;userId:string;scenarioId:string;cropId:string;cropCode:string;seasonLabel?:string;plannedDate?:string|null;targetYield?:number|null;targetUnit?:string|null;irrigated?:boolean|null;notes?:string}) { return withTenant({tenantId:input.tenantId,userId:input.userId},async c=>{const row=(await c.query(`UPDATE planning_scenario_crops SET crop_code=$4,season_label=$5,planned_date=$6::date,target_yield=$7,target_unit=$8,irrigated=$9,notes=$10,updated_at=now() WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid AND id=$3::uuid RETURNING id::text,position,crop_code AS "cropCode",season_label AS "seasonLabel",target_yield::float8 AS "targetYield",target_unit AS "targetUnit",irrigated,notes`,[input.tenantId,input.scenarioId,input.cropId,input.cropCode,input.seasonLabel??"",input.plannedDate??null,input.targetYield??null,input.targetUnit??null,input.irrigated??null,input.notes??""])).rows[0];if(!row)throw new PlanningError("Cultivo não encontrado.",404);return row;}); }
export async function removePlanningCrop(input:{tenantId:string;userId:string;scenarioId:string;cropId:string}) { return withTenant({tenantId:input.tenantId,userId:input.userId},async c=>{const removed=(await c.query(`DELETE FROM planning_scenario_crops WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid AND id=$3::uuid RETURNING position`,[input.tenantId,input.scenarioId,input.cropId])).rows[0];if(!removed)throw new PlanningError("Cultivo não encontrado.",404);await c.query(`UPDATE planning_scenario_crops SET position=position-1,updated_at=now() WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid AND position>$3`,[input.tenantId,input.scenarioId,removed.position]);return getPlanningScenarioWithClient(c,input.tenantId,input.scenarioId);}); }
export async function reorderPlanningCrops(input:{tenantId:string;userId:string;scenarioId:string;cropIds:string[]}) { return withTenant({tenantId:input.tenantId,userId:input.userId},async c=>{const found=(await c.query(`SELECT id::text FROM planning_scenario_crops WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid`,[input.tenantId,input.scenarioId])).rows.map((r:{id:string})=>r.id);if(found.length!==input.cropIds.length||new Set(found).size!==new Set(input.cropIds).size||found.some((id:string)=>!input.cropIds.includes(id)))throw new PlanningError("Cultivos do planejamento não encontrados.",404);for(let i=0;i<input.cropIds.length;i++)await c.query(`UPDATE planning_scenario_crops SET position=$4,updated_at=now() WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid AND id=$3::uuid`,[input.tenantId,input.scenarioId,input.cropIds[i],-(i+1)]);for(let i=0;i<input.cropIds.length;i++)await c.query(`UPDATE planning_scenario_crops SET position=$4,updated_at=now() WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid AND id=$3::uuid`,[input.tenantId,input.scenarioId,input.cropIds[i],i]);return getPlanningScenarioWithClient(c,input.tenantId,input.scenarioId);}); }
export async function calculatePlanningScenario(tenantId:string,scenarioId:string,userId?:string){const scenario=await getPlanningScenario(tenantId,scenarioId,userId);return {scenarioId,results:executeMultiseasonPlan({crops:scenario.crops.map((c:{cropCode:string;targetYield?:number|null;targetUnit?:string|null})=>c),hasBaseEvidence:Boolean(scenario.baseEvidenceReady)})};}
export async function createPlanningSnapshot(tenantId:string,scenarioId:string,userId:string){
  return withTenant({tenantId,userId},async c=>{
    const scenario=await getPlanningScenarioWithClient(c,tenantId,scenarioId);
    const calculation={
      scenarioId,
      results:executeMultiseasonPlan({
        crops:scenario.crops.map((crop:{cropCode:string;targetYield?:number|null;targetUnit?:string|null})=>crop),
        hasBaseEvidence:Boolean(scenario.baseEvidenceReady),
      }),
    };
    const payload={version:1,createdAt:new Date().toISOString(),scenario,calculation};
    const json=JSON.stringify(payload);
    const sha256=createHash("sha256").update(json).digest("hex");
    const row=(await c.query(`INSERT INTO planning_scenario_snapshots(tenant_id,scenario_id,payload,sha256,created_by) VALUES($1::uuid,$2::uuid,$3::jsonb,$4,$5::uuid) RETURNING id::text,sha256,created_at AS "createdAt"`,[tenantId,scenarioId,json,sha256,userId])).rows[0];
    if(!row)throw new PlanningError("Planejamento não encontrado.",404);
    return row;
  });
}
export async function listPlanningSnapshots(tenantId:string,scenarioId:string,userId?:string){return withTenant({tenantId,userId},async c=>(await c.query(`SELECT id::text,sha256,created_at AS "createdAt" FROM planning_scenario_snapshots WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid ORDER BY created_at DESC`,[tenantId,scenarioId])).rows);}
