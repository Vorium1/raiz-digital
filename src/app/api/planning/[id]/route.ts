import { getPlatformSession } from "@/lib/auth/session";
import { getPlanningScenario, updatePlanningScenario, PlanningError } from "@/lib/repositories/planning";

const writers=new Set(["SUPER_ADMIN","TENANT_ADMIN","AGRONOMIST"]);
const previousCropCodes=new Set(["SOYBEAN","CORN","OTHER"]);

function optionalText(value:unknown,label:string,max=5000){
  if(value==null)return null;
  if(typeof value!=="string")throw new PlanningError(`${label} inválido.`,400);
  const clean=value.trim();
  if(clean.length>max)throw new PlanningError(`${label} deve ter no máximo ${max} caracteres.`,400);
  return clean||null;
}

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  const s=await getPlatformSession();
  if(!s)return Response.json({error:"Sessão necessária."},{status:401});
  try{
    return Response.json({scenario:await getPlanningScenario(s.tenantId,(await params).id,s.userId)});
  }catch(e){
    return Response.json(
      {error:e instanceof PlanningError?e.message:"Planejamento não encontrado."},
      {status:e instanceof PlanningError?e.status:422},
    );
  }
}

export async function PATCH(r:Request,{params}:{params:Promise<{id:string}>}){
  const s=await getPlatformSession();
  if(!s)return Response.json({error:"Sessão necessária."},{status:401});
  if(!writers.has(s.role))return Response.json({error:"Perfil sem permissão."},{status:403});

  try{
    const b=await r.json() as Record<string,unknown>;
    const name=typeof b.name==="string"?b.name.trim():"";
    if(!name||name.length>160)return Response.json({error:"Nome necessário e com até 160 caracteres."},{status:400});

    const irrigated=b.irrigated===true?true:b.irrigated===false?false:null;
    const previousCropCodeRaw=typeof b.previousCropCode==="string"&&b.previousCropCode.trim()
      ? b.previousCropCode.trim().toUpperCase()
      : null;
    if(previousCropCodeRaw&&!previousCropCodes.has(previousCropCodeRaw)){
      return Response.json({error:"Categoria estruturada da cultura anterior inválida."},{status:400});
    }
    const scenario=await updatePlanningScenario({
      tenantId:s.tenantId,
      userId:s.userId,
      scenarioId:(await params).id,
      name,
      irrigated,
      notes:optionalText(b.notes,"Observações")??"",
      managementSystem:optionalText(b.managementSystem,"Sistema de manejo",160),
      irrigationType:optionalText(b.irrigationType,"Tipo de irrigação",160),
      irrigationCapacityNotes:optionalText(b.irrigationCapacityNotes,"Capacidade/limitação de irrigação"),
      waterAvailabilityNotes:optionalText(b.waterAvailabilityNotes,"Disponibilidade hídrica"),
      knownRestrictions:optionalText(b.knownRestrictions,"Restrições conhecidas"),
      previousCrop:optionalText(b.previousCrop,"Cultura anterior",160),
      previousCropCode:previousCropCodeRaw as "SOYBEAN"|"CORN"|"OTHER"|null,
      recentCropHistory:optionalText(b.recentCropHistory,"Histórico recente de culturas"),
      lastSoilCorrection:optionalText(b.lastSoilCorrection,"Última correção de solo"),
      fertilizationHistory:optionalText(b.fertilizationHistory,"Histórico de adubação"),
      organicInputs:optionalText(b.organicInputs,"Matéria orgânica/insumos orgânicos"),
    });
    return Response.json({scenario});
  }catch(e){
    return Response.json(
      {error:e instanceof PlanningError?e.message:"Não foi possível atualizar."},
      {status:e instanceof PlanningError?e.status:422},
    );
  }
}
