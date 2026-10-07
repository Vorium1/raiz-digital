import {
  computeSingleProductRateFromNutrient,
  convertLimingRequirementToCommercialProduct,
  solveTwoProductPkPlan,
  type CommercialFertilizerProduct,
  type CommercialNutrient,
  type NutrientTargets,
} from "@/domain/commercial-input-engine";
import { getPlanningCalculationPreview } from "@/lib/repositories/planning";
import { buildPlanningCommercialSourceTargets, type PlanningCommercialSourceTarget } from "@/domain/multiseason-commercial";
import {
  commercialProductSnapshot,
  type CommercialProductSnapshot,
} from "@/lib/repositories/commercial-simulation";
import {
  listCommercialInputProducts,
  type CommercialInputProduct,
} from "@/lib/repositories/commercial-input-products";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";

export type PlanningCommercialMode = "SINGLE" | "PK_PAIR" | "LIME";

function nutrientTargets(sourceTargets:PlanningCommercialSourceTarget[]):NutrientTargets{
  const targets:NutrientTargets={};
  for(const source of sourceTargets){
    if(source.canonicalTarget==="LIME_PRNT100")continue;
    targets[source.canonicalTarget]=source.quantity;
  }
  return targets;
}

function requireProduct(
  products:CommercialInputProduct[],
  productId:string,
  kind:"FERTILIZER"|"LIMESTONE",
){
  const product=products.find((item)=>item.id===productId&&item.active);
  if(!product)throw new PlanningCommercialError("Produto comercial ativo não encontrado.",404);
  if(product.kind!==kind){
    throw new PlanningCommercialError(
      kind==="LIMESTONE"
        ?"Selecione um calcário ativo para esta conversão."
        :"Selecione um fertilizante ativo para esta simulação.",
      422,
    );
  }
  return product;
}

function limestoneViolations(product:CommercialInputProduct,productDoseKgPerHa:number){
  const violations:string[]=[];
  if(product.minRateKgPerHa!=null&&productDoseKgPerHa<product.minRateKgPerHa-1e-9){
    violations.push(`Dose calculada ${productDoseKgPerHa.toFixed(2)} kg/ha abaixo do mínimo operacional cadastrado de ${product.minRateKgPerHa} kg/ha.`);
  }
  if(product.maxRateKgPerHa!=null&&productDoseKgPerHa>product.maxRateKgPerHa+1e-9){
    violations.push(`Dose calculada ${productDoseKgPerHa.toFixed(2)} kg/ha acima do máximo operacional cadastrado de ${product.maxRateKgPerHa} kg/ha.`);
  }
  return violations;
}

export async function getPlanningCommercialWorkspace(input:{
  tenantId:string;
  userId:string;
  scenarioId:string;
  cropId:string;
}){
  const [{scenario,calculation},products]=await Promise.all([
    getPlanningCalculationPreview(input.tenantId,input.scenarioId,input.userId),
    listCommercialInputProducts(input.tenantId,input.userId),
  ]);

  const crop=scenario.crops.find((item:any)=>item.id===input.cropId);
  if(!crop)throw new PlanningCommercialError("Cultivo não encontrado neste cenário.",404);
  const result=calculation.results.find((item:any)=>item.position===crop.position);
  if(!result||result.crop?.id!==crop.id){
    throw new PlanningCommercialError("O cálculo do cultivo não corresponde ao cenário atual.",409);
  }

  const sourceTargets=buildPlanningCommercialSourceTargets({scenarioId:input.scenarioId,crop,result});
  const exactNutrients=nutrientTargets(sourceTargets);
  const p=exactNutrients.P2O5;
  const k=exactNutrients.K2O;
  const lime=sourceTargets.find((target)=>target.canonicalTarget==="LIME_PRNT100")?.quantity??null;

  return {
    scenarioId:input.scenarioId,
    scenarioName:scenario.name,
    sourceScenarioUpdatedAt:scenario.updatedAt,
    crop:{
      id:crop.id,
      position:crop.position,
      cropCode:crop.cropCode,
      seasonLabel:crop.seasonLabel,
      plannedDate:crop.plannedDate,
      updatedAt:crop.updatedAt,
    },
    areaHa:scenario.areaHa,
    sourceTargets,
    nutrientTargetsKgPerHa:exactNutrients,
    limingRequirementTonPerHaPrnt100:lime,
    availableModes:{
      SINGLE:Object.values(exactNutrients).some((value)=>typeof value==="number"&&value>0),
      PK_PAIR:typeof p==="number"&&p>0&&typeof k==="number"&&k>0,
      LIME:typeof lime==="number"&&lime>0,
    },
    products:products.filter((product)=>product.active),
    planningStatus:calculation.status,
  };
}

