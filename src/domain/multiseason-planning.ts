export type PlanningStatus = "SUPPORTED" | "PARTIAL" | "UNSUPPORTED" | "REANALYSIS_REQUIRED";
export type PlannedCropInput = {
  cropCode: string;
  plannedDate?: string | null;
  targetYield?: number | null;
  targetUnit?: string | null;
};

export const SOIL_REANALYSIS_MAX_YEARS = 3;
export const SOIL_REANALYSIS_RULE_SOURCE = "TRIGO_SAFRA_2026";

const CAPABILITIES: Record<
  string,
  {
    status: Exclude<PlanningStatus, "REANALYSIS_REQUIRED">;
    requirements: string[];
    engines: string[];
  }
> = {
  SOYBEAN: {
    status: "PARTIAL",
    requirements: ["análise de solo", "meta produtiva para N quando aplicável"],
    engines: ["uniform-pk-readiness", "sulfur-dose-engine", "soybean-liming-evidence"],
  },
  WHEAT: {
    status: "PARTIAL",
    requirements: ["análise de solo", "meta produtiva"],
    engines: ["wheat-nitrogen", "uniform-pk-readiness"],
  },
  RICE: {
    status: "PARTIAL",
    requirements: ["análise de solo", "sistema irrigado/contexto da cultura"],
    engines: ["rice-potassium-sosbai-2025", "rice-nitrogen-progressive"],
  },
};

export function resolvePlanningCapability(cropCode: string) {
  return CAPABILITIES[cropCode.trim().toUpperCase()] ?? {
    status: "UNSUPPORTED" as const,
    requirements: ["regra homologada não disponível"],
    engines: [],
  };
}

function parseDateOnly(value:string|null|undefined){
  if(!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date=new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime())?date:null;
}

export function soilReanalysisStatus(input:{
  baseSampledFrom?:string|null;
  plannedDate?:string|null;
}){
  const sampled=parseDateOnly(input.baseSampledFrom);
  const planned=parseDateOnly(input.plannedDate);
  if(!sampled){
    return {
      required:false,
      resolved:false,
      limitation:"BASE_SAMPLE_DATE_UNKNOWN" as const,
      dueAt:null,
    };
  }

  const dueAt=new Date(sampled.getTime());
  dueAt.setUTCFullYear(dueAt.getUTCFullYear()+SOIL_REANALYSIS_MAX_YEARS);
  const dueDate=dueAt.toISOString().slice(0,10);

  if(!planned){
    return {
      required:false,
      resolved:false,
      limitation:"PLANNED_DATE_UNKNOWN" as const,
      dueAt:dueDate,
    };
  }

  return {
    required:planned.getTime()>=dueAt.getTime(),
    resolved:true,
    limitation:null,
    dueAt:dueDate,
  };
}

/**
 * Orquestra estados de prontidão do planejamento.
 * Não promove resultado a prescrição oficial e não inventa dose.
 * O prazo de reanálise usa a data técnica da amostragem, nunca posição do cultivo.
 */
export function executeMultiseasonPlan(input: {
  crops: PlannedCropInput[];
  hasBaseEvidence: boolean;
  baseSampledFrom?: string | null;
}) {
  return input.crops.map((crop, position) => {
    const capability = resolvePlanningCapability(crop.cropCode);

    if (!input.hasBaseEvidence) {
      return {
        crop,
        position,
        status: "UNSUPPORTED" as const,
        requirements: ["evidência base ausente"],
        limitations: ["INSUFFICIENT_EVIDENCE"],
        evidenceUsed: [],
        engineVersions: [],
        reanalysisRequired: false,
        reanalysisDueAt: null,
      };
    }

    const reanalysis=soilReanalysisStatus({
      baseSampledFrom:input.baseSampledFrom,
      plannedDate:crop.plannedDate,
    });

    if (reanalysis.required) {
      return {
        crop,
        position,
        status: "REANALYSIS_REQUIRED" as const,
        requirements: ["nova análise de solo antes deste cultivo"],
        limitations: ["NOVA_ANALISE_NECESSARIA"],
        evidenceUsed: ["base evidence", SOIL_REANALYSIS_RULE_SOURCE],
        engineVersions: capability.engines,
        reanalysisRequired: true,
        reanalysisDueAt: reanalysis.dueAt,
      };
    }

    const limitations:string[]=[];
    if(capability.status==="PARTIAL") limitations.push("REQUIRES_AGRONOMIST_REVIEW");
    if(!reanalysis.resolved && reanalysis.limitation) limitations.push(reanalysis.limitation);

    return {
      crop,
      position,
      status: capability.status,
      requirements: capability.requirements,
      limitations,
      evidenceUsed: ["base evidence", SOIL_REANALYSIS_RULE_SOURCE],
      engineVersions: capability.engines,
      reanalysisRequired: false,
      reanalysisDueAt: reanalysis.dueAt,
    };
  });
}

export function resolvePlanningScenarioPersistenceStatus(
  results:Array<{status:PlanningStatus}>,
):"DRAFT"|"CALCULATED"|"REANALYSIS_REQUIRED"{
  if(results.length===0)return "DRAFT";
  if(results.some((result)=>result.status==="REANALYSIS_REQUIRED"))return "REANALYSIS_REQUIRED";
  return "CALCULATED";
}
