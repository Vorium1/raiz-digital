import { getPlatformSession } from "@/lib/auth/session";
import {
  listPlanningCropZarcSnapshots,
  PlanningAgroclimateError,
  refreshPlanningCropZarcSnapshot,
} from "@/lib/repositories/planning-agroclimate";

const writers=new Set(["SUPER_ADMIN","TENANT_ADMIN","AGRONOMIST"]);

export async function GET(
  _request:Request,
  {params}:{params:Promise<{id:string;cropId:string}>},
){
  const session=await getPlatformSession();
  if(!session)return Response.json({error:"Sessão necessária."},{status:401});
  try{
    const {id,cropId}=await params;
    const snapshots=await listPlanningCropZarcSnapshots({
      tenantId:session.tenantId,
      userId:session.userId,
      scenarioId:id,
      cropId,
    });
    return Response.json({snapshots,canRefresh:writers.has(session.role)});
  }catch(error){
    if(error instanceof PlanningAgroclimateError){
      return Response.json({error:error.message,details:error.details??null},{status:error.status});
    }
    throw error;
  }
}

export async function POST(
  _request:Request,
  {params}:{params:Promise<{id:string;cropId:string}>},
){
  const session=await getPlatformSession();
  if(!session)return Response.json({error:"Sessão necessária."},{status:401});
  if(!writers.has(session.role)){
    return Response.json({error:"Perfil sem permissão."},{status:403});
  }

  try{
    const {id,cropId}=await params;
    const snapshot=await refreshPlanningCropZarcSnapshot({
      tenantId:session.tenantId,
      userId:session.userId,
      scenarioId:id,
      cropId,
    });
    return Response.json({snapshot},{status:201});
  }catch(error){
    if(error instanceof PlanningAgroclimateError){
      return Response.json({error:error.message,details:error.details??null},{status:error.status});
    }
    throw error;
  }
}