export async function simulatePlanningCommercialPlan(input:{
  tenantId:string;
  userId:string;
  scenarioId:string;
  cropId:string;
  mode:PlanningCommercialMode;
  productId?:string|null;
  productAId?:string|null;
  productBId?:string|null;
  driverNutrient?:CommercialNutrient|null;
}){
  const workspace=await getPlanningCommercialWorkspace(input);
  const {products,sourceTargets,areaHa}=workspace;
  if(typeof areaHa!=="number"||!Number.isFinite(areaHa)||areaHa<=0){
    throw new PlanningCommercialError("Área válida do talhão é necessária para a simulação comercial.",422);
  }

  if(input.mode==="SINGLE"){
    if(!input.productId)throw new PlanningCommercialError("Selecione um produto.",400);
    if(!input.driverNutrient)throw new PlanningCommercialError("Selecione o nutriente-guia.",400);
    const target=workspace.nutrientTargetsKgPerHa[input.driverNutrient];
    if(target==null||target<=0){
      throw new PlanningCommercialError(
        `O cultivo não possui alvo determinístico exato e positivo de ${input.driverNutrient} para conversão comercial.`,
        422,
      );
    }
    const product=requireProduct(products,input.productId,"FERTILIZER");
    try{
      const result=computeSingleProductRateFromNutrient({
        product:engineProduct(product),
        driverNutrient:input.driverNutrient,
        targetKgPerHa:target,
        allTargetsKgPerHa:workspace.nutrientTargetsKgPerHa,
        areaHa,
      });
      return {
        mode:input.mode,
        workspace,
        driverNutrient:input.driverNutrient,
        targetKgPerHa:target,
        selectedProducts:[commercialProductSnapshot(product)],
        result,
        sourceTargets,
      } as const;
    }catch(error){
      throw new PlanningCommercialError(error instanceof Error?error.message:"Falha ao simular produto.",422);
    }
  }

  if(input.mode==="PK_PAIR"){
    if(!input.productAId||!input.productBId)throw new PlanningCommercialError("Selecione os dois produtos da combinação P/K.",400);
    if(input.productAId===input.productBId)throw new PlanningCommercialError("A combinação P/K precisa de dois produtos distintos.",422);
    const targetP=workspace.nutrientTargetsKgPerHa.P2O5;
    const targetK=workspace.nutrientTargetsKgPerHa.K2O;
    if(targetP==null||targetP<=0||targetK==null||targetK<=0){
      throw new PlanningCommercialError("P₂O₅ e K₂O precisam ter alvos determinísticos exatos e positivos neste cultivo.",422);
    }
    const productA=requireProduct(products,input.productAId,"FERTILIZER");
    const productB=requireProduct(products,input.productBId,"FERTILIZER");
    try{
      const result=solveTwoProductPkPlan({
        productA:engineProduct(productA),
        productB:engineProduct(productB),
        targetP2O5KgPerHa:targetP,
        targetK2OKgPerHa:targetK,
        additionalTargetsKgPerHa:Object.fromEntries(
          Object.entries(workspace.nutrientTargetsKgPerHa).filter(([key])=>key!=="P2O5"&&key!=="K2O"),
        ) as NutrientTargets,
        areaHa,
      });
      return {
        mode:input.mode,
        workspace,
        selectedProducts:[commercialProductSnapshot(productA),commercialProductSnapshot(productB)],
        result,
        sourceTargets,
      } as const;
    }catch(error){
      throw new PlanningCommercialError(error instanceof Error?error.message:"Falha ao resolver a combinação P/K.",422);
    }
  }

  if(!input.productId)throw new PlanningCommercialError("Selecione um calcário.",400);
  const requirement=workspace.limingRequirementTonPerHaPrnt100;
  if(requirement==null||requirement<=0){
    throw new PlanningCommercialError("O cultivo não possui recomendação de aplicação de calcário PRNT100 apta para conversão comercial.",422);
  }
  const product=requireProduct(products,input.productId,"LIMESTONE");
  if(product.prntPercent==null){
    throw new PlanningCommercialError("O calcário selecionado não possui PRNT cadastrado.",422);
  }
  try{
    const result=convertLimingRequirementToCommercialProduct({
      requirementTonPerHaPrnt100:requirement,
      productPrntPercent:product.prntPercent,
      areaHa,
      pricePerTon:product.pricePerTon,
    });
    const constraintViolations=limestoneViolations(product,result.productDoseKgPerHa);
    return {
      mode:input.mode,
      workspace,
      selectedProducts:[commercialProductSnapshot(product)],
      result:{
        ...result,
        constraintsSatisfied:constraintViolations.length===0,
        constraintViolations,
      },
      sourceTargets,
    } as const;
  }catch(error){
    throw new PlanningCommercialError(error instanceof Error?error.message:"Falha ao converter calcário.",422);
  }
}

