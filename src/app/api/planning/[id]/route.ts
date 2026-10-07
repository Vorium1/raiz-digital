import { getPlatformSession } from "@/lib/auth/session";
import { getPlanningScenario, updatePlanningScenario, PlanningError } from "@/lib/repositories/planning";

const writers=new Set(["SUPER_ADMIN","TENANT_ADMIN","AGRONOMIST"]);
const previousCropCodes=new Set(["SOYBEAN","CORN","OTHER"]);
const managementSystems=new Set(["CONVENTIONAL","NO_TILL_ESTABLISHMENT","NO_TILL_CONSOLIDATED_UNSPECIFIED","NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS","NO_TILL_CONSOLIDATED_WITH_10_20_RESTRICTIONS","OTHER"]);

function optionalNonNegativeNumber(value:unknown,label:string){
  if(value==null||value==="")return null;
  const n=typeof value==="number"?value:Number(value);
  if(!Number.isFinite(n)||n<0)throw new PlanningError(`${label} deve ser número maior ou igual a zero.`,400);
  return Math.round(n*100)/100;
}
function nullableBoolean(value:unknown,label:string){
  if(value==null||value==="")return null;
  if(value===true||value===false)return value;
  throw new PlanningError(`${label} deve ser sim, não ou não informado.`,400);
}

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
    const managementSystemRaw=typeof b.managementSystem==="string"&&b.managementSystem.trim()
      ? b.managementSystem.trim().toUpperCase()
      : null;
    if(managementSystemRaw&&!managementSystems.has(managementSystemRaw)){
      return Response.json({error:"Sistema de manejo estruturado inválido."},{status:400});
    }

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
      managementSystem:managementSystemRaw,
      irrigationType:optionalText(b.irrigationType,"Tipo de irrigação",160),
      irrigationCapacityNotes:optionalText(b.irrigationCapacityNotes,"Capacidade/limitação de irrigação"),
      waterAvailabilityNotes:optionalText(b.waterAvailabilityNotes,"Disponibilidade hídrica"),
      knownRestrictions:optionalText(b.knownRestrictions,"Restrições conhecidas"),
      previousCrop:optionalText(b.previousCrop,"Cultura anterior",160),
      previousCropCode:previousCropCodeRaw as "SOYBEAN"|"CORN"|"OTHER"|null,
      yearsSinceLastLiming:optionalNonNegativeNumber(b.yearsSinceLastLiming,"Anos desde a última calagem"),
      limingYieldBelowLocalAverageDrought:nullableBoolean(b.limingYieldBelowLocalAverageDrought,"Produtividade abaixo da média local em seca"),
      limingCompactionRestrictsRootGrowth:nullableBoolean(b.limingCompactionRestrictsRootGrowth,"Compactação restringindo raízes"),
      limingPhosphorus10To20BelowCritical:nullableBoolean(b.limingPhosphorus10To20BelowCritical,"Fósforo 10–20 cm abaixo do crítico"),
      limingAgronomistConfirmedIncorporation:nullableBoolean(b.limingAgronomistConfirmedIncorporation,"Confirmação agronômica de incorporação"),
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
