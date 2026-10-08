import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import {
  fetchAgritecMunicipalities,
  fetchAgritecMunicipalityCultures,
  fetchAgritecZarcWindows,
} from "@/lib/agroclimate/embrapa-agritec-zarc-provider";
import {
  agritecCropBaseName,
  assessAgritecPlanningDate,
  resolveAgritecCultureExact,
  resolveAgritecMunicipalityExact,
} from "@/domain/multiseason-zarc";

export class PlanningAgroclimateError extends Error {
  constructor(message:string, readonly status=422, readonly details?:unknown) {
    super(message);
    this.name="PlanningAgroclimateError";
  }
}

function errorCode(error:unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message.trim().slice(0,180)
    : "AGRITEC_UNAVAILABLE";
}

function timestamp(value:unknown) {
  const date=value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function getTargetContext(input:{
  tenantId:string;
  userId:string;
  scenarioId:string;
  cropId:string;
}) {
  return withTenant({tenantId:input.tenantId,userId:input.userId}, async client => {
    const row=(await client.query(
      `SELECT
         ps.id::text AS "scenarioId",
         ps.updated_at AS "scenarioUpdatedAt",
         pc.id::text AS "cropId",
         pc.position,
         pc.crop_code AS "cropCode",
         pc.season_label AS "seasonLabel",
         pc.planned_date::text AS "plannedDate",
         pc.irrigated,
         pc.updated_at AS "cropUpdatedAt",
         p.municipality,
         p.state
       FROM planning_scenarios ps
       JOIN planning_scenario_crops pc
         ON pc.tenant_id=ps.tenant_id AND pc.scenario_id=ps.id
       JOIN fields f
         ON f.tenant_id=ps.tenant_id AND f.id=ps.field_id
       JOIN properties p
         ON p.tenant_id=f.tenant_id AND p.id=f.property_id
       WHERE ps.tenant_id=$1::uuid
         AND ps.id=$2::uuid
         AND pc.id=$3::uuid`,
      [input.tenantId,input.scenarioId,input.cropId],
    )).rows[0];
    if(!row) throw new PlanningAgroclimateError("Cenário ou cultivo não encontrado.",404);
    return {
      ...row,
      scenarioUpdatedAt:timestamp(row.scenarioUpdatedAt),
      cropUpdatedAt:timestamp(row.cropUpdatedAt),
    };
  });
}

export async function refreshPlanningCropZarcSnapshot(input:{
  tenantId:string;
  userId:string;
  scenarioId:string;
  cropId:string;
  sourceTimeoutMs?:number;
}) {
  const target=await getTargetContext(input);
  if(!target.plannedDate) {
    throw new PlanningAgroclimateError(
      "Informe a data prevista do cultivo antes de consultar o ZARC.",
      422,
      {code:"PLANNED_DATE_REQUIRED_FOR_ZARC"},
    );
  }

  const expectedCropBaseName=agritecCropBaseName(target.cropCode);
  if(!expectedCropBaseName) {
    throw new PlanningAgroclimateError(
      "A cultura ainda não possui integração ZARC homologada no planejamento.",
      422,
      {code:"AGRITEC_PLANNING_CROP_NOT_SUPPORTED"},
    );
  }

  const accessToken=process.env.AGROAPI_ACCESS_TOKEN?.trim() ?? "";
  if(!accessToken) {
    throw new PlanningAgroclimateError(
      "A integração oficial Agritec/Embrapa ainda não está configurada neste ambiente.",
      503,
      {code:"AGROAPI_ACCESS_TOKEN_REQUIRED"},
    );
  }

  let municipalityResult:Awaited<ReturnType<typeof fetchAgritecMunicipalities>>;
  let cultureListResult:Awaited<ReturnType<typeof fetchAgritecMunicipalityCultures>>;
  let zarcResult:Awaited<ReturnType<typeof fetchAgritecZarcWindows>>;

  try {
    municipalityResult=await fetchAgritecMunicipalities({
      accessToken,
      stateCode:target.state,
      timeoutMs:input.sourceTimeoutMs,
    });
    const municipalityResolution=resolveAgritecMunicipalityExact({
      municipalities:municipalityResult.municipalities,
      municipalityName:target.municipality,
      stateCode:target.state,
    });
    if(municipalityResolution.status!=="READY") {
      throw new PlanningAgroclimateError(
        "O município cadastrado não pôde ser ligado de forma única ao município oficial da Agritec.",
        422,
        {code:municipalityResolution.warnings[0] ?? municipalityResolution.status},
      );
    }
    const municipality=municipalityResolution.municipality;

    cultureListResult=await fetchAgritecMunicipalityCultures({
      accessToken,
      ibgeMunicipalityCode:municipality.ibgeCode,
      timeoutMs:input.sourceTimeoutMs,
    });
    const cultureResolution=resolveAgritecCultureExact({
      cultures:cultureListResult.cultures,
      cropCode:target.cropCode,
      irrigated:target.irrigated,
    });
    if(cultureResolution.status!=="READY") {
      const message=cultureResolution.status==="WATER_CONDITION_REQUIRED"
        ? "Informe se este cultivo é irrigado ou sequeiro antes de consultar o ZARC."
        : "A cultura do planejamento não pôde ser ligada de forma única à cultura oficial da Agritec.";
      throw new PlanningAgroclimateError(
        message,
        422,
        {code:cultureResolution.warnings[0] ?? cultureResolution.status},
      );
    }
    const culture=cultureResolution.culture;

    zarcResult=await fetchAgritecZarcWindows({
      accessToken,
      agritecCultureId:culture.id,
      ibgeMunicipalityCode:municipality.ibgeCode,
      timeoutMs:input.sourceTimeoutMs,
    });

    const assessment=assessAgritecPlanningDate({
      windows:zarcResult.windows,
      plannedDate:target.plannedDate,
      municipalityName:municipality.name,
      stateCode:municipality.stateCode,
      expectedCropBaseName,
    });

    return withTenant({tenantId:input.tenantId,userId:input.userId}, async client => {
      const locked=(await client.query(
        `SELECT ps.updated_at AS "scenarioUpdatedAt", pc.updated_at AS "cropUpdatedAt"
         FROM planning_scenarios ps
         JOIN planning_scenario_crops pc
           ON pc.tenant_id=ps.tenant_id AND pc.scenario_id=ps.id
         WHERE ps.tenant_id=$1::uuid
           AND ps.id=$2::uuid
           AND pc.id=$3::uuid
         FOR SHARE OF ps, pc`,
        [input.tenantId,input.scenarioId,input.cropId],
      )).rows[0];
      if(!locked) throw new PlanningAgroclimateError("Cenário ou cultivo não encontrado.",404);

      if(
        timestamp(locked.scenarioUpdatedAt)!==target.scenarioUpdatedAt
        || timestamp(locked.cropUpdatedAt)!==target.cropUpdatedAt
      ) {
        throw new PlanningAgroclimateError(
          "O planejamento mudou durante a consulta ZARC. Atualize novamente para congelar a versão atual.",
          409,
          {code:"PLANNING_CHANGED_DURING_ZARC_FETCH"},
        );
      }

      const sourceUrls=[
        municipalityResult.sourceUrl,
        cultureListResult.sourceUrl,
        zarcResult.sourceUrl,
      ];

      const row=(await client.query(
        `INSERT INTO planning_crop_agroclimate_snapshots
         (tenant_id,scenario_id,planning_crop_id,provider,provider_version,source_urls,retrieved_at,
          municipality_name,state_code,ibge_municipality_code,crop_code,agritec_culture_id,planned_date,
          assessment,source_windows,source_scenario_updated_at,source_crop_updated_at,created_by)
         VALUES
         ($1::uuid,$2::uuid,$3::uuid,'EMBRAPA_AGRITEC_V2','v2',$4::jsonb,$5::timestamptz,
          $6,$7,$8,$9,$10,$11::date,$12::jsonb,$13::jsonb,$14::timestamptz,$15::timestamptz,$16::uuid)
         RETURNING id::text,provider,provider_version AS "providerVersion",
                   source_urls AS "sourceUrls",retrieved_at::text AS "retrievedAt",
                   municipality_name AS "municipalityName",state_code AS "stateCode",
                   ibge_municipality_code AS "ibgeMunicipalityCode",crop_code AS "cropCode",
                   agritec_culture_id AS "agritecCultureId",planned_date::text AS "plannedDate",
                   assessment,created_at::text AS "createdAt"`,
        [
          input.tenantId,input.scenarioId,input.cropId,JSON.stringify(sourceUrls),zarcResult.retrievedAt,
          municipality.name,municipality.stateCode,municipality.ibgeCode,target.cropCode,culture.id,target.plannedDate,
          JSON.stringify(assessment),JSON.stringify(zarcResult.windows),target.scenarioUpdatedAt,target.cropUpdatedAt,
          input.userId,
        ],
      )).rows[0];
      if(!row) throw new PlanningAgroclimateError("Não foi possível congelar a evidência ZARC.",500);

      await writeAudit(client,{
        tenantId:input.tenantId,
        userId:input.userId,
        action:"PLANNING_CROP_ZARC_SNAPSHOT_CREATED",
        entityType:"planning_crop_agroclimate_snapshot",
        entityId:row.id,
        metadata:{
          scenarioId:input.scenarioId,
          planningCropId:input.cropId,
          cropCode:target.cropCode,
          plannedDate:target.plannedDate,
          provider:"EMBRAPA_AGRITEC_V2",
          assessmentStatus:assessment.status,
          riskLevelsPct:assessment.riskLevelsPct,
          agritecCultureId:culture.id,
          ibgeMunicipalityCode:municipality.ibgeCode,
        },
      });
      return row;
    });
  } catch(error) {
    if(error instanceof PlanningAgroclimateError) throw error;
    throw new PlanningAgroclimateError(
      "A fonte oficial Agritec/Embrapa não pôde ser consultada agora.",
      503,
      {code:errorCode(error)},
    );
  }
}

export async function listPlanningCropZarcSnapshots(input:{
  tenantId:string;
  userId:string;
  scenarioId:string;
  cropId:string;
  limit?:number;
}) {
  const limit=Math.min(Math.max(Math.floor(input.limit ?? 10),1),50);
  return withTenant({tenantId:input.tenantId,userId:input.userId}, async client => {
    return (await client.query(
      `SELECT id::text,provider,provider_version AS "providerVersion",
              source_urls AS "sourceUrls",retrieved_at::text AS "retrievedAt",
              municipality_name AS "municipalityName",state_code AS "stateCode",
              ibge_municipality_code AS "ibgeMunicipalityCode",crop_code AS "cropCode",
              agritec_culture_id AS "agritecCultureId",planned_date::text AS "plannedDate",
              assessment,source_scenario_updated_at::text AS "sourceScenarioUpdatedAt",
              source_crop_updated_at::text AS "sourceCropUpdatedAt",created_at::text AS "createdAt"
       FROM planning_crop_agroclimate_snapshots
       WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid AND planning_crop_id=$3::uuid
       ORDER BY created_at DESC,id DESC
       LIMIT $4`,
      [input.tenantId,input.scenarioId,input.cropId,limit],
    )).rows;
  });
}