function normalizeLabel(value:string|null|undefined){
  if(value==null||!value.trim())return null;
  const label=value.trim();
  if(label.length>160)throw new PlanningCommercialError("Nome do cenário comercial deve ter até 160 caracteres.",400);
  return label;
}

function engineInputFromRequest(input:{
  mode:PlanningCommercialMode;
  productId?:string|null;
  productAId?:string|null;
  productBId?:string|null;
  driverNutrient?:CommercialNutrient|null;
}){
  return {
    mode:input.mode,
    productId:input.productId??null,
    productAId:input.productAId??null,
    productBId:input.productBId??null,
    driverNutrient:input.driverNutrient??null,
  };
}

export async function savePlanningCommercialSnapshot(input:{
  tenantId:string;
  userId:string;
  scenarioId:string;
  cropId:string;
  label?:string|null;
  mode:PlanningCommercialMode;
  productId?:string|null;
  productAId?:string|null;
  productBId?:string|null;
  driverNutrient?:CommercialNutrient|null;
}){
  const label=normalizeLabel(input.label);
  const simulation=await simulatePlanningCommercialPlan(input);
  const workspace=simulation.workspace;
  const crop=workspace.crop;
  const engineInput=engineInputFromRequest(input);
  const productSnapshots=[...simulation.selectedProducts] as CommercialProductSnapshot[];

  return withTenant({tenantId:input.tenantId,userId:input.userId},async client=>{
    const linkage=(await client.query<{
      scenarioUpdatedAt:string;
      cropUpdatedAt:string;
    }>(
      `SELECT ps.updated_at::text AS "scenarioUpdatedAt",
              pc.updated_at::text AS "cropUpdatedAt"
       FROM planning_scenarios ps
       JOIN planning_scenario_crops pc
         ON pc.tenant_id=ps.tenant_id
        AND pc.scenario_id=ps.id
       WHERE ps.tenant_id=$1::uuid
         AND ps.id=$2::uuid
         AND pc.id=$3::uuid
       FOR SHARE OF ps, pc`,
      [input.tenantId,input.scenarioId,input.cropId],
    )).rows[0];
    if(!linkage)throw new PlanningCommercialError("Cenário ou cultivo não encontrado.",404);

    if(
      String(linkage.scenarioUpdatedAt)!==String(workspace.sourceScenarioUpdatedAt)
      || String(linkage.cropUpdatedAt)!==String(crop.updatedAt)
    ){
      throw new PlanningCommercialError(
        "O cenário agronômico mudou durante a simulação comercial. Recalcule antes de salvar.",
        409,
      );
    }

    const row=(await client.query(
      `INSERT INTO planning_crop_commercial_snapshots
       (tenant_id,scenario_id,planning_crop_id,label,simulation_mode,schema_version,area_ha,
        crop_position,crop_code,season_label,planned_date,source_scenario_updated_at,source_crop_updated_at,
        source_targets,product_snapshots,engine_input,engine_output,created_by)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,1,$6,$7,$8,$9,$10::date,$11::timestamptz,$12::timestamptz,
              $13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17::uuid)
       RETURNING id::text,label,simulation_mode AS "simulationMode",schema_version AS "schemaVersion",
                 area_ha::float8 AS "areaHa",crop_position AS "cropPosition",crop_code AS "cropCode",
                 season_label AS "seasonLabel",planned_date::text AS "plannedDate",
                 source_targets AS "sourceTargets",product_snapshots AS "productSnapshots",
                 engine_input AS "engineInput",engine_output AS "engineOutput",created_at::text AS "createdAt"`,
      [
        input.tenantId,input.scenarioId,input.cropId,label,input.mode,workspace.areaHa,
        crop.position,crop.cropCode,crop.seasonLabel,crop.plannedDate,
        workspace.sourceScenarioUpdatedAt,crop.updatedAt,
        JSON.stringify(simulation.sourceTargets),JSON.stringify(productSnapshots),
        JSON.stringify(engineInput),JSON.stringify(simulation.result),input.userId,
      ],
    )).rows[0];
    if(!row)throw new PlanningCommercialError("Não foi possível salvar o cenário comercial.",500);

    await writeAudit(client,{
      tenantId:input.tenantId,
      userId:input.userId,
      action:"PLANNING_CROP_COMMERCIAL_SNAPSHOT_SAVED",
      entityType:"planning_crop_commercial_snapshot",
      entityId:row.id,
      metadata:{
        scenarioId:input.scenarioId,
        planningCropId:input.cropId,
        cropPosition:crop.position,
        cropCode:crop.cropCode,
        mode:input.mode,
        productIds:productSnapshots.map((product)=>product.id),
        sourceTargets:simulation.sourceTargets.map((target)=>({
          canonicalTarget:target.canonicalTarget,
          quantity:target.quantity,
          unit:target.unit,
          ruleId:target.ruleId,
        })),
      },
    });
    return row;
  });
}

export async function listPlanningCommercialSnapshots(input:{
  tenantId:string;
  userId:string;
  scenarioId:string;
  cropId:string;
  limit?:number;
}){
  const limit=Math.min(Math.max(Math.floor(input.limit??20),1),100);
  return withTenant({tenantId:input.tenantId,userId:input.userId},async client=>{
    const rows=(await client.query(
      `SELECT id::text,label,simulation_mode AS "simulationMode",schema_version AS "schemaVersion",
              area_ha::float8 AS "areaHa",crop_position AS "cropPosition",crop_code AS "cropCode",
              season_label AS "seasonLabel",planned_date::text AS "plannedDate",
              source_targets AS "sourceTargets",product_snapshots AS "productSnapshots",
              engine_input AS "engineInput",engine_output AS "engineOutput",
              created_by::text AS "createdBy",created_at::text AS "createdAt"
       FROM planning_crop_commercial_snapshots
       WHERE tenant_id=$1::uuid AND scenario_id=$2::uuid AND planning_crop_id=$3::uuid
       ORDER BY created_at DESC,id DESC
       LIMIT $4`,
      [input.tenantId,input.scenarioId,input.cropId,limit],
    )).rows;
    return rows;
  });
}
