export type ConfidenceDimensionInput = {
  key: string;
  label: string;
  score: number;
  weight: number;
};

export type ConfidenceInput = {
  score: number;
  level: string;
  dimensions: ConfidenceDimensionInput[];
};

export type ConfidenceInterpretationInput = {
  parameterCode: string;
  classificationRole?: "TARGET" | "AUXILIARY";
  interpretable: boolean;
  code?: string;
  reason?: string;
};

export type TechnicalConfidenceDimension = ConfidenceDimensionInput & {
  weightPct: number;
  contribution: number;
  status: "strong" | "attention" | "limiting";
  explanation: string;
};

export type TechnicalConfidenceLimitation = {
  code: string;
  parameterCode: string;
  count: number;
  reason: string;
  requiredAction: string;
};

export type TechnicalConfidenceExplanation = {
  score: number;
  level: string;
  levelLabel: string;
  levelMeaning: string;
  dimensions: TechnicalConfidenceDimension[];
  coverage: {
    classifiedTargets: number;
    pendingTargets: number;
    totalTargets: number;
    auxiliaryResults: number;
  };
  strengths: string[];
  limitations: TechnicalConfidenceLimitation[];
  caveat: string;
};

const LEVEL_META: Record<string, { label: string; meaning: string }> = {
  HIGH: {
    label: "Alta",
    meaning: "A revisão tem base forte dentro das dimensões que o motor realmente avaliou.",
  },
  ADEQUATE: {
    label: "Adequada",
    meaning: "A revisão tem base suficiente para avançar, mantendo os pontos de atenção explicitados.",
  },
  LIMITED: {
    label: "Limitada",
    meaning: "Parte relevante da base está incompleta ou não totalmente compatível; revise as limitações antes de decidir.",
  },
  INSUFFICIENT: {
    label: "Insuficiente",
    meaning: "A evidência atual não sustenta uma interpretação ampla; use apenas os pontos localmente suportados.",
  },
};

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function dimensionStatus(score: number): TechnicalConfidenceDimension["status"] {
  if (score >= 90) return "strong";
  if (score >= 60) return "attention";
  return "limiting";
}

function explainDimension(dimension: ConfidenceDimensionInput) {
  const score = clampScore(dimension.score);
  switch (dimension.key) {
    case "completeness":
      return score === 100
        ? "Todos os resultados-alvo desta revisão foram cobertos pelo motor."
        : `${score}% dos resultados-alvo desta revisão foram cobertos pelo motor.`;
    case "context":
      return score === 100
        ? "O contexto agronômico necessário ao cálculo está vinculado nesta revisão."
        : "Falta contexto agronômico necessário para sustentar parte da interpretação.";
    case "ruleCompatibility":
      return score === 100
        ? "A regra técnica usada pelo motor está ativa e compatível com esta revisão."
        : "A regra técnica não está integralmente ativa/compatível; a limitação precisa permanecer explícita.";
    default:
      return `Dimensão registrada pelo motor com nota ${score}/100.`;
  }
}

function requiredActionFor(code: string, parameterCode: string, reason: string) {
  switch (code) {
    case "NO_CROP_PROFILE":
      return "Vincular a safra a um perfil de cultura tecnicamente homologado antes de ampliar a interpretação.";
    case "PARAMETER_NOT_IN_PROFILE":
      return `Homologar ${parameterCode} no perfil técnico aplicável; não criar faixa por aproximação.`;
    case "SAMPLE_TYPE_NOT_COVERED":
      return `Confirmar uma regra homologada para o tipo real de amostra de ${parameterCode}.`;
    case "DEPTH_UNKNOWN":
      return `Registrar a profundidade real da amostra de ${parameterCode}.`;
    case "DEPTH_NOT_COVERED":
      return `Usar uma faixa homologada para a profundidade real de ${parameterCode} ou encaminhar para revisão agronômica.`;
    case "METHOD_DETAIL_INCOMPLETE":
      return `Confirmar com o laboratório a metodologia analítica completa de ${parameterCode}.`;
    case "METHOD_NOT_SUPPORTED":
      return `Confirmar o método analítico de ${parameterCode} e usar somente metodologia homologada para o perfil.`;
    case "UNIT_NOT_SUPPORTED":
      return `Conferir a unidade reportada para ${parameterCode}; não converter silenciosamente sem regra técnica.`;
    case "AWAITING_HOMOLOGATION":
      return `Homologar as faixas técnicas de ${parameterCode} antes de classificar.`;
    case "NO_MATCHING_BAND":
      return `Revisar a cobertura das faixas homologadas de ${parameterCode}; não encaixar o valor por aproximação.`;
    case "DERIVED_INPUT_MISSING":
      return `Fornecer os resultados necessários para calcular ${parameterCode} com a fórmula homologada.`;
    case "UNKNOWN_DERIVATION_FUNCTION":
      return `Revisar a função técnica cadastrada para ${parameterCode} antes de calcular.`;
    case "CONDITION_PARAMETER_MISSING":
      return `Fornecer o parâmetro condicionante exigido para interpretar ${parameterCode}.`;
    case "NO_CONDITION_MATCH":
      return `Revisar a regra condicional homologada usada para ${parameterCode}.`;
    default:
      return reason || `Revisar a evidência de ${parameterCode} com o responsável técnico.`;
  }
}

