import type { CommercialNutrient } from "@/domain/commercial-input-engine";
import { getPlatformSession } from "@/lib/auth/session";
import {
  getPlanningCommercialWorkspace,
  PlanningCommercialError,
  simulatePlanningCommercialPlan,
  type PlanningCommercialMode,
} from "@/lib/repositories/planning-commercial";

const MODES=new Set<PlanningCommercialMode>(["SINGLE","PK_PAIR","LIME"]);
const NUTRIENTS=new Set<CommercialNutrient>(["N","P2O5","K2O","S","Ca","Mg"]);

function optionalId(value:unknown,label:string){
  if(value==null)return null;
  if(typeof value!=="string"||!value.trim())throw new PlanningCommercialError(`${label} inválido.`,400);
  return value.trim();
}

export async function GET(
  _request:Request,
  {params}:{params:Promise<{id:string;cropId:string}>},
){
  const session=await getPlatformSession();
  if(!session)return Response.json({error:"Sessão necessária."},{status:401});
  try{
    const {id,cropId}=await params;
    const workspace=await getPlanningCommercialWorkspace({
      tenantId:session.tenantId,
      userId:session.userId,
      scenarioId:id,
      cropId,
    });
    return Response.json({workspace});
  }catch(error){
    if(error instanceof PlanningCommercialError){
      return Response.json({error:error.message,details:error.details??null},{status:error.status});
    }
    throw error;
  }
}

export async function POST(
  request:Request,
  {params}:{params:Promise<{id:string;cropId:string}>},
){
  const session=await getPlatformSession();
  if(!session)return Response.json({error:"Sessão necessária."},{status:401});

  let body:Record<string,unknown>;
  try{body=await request.json() as Record<string,unknown>;}
  catch{return Response.json({error:"JSON inválido."},{status:400});}

  const mode=body.mode as PlanningCommercialMode;
  if(!MODES.has(mode))return Response.json({error:"Modo comercial inválido."},{status:400});

  let driverNutrient:CommercialNutrient|null=null;
  if(body.driverNutrient!=null){
    if(typeof body.driverNutrient!=="string"||!NUTRIENTS.has(body.driverNutrient as CommercialNutrient)){
      return Response.json({error:"Nutriente-guia inválido."},{status:400});
    }
    driverNutrient=body.driverNutrient as CommercialNutrient;
  }

  try{
    const {id,cropId}=await params;
    const simulation=await simulatePlanningCommercialPlan({
      tenantId:session.tenantId,
      userId:session.userId,
      scenarioId:id,
      cropId,
      mode,
      productId:optionalId(body.productId,"Produto"),
      productAId:optionalId(body.productAId,"Produto A"),
      productBId:optionalId(body.productBId,"Produto B"),
      driverNutrient,
    });
    return Response.json({simulation});
  }catch(error){
    if(error instanceof PlanningCommercialError){
      return Response.json({error:error.message,details:error.details??null},{status:error.status});
    }
    throw error;
  }
}
