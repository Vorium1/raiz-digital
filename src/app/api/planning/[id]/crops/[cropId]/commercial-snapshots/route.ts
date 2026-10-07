import type { CommercialNutrient } from "@/domain/commercial-input-engine";
import { getPlatformSession } from "@/lib/auth/session";
import {
  listPlanningCommercialSnapshots,
  PlanningCommercialError,
  savePlanningCommercialSnapshot,
  type PlanningCommercialMode,
} from "@/lib/repositories/planning-commercial";

const SAVE_ROLES=new Set(["SUPER_ADMIN","TENANT_ADMIN","AGRONOMIST","FIELD_TECH","COMMERCIAL"]);
const MODES=new Set<PlanningCommercialMode>(["SINGLE","PK_PAIR","LIME"]);
const NUTRIENTS=new Set<CommercialNutrient>(["N","P2O5","K2O","S","Ca","Mg"]);

function optionalText(value:unknown,label:string){
  if(value==null)return null;
  if(typeof value!=="string")throw new PlanningCommercialError(`${label} inválido.`,400);
  const text=value.trim();
  return text||null;
}

export async function GET(
  _request:Request,
  {params}:{params:Promise<{id:string;cropId:string}>},
){
  const session=await getPlatformSession();
  if(!session)return Response.json({error:"Sessão necessária."},{status:401});
  try{
    const {id,cropId}=await params;
    const snapshots=await listPlanningCommercialSnapshots({
      tenantId:session.tenantId,
      userId:session.userId,
      scenarioId:id,
      cropId,
    });
    return Response.json({snapshots,canSave:SAVE_ROLES.has(session.role)});
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
  if(!SAVE_ROLES.has(session.role)){
    return Response.json({error:"Seu perfil pode consultar, mas não salvar cenários comerciais."},{status:403});
  }

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
    const snapshot=await savePlanningCommercialSnapshot({
      tenantId:session.tenantId,
      userId:session.userId,
      scenarioId:id,
      cropId,
      label:optionalText(body.label,"Nome do cenário"),
      mode,
      productId:optionalText(body.productId,"Produto"),
      productAId:optionalText(body.productAId,"Produto A"),
      productBId:optionalText(body.productBId,"Produto B"),
      driverNutrient,
    });
    return Response.json({snapshot},{status:201});
  }catch(error){
    if(error instanceof PlanningCommercialError){
      return Response.json({error:error.message,details:error.details??null},{status:error.status});
    }
    throw error;
  }
}
