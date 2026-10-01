export type PlanningStatus = "SUPPORTED" | "PARTIAL" | "UNSUPPORTED" | "REANALYSIS_REQUIRED";
export type PlannedCropInput = { cropCode: string; targetYield?: number | null; targetUnit?: string | null };

const CAPABILITIES: Record<string, { status: Exclude<PlanningStatus, "REANALYSIS_REQUIRED">; requirements: string[]; engines: string[] }> = {
  SOYBEAN: { status: "PARTIAL", requirements: ["análise de solo", "meta produtiva para N quando aplicável"], engines: ["uniform-pk-readiness", "sulfur-dose-engine", "soybean-liming-evidence"] },
  WHEAT: { status: "PARTIAL", requirements: ["análise de solo", "meta produtiva"], engines: ["wheat-nitrogen", "uniform-pk-readiness"] },
  RICE: { status: "PARTIAL", requirements: ["análise de solo", "sistema irrigado/contexto da cultura"], engines: ["rice-potassium-sosbai-2025", "rice-nitrogen-progressive"] },
};

export function resolvePlanningCapability(cropCode: string) {
  return CAPABILITIES[cropCode.trim().toUpperCase()] ?? { status: "UNSUPPORTED" as const, requirements: ["regra homologada não disponível"], engines: [] };
}

/** Orquestra estados disponíveis; nunca promove o resultado a prescrição oficial. */
export function executeMultiseasonPlan(input: { crops: PlannedCropInput[]; hasBaseEvidence: boolean }) {
  return input.crops.map((crop, position) => {
    const capability = resolvePlanningCapability(crop.cropCode);
    const reanalysisRequired = position >= 2;
    if (!input.hasBaseEvidence) return { crop, position, status: "UNSUPPORTED" as const, requirements: ["evidência base ausente"], limitations: ["INSUFFICIENT_EVIDENCE"], evidenceUsed: [], engineVersions: [], reanalysisRequired: false };
    if (reanalysisRequired) return { crop, position, status: "REANALYSIS_REQUIRED" as const, requirements: ["nova análise de solo"], limitations: ["NOVA_ANALISE_NECESSARIA"], evidenceUsed: ["base evidence"], engineVersions: capability.engines, reanalysisRequired: true };
    return { crop, position, status: capability.status, requirements: capability.requirements, limitations: capability.status === "PARTIAL" ? ["REQUIRES_AGRONOMIST_REVIEW"] : [], evidenceUsed: ["base evidence"], engineVersions: capability.engines, reanalysisRequired: false };
  });
}