export function buildTechnicalConfidenceExplanation(
  confidence: ConfidenceInput,
  interpretation: ConfidenceInterpretationInput[],
): TechnicalConfidenceExplanation {
  const dimensions = confidence.dimensions.map((dimension) => {
    const score = clampScore(dimension.score);
    const weight = Number.isFinite(dimension.weight) ? Math.max(0, dimension.weight) : 0;
    return {
      ...dimension,
      score,
      weight,
      weightPct: Math.round(weight * 100),
      contribution: Math.round(score * weight * 10) / 10,
      status: dimensionStatus(score),
      explanation: explainDimension({ ...dimension, score, weight }),
    };
  });

  const targetRows = interpretation.filter((item) => (item.classificationRole ?? "TARGET") === "TARGET");
  const classifiedTargets = targetRows.filter((item) => item.interpretable).length;
  const pendingRows = targetRows.filter((item) => !item.interpretable);
  const auxiliaryResults = interpretation.filter((item) => item.classificationRole === "AUXILIARY").length;

  const grouped = new Map<string, TechnicalConfidenceLimitation>();
  for (const item of pendingRows) {
    const code = item.code ?? "UNSPECIFIED_LIMITATION";
    const reason = item.reason ?? "A evidência deste parâmetro não foi suficiente para classificação.";
    const key = `${code}::${item.parameterCode}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    grouped.set(key, {
      code,
      parameterCode: item.parameterCode,
      count: 1,
      reason,
      requiredAction: requiredActionFor(code, item.parameterCode, reason),
    });
  }

  const strengths: string[] = [];
  for (const dimension of dimensions) {
    if (dimension.score >= 90) strengths.push(`${dimension.label}: ${dimension.score}/100.`);
  }
  if (targetRows.length > 0 && pendingRows.length === 0) {
    strengths.push(`Cobertura: ${classifiedTargets}/${targetRows.length} resultados-alvo classificados.`);
  }
  if (auxiliaryResults > 0) {
    strengths.push(`${auxiliaryResults} resultado${auxiliaryResults === 1 ? "" : "s"} auxiliar${auxiliaryResults === 1 ? "" : "es"} preservado${auxiliaryResults === 1 ? "" : "s"} como contexto, sem virar falsa pendência.`);
  }

  const levelMeta = LEVEL_META[confidence.level] ?? {
    label: confidence.level || "Não informado",
    meaning: "Nível registrado pelo motor nesta revisão.",
  };

  return {
    score: clampScore(confidence.score),
    level: confidence.level,
    levelLabel: levelMeta.label,
    levelMeaning: levelMeta.meaning,
    dimensions,
    coverage: {
      classifiedTargets,
      pendingTargets: pendingRows.length,
      totalTargets: targetRows.length,
      auxiliaryResults,
    },
    strengths,
    limitations: [...grouped.values()].sort((a, b) => b.count - a.count || a.parameterCode.localeCompare(b.parameterCode)),
    caveat: "O score mostra somente as dimensões que o motor realmente ponderou nesta revisão. Origem laboratorial, qualidade espacial, atualidade e outras evidências podem aparecer em gates separados, mas não recebem peso numérico aqui enquanto não fizerem parte do cálculo homologado.",
  };
}
