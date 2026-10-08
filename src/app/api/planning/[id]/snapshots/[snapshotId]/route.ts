import { getPlatformSession } from "@/lib/auth/session";
import { getPlanningSnapshot, PlanningError } from "@/lib/repositories/planning";

export async function GET(
  _request:Request,
  {params}:{params:Promise<{id:string;snapshotId:string}>},
){
  const session=await getPlatformSession();
  if(!session)return Response.json({error:"Sessão necessária."},{status:401});
  const {id,snapshotId}=await params;
  try{
    return Response.json({
      snapshot:await getPlanningSnapshot(session.tenantId,id,snapshotId,session.userId),
    });
  }catch(error){
    return Response.json(
      {error:error instanceof PlanningError?error.message:"Não foi possível abrir o snapshot."},
      {status:error instanceof PlanningError?error.status:422},
    );
  }
}
