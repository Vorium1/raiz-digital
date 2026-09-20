import type { AnalysisDepthId } from "./analysis-depths";

export type EvidenceStatus = "PROVIDED" | "DECLARED_UNAVAILABLE" | "MISSING";

export type AnalysisEvidence = {
  currentSoilAnalysis: boolean;
  samplingDepth: boolean;
  crop: boolean;
  yieldGoal: boolean;
  yieldUnit: boolean;
  waterRegime: boolean;
  tillageSystem: boolean;
  managementHistory: EvidenceStatus;
  soilContext: boolean;
  yieldHistory: EvidenceStatus;
  waterHistory: EvidenceStatus;
  multiSeasonHistory: EvidenceStatus;
  weatherContext: EvidenceStatus;
  spatialRequested: boolean;
  fieldBoundaryGeoreferenced: boolean;
  samplesGeoreferenced: boolean;
};

export type MissingRequirement = {
  code: string;
  label: string;
  blocks: "LEVEL_COMPLETION" | "SPATIAL_ONLY" | "CALCULATION_ONLY";
  layer: 1 | 2 | 3 | 4;
};

export type AnalysisDepthReadiness = {
  requestedDepth: AnalysisDepthId;
  requestedLayer: 1 | 2 | 3 | 4 | null;
  effectiveLayer: 0 | 1 | 2 | 3 | 4;
  completeForRequestedDepth: boolean;
  missing: MissingRequirement[];
  limitations: string[];
  spatialReady: boolean;
};

const depthToLayer: Record<Exclude<AnalysisDepthId, "personalizada">, 1 | 2 | 3 | 4> = {
  "interpretacao-rapida": 1,
  "recomendacao-manejo": 2,
  "analise-completa-campo": 3,
  "diagnostico-360": 4,
};

const REQUIREMENTS: Array<{
  layer: 1 | 2 | 3 | 4;
  code: string;
  label: string;
  test: (evidence: AnalysisEvidence) => boolean;
  blocks?: "LEVEL_COMPLETION" | "CALCULATION_ONLY";
}> = [
  {
    layer: 1,
    code: "CURRENT_SOIL_ANALYSIS_MISSING",
    label: "Laudo atual de análise de solo validado",
    test: (evidence) => evidence.currentSoilAnalysis,
  },
  {
    layer: 2,
    code: "CROP_MISSING",
    label: "Cultura que será avaliada",
    test: (evidence) => evidence.crop,
  },
  {
    layer: 2,
    code: "YIELD_GOAL_MISSING",
    label: "Meta de produtividade",
    test: (evidence) => evidence.yieldGoal,
    blocks: "CALCULATION_ONLY",
  },
  {
    layer: 2,
    code: "YIELD_UNIT_MISSING",
    label: "Unidade da meta de produtividade",
    test: (evidence) => evidence.yieldUnit,
    blocks: "CALCULATION_ONLY",
  },
  {
    layer: 2,
    code: "SAMPLING_DEPTH_MISSING",
    label: "Profundidade de amostragem",
    test: (evidence) => evidence.samplingDepth,
  },
  {
    layer: 2,
    code: "WATER_REGIME_MISSING",
    label: "Regime hídrico (sequeiro ou irrigado)",
    test: (evidence) => evidence.waterRegime,
  },
  {
    layer: 2,
    code: "TILLAGE_SYSTEM_MISSING",
    label: "Sistema de preparo do solo (quando conhecido)",
    test: (evidence) => evidence.tillageSystem,
    blocks: "CALCULATION_ONLY",
  },
  {
    layer: 2,
    code: "MANAGEMENT_HISTORY_NOT_DECLARED",
    label: "Histórico recente de calagem, adubação e gessagem, ou declaração de que não está disponível",
    test: (evidence) => evidence.managementHistory !== "MISSING",
  },
  {
    layer: 3,
    code: "SOIL_CONTEXT_MISSING",
    label: "Tipo/classe do solo ou, no mínimo, textura/teor de argila e profundidade efetiva conhecida",
    test: (evidence) => evidence.soilContext,
  },
  {
    layer: 3,
    code: "YIELD_HISTORY_NOT_DECLARED",
    label: "Histórico recente de produtividade, ou declaração de que não está disponível",
    test: (evidence) => evidence.yieldHistory !== "MISSING",
  },
  {
    layer: 3,
    code: "WATER_HISTORY_NOT_DECLARED",
    label: "Histórico hídrico relevante (seca, excesso de chuva/encharcamento), ou declaração de que não está disponível",
    test: (evidence) => evidence.waterHistory !== "MISSING",
  },
  {
    layer: 4,
    code: "MULTI_SEASON_HISTORY_NOT_DECLARED",
    label: "Histórico de manejo e produtividade de múltiplas safras, ou declaração de que a área ainda não possui esse histórico",
    test: (evidence) => evidence.multiSeasonHistory !== "MISSING",
  },
  {
    layer: 4,
    code: "WEATHER_CONTEXT_NOT_DECLARED",
    label: "Dados ou contexto meteorológico da safra, ou declaração de indisponibilidade",
    test: (evidence) => evidence.weatherContext !== "MISSING",
  },
];

