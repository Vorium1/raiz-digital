import { getPlatformSession } from "@/lib/auth/session";
import { removePlanningCrop, updatePlanningCrop, PlanningError } from "@/lib/repositories/planning";

const writers=new Set(["SUPER_ADMIN","TENANT_ADMIN","AGRONOMIST"]);
const riceResponseClasses=new Set(["MEDIA","ALTA","MUITO_ALTA"]);

function denied(){
  return Response.json({error:"Perfil sem permissão."},{status:403});
}

export async function PATCH(
  request:Request,
  {params}:{params:Promise<{id:string;cropId:string}>},
){
  const session=await getPlatformSession();
  if(!session)return Response.json({error:"Sessão necessária."},{status:401});
  if(!writers.has(session.role))return denied();

  try{
    const body=await request.json();
    const routeParams=await params;
    if(typeof body.cropCode!=="string"||!body.cropCode.trim()){
      return Response.json({error:"Cultura necessária."},{status:400});
    }

    const cropCode=body.cropCode.trim().toUpperCase();
    const isRice=cropCode==="RICE"||cropCode==="ARROZ";
    const riceResponseClassRaw=typeof body.riceResponseClass==="string"&&body.riceResponseClass.trim()
      ? body.riceResponseClass.trim().toUpperCase()
      : null;
    if(isRice&&riceResponseClassRaw&&!riceResponseClasses.has(riceResponseClassRaw)){
      return Response.json({error:"Classe de resposta SOSBAI inválida."},{status:400});
    }
    const riceResponseClass=isRice
      ? riceResponseClassRaw as "MEDIA"|"ALTA"|"MUITO_ALTA"|null
      : null;
    const riceResponseClassApproved=isRice&&body.riceResponseClassApproved===true;
    if(riceResponseClassApproved&&!riceResponseClass){
      return Response.json({
        error:"Selecione a classe de resposta SOSBAI antes de confirmar a aprovação.",
      },{status:400});
    }

    return Response.json({
      crop:await updatePlanningCrop({
        tenantId:session.tenantId,
        userId:session.userId,
        scenarioId:routeParams.id,
        cropId:routeParams.cropId,
        cropCode,
        seasonLabel:body.seasonLabel,
        plannedDate:body.plannedDate,
        targetYield:Number.isFinite(body.targetYield)?body.targetYield:null,
        targetUnit:body.targetUnit,
        irrigated:typeof body.irrigated==="boolean"?body.irrigated:null,
        notes:body.notes,
        riceResponseClass,
        riceResponseClassApproved,
      }),
    });
  }catch(error){
    return Response.json({
      error:error instanceof PlanningError?error.message:"Não foi possível editar.",
    },{status:error instanceof PlanningError?error.status:422});
  }
}

export async function DELETE(
  _request:Request,
  {params}:{params:Promise<{id:string;cropId:string}>},
) {
  const session=await getPlatformSession();
  if(!session)return Response.json({error:"Sessão necessária."},{status:401});
  if(!writers.has(session.role))return denied();
  try{
    const routeParams=await params;
    const scenario=await removePlanningCrop({
      tenantId:session.tenantId,
      userId:session.userId,
      scenarioId:routeParams.id,
      cropId:routeParams.cropId,
    });
    return Response.json({scenario});
  }catch(error){
    return Response.json({
      error:error instanceof PlanningError?error.message:"Não foi possível remover.",
    },{status:error instanceof PlanningError?error.status:422});
  }
}