function missingThroughLayer(evidence: AnalysisEvidence, layer: 1 | 2 | 3 | 4) {
  return REQUIREMENTS
    .filter((requirement) => requirement.layer <= layer && !requirement.test(evidence))
    .map<MissingRequirement>((requirement) => ({
      code: requirement.code,
      label: requirement.label,
      blocks: requirement.blocks ?? "LEVEL_COMPLETION",
      layer: requirement.layer,
    }));
}

function computeEffectiveLayer(evidence: AnalysisEvidence): 0 | 1 | 2 | 3 | 4 {
  for (const layer of [4, 3, 2, 1] as const) {
    if (missingThroughLayer(evidence, layer).every((item) => item.blocks !== "LEVEL_COMPLETION")) return layer;
  }
  return 0;
}

function declaredLimitations(evidence: AnalysisEvidence) {
  const limitations: string[] = [];
  if (!evidence.yieldGoal || !evidence.yieldUnit) {
    limitations.push("Meta de produtividade ainda não definida; o parecer do solo continua válido, mas doses dependentes da expectativa de rendimento ficam como recomendação base até a meta ser informada.");
  }
  if (!evidence.tillageSystem) {
    limitations.push("Sistema de preparo do solo ainda não definido; o parecer continua disponível e a calagem pode ser refinada quando o sistema for informado.");
  }
  if (evidence.managementHistory === "DECLARED_UNAVAILABLE") {
    limitations.push("Histórico recente de calagem/adubação/gessagem declarado como indisponível; recomendações dependentes desse histórico devem explicitar a incerteza.");
  }
  if (evidence.yieldHistory === "DECLARED_UNAVAILABLE") {
    limitations.push("Histórico de produtividade indisponível; a leitura contextual não pode comparar resposta produtiva anterior da área.");
  }
  if (evidence.waterHistory === "DECLARED_UNAVAILABLE") {
    limitations.push("Histórico de seca/excesso hídrico indisponível; relações com resposta do solo/cultura ficam limitadas.");
  }
  if (evidence.multiSeasonHistory === "DECLARED_UNAVAILABLE") {
    limitations.push("A área não possui ou não disponibilizou histórico multissafras; o diagnóstico 360 pode ser feito, mas sem aprendizado longitudinal próprio.");
  }
  if (evidence.weatherContext === "DECLARED_UNAVAILABLE") {
    limitations.push("Contexto meteorológico indisponível; o diagnóstico 360 não pode atribuir resposta observada a eventos climáticos específicos.");
  }
  return limitations;
}

export function evaluateAnalysisDepthReadiness(
  requestedDepth: AnalysisDepthId,
  evidence: AnalysisEvidence,
): AnalysisDepthReadiness {
  const requestedLayer = requestedDepth === "personalizada" ? null : depthToLayer[requestedDepth];
  const effectiveLayer = computeEffectiveLayer(evidence);
  const targetLayer = requestedLayer ?? Math.max(1, effectiveLayer) as 1 | 2 | 3 | 4;
  const missing = missingThroughLayer(evidence, targetLayer);

  if (evidence.spatialRequested) {
    if (!evidence.fieldBoundaryGeoreferenced) {
      missing.push({
        code: "FIELD_BOUNDARY_GEOREFERENCED_MISSING",
        label: "Limite georreferenciado do talhão para análise espacial",
        blocks: "SPATIAL_ONLY",
        layer: 4,
      });
    }
    if (!evidence.samplesGeoreferenced) {
      missing.push({
        code: "SAMPLE_COORDINATES_MISSING",
        label: "Pontos de amostragem com coordenadas confiáveis para análise espacial",
        blocks: "SPATIAL_ONLY",
        layer: 4,
      });
    }
  }

  const levelBlockers = missing.filter((item) => item.blocks === "LEVEL_COMPLETION");
  const spatialBlockers = missing.filter((item) => item.blocks === "SPATIAL_ONLY");

  return {
    requestedDepth,
    requestedLayer,
    effectiveLayer,
    completeForRequestedDepth: requestedLayer === null ? levelBlockers.length === 0 : levelBlockers.length === 0,
    missing,
    limitations: declaredLimitations(evidence),
    spatialReady: !evidence.spatialRequested || spatialBlockers.length === 0,
  };
}

export function emptyAnalysisEvidence(): AnalysisEvidence {
  return {
    currentSoilAnalysis: false,
    samplingDepth: false,
    crop: false,
    yieldGoal: false,
    yieldUnit: false,
    waterRegime: false,
    tillageSystem: false,
    managementHistory: "MISSING",
    soilContext: false,
    yieldHistory: "MISSING",
    waterHistory: "MISSING",
    multiSeasonHistory: "MISSING",
    weatherContext: "MISSING",
    spatialRequested: false,
    fieldBoundaryGeoreferenced: false,
    samplesGeoreferenced: false,
  };
}
