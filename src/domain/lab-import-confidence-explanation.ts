export type LabConfidenceLevel = "HIGH" | "ADEQUATE" | "LIMITED" | "INSUFFICIENT";

export type LabConfidenceInput = {
  score: number;
  level: LabConfidenceLevel;
  dimensions: Array<{ key: string; label: string; score: number; weight: number }>;
};

export type LabConfidenceIssueInput = {
  severity: "BLOCKER" | "WARNING" | "INFO";
  code: string;
  message: string;
  line?: number;
  sampleCode?: string;
  parameterCode?: string;
};

export type LabConfidenceDimensionExplanation = {
  key: string;
  label: string;
  score: number;
  weightPct: number;
  contribution: number;
  status: "strong" | "attention" | "limiting";
  explanation: string;
};

export type LabConfidenceIssueGroup = {
  severity: LabConfidenceIssueInput["severity"];
  code: string;
  count: number;
  scope: "LOCAL" | "STRUCTURAL";
  affected: string[];
  message: string;
  requiredAction: string;
};

export type LabImportConfidenceExplanation = {
  score: number;
  level: LabConfidenceLevel;
  levelLabel: string;
  levelMeaning: string;
  dimensions: LabConfidenceDimensionExplanation[];
  blockers: number;
  warnings: number;
  localizedBlockers: number;
  structuralBlockers: number;
  issueGroups: LabConfidenceIssueGroup[];
  caveat: string;
};

const LEVEL_META: Record<LabConfidenceLevel, { label: string; meaning: string }> = {
  HIGH: { label: "Alta", meaning: "O arquivo tem evidência laboratorial forte dentro dos critérios efetivamente pontuados pelo importador." },
  ADEQUATE: { label: "Adequada", meaning: "O arquivo tem base laboratorial suficiente, mantendo os alertas explicitados para conferência." },
  LIMITED: { label: "Limitada", meaning: "Há limitações relevantes de integridade, coerência ou reconhecimento que precisam ser conferidas." },
  INSUFFICIENT: { label: "Insuficiente", meaning: "O arquivo não sustenta uso amplo sem corrigir os bloqueios ou dados laboratoriais faltantes." },
};

function statusFor(score: number): LabConfidenceDimensionExplanation["status"] {
  if (score >= 90) return "strong";
  if (score >= 60) return "attention";
  return "limiting";
}

function explanationFor(key: string, score: number) {
  switch (key) {
    case "completeness":
      return score === 100
        ? "Unidades e métodos laboratoriais ponderados pelo importador estão completos sem penalidade de bloqueio."
        : "A nota cai quando unidade/método não estão confirmados ou quando existem bloqueios no arquivo.";
    case "laboratory":
      return score === 100
        ? "Nenhum bloqueio laboratorial foi contabilizado nesta importação."
        : "Bloqueios registrados no arquivo reduzem a coerência laboratorial de forma explícita.";
    case "ruleCompatibility":
      return score === 100
        ? "Os parâmetros importados são reconhecidos pelo catálogo técnico do importador."
        : "Parte dos parâmetros não foi reconhecida pelo catálogo do importador.";
    default:
      return "Dimensão registrada pelo cálculo de confiança do laudo.";
  }
}

function actionFor(issue: LabConfidenceIssueInput) {
  switch (issue.code) {
    case "DUPLICATE_RESULT":
      return "Conferir o resultado duplicado e manter uma única evidência válida para o mesmo ponto/parâmetro/método.";
    case "SAMPLE_COLUMN_MISSING":
      return "Informar a coluna que identifica a amostra/ponto no arquivo.";
    case "SAMPLE_CODE_MISSING":
      return "Informar o código real da amostra/ponto na linha afetada.";
    case "PARAMETER_MISSING":
      return "Informar o parâmetro laboratorial da linha afetada.";
    case "INVALID_VALUE":
      return "Conferir o valor original no laudo; não substituir por estimativa.";
    case "UNIT_UNKNOWN":
      return "Confirmar a unidade exatamente como emitida pelo laboratório.";
    case "METHOD_UNKNOWN":
      return "Confirmar o método analítico utilizado pelo laboratório.";
    case "PARAMETERS_NOT_RECOGNIZED":
      return "Mapear apenas parâmetros que possam ser identificados de forma inequívoca no laudo.";
    case "NO_VALID_RESULTS":
      return "Revisar o arquivo-fonte porque nenhum resultado laboratorial utilizável foi extraído.";
    case "UNIT_INFERRED":
      return "Conferir a unidade inferida antes de tratá-la como evidência confirmada.";
    case "METHOD_INFERRED":
      return "Conferir o método inferido/preenchido antes de tratá-lo como evidência confirmada.";
    case "DEPTH_INVALID":
    case "DEPTH_PARTIAL":
    case "DEPTH_RANGE_INVALID":
      return "Confirmar a profundidade real da amostra; o RAIZ não completa a camada por aproximação.";
    default:
      return "Conferir a evidência original indicada pelo alerta antes de ampliar o uso técnico deste dado.";
  }
}

export function buildLabImportConfidenceExplanation(
  confidence: LabConfidenceInput,
  issues: LabConfidenceIssueInput[],
): LabImportConfidenceExplanation {
  // Contexto e vínculo espacial existem no preview com peso zero. Eles são gates úteis,
  // mas não pertencem à nota do arquivo e por isso não entram nesta decomposição numérica.
  const dimensions = confidence.dimensions
    .filter((dimension) => dimension.weight > 0)
    .map((dimension) => ({
      key: dimension.key,
      label: dimension.label,
      score: dimension.score,
      weightPct: dimension.weight,
      contribution: Math.round((dimension.score * dimension.weight / 100) * 10) / 10,
      status: statusFor(dimension.score),
      explanation: explanationFor(dimension.key, dimension.score),
    }));

  const grouped = new Map<string, LabConfidenceIssueGroup>();
  for (const issue of issues) {
    const scope: LabConfidenceIssueGroup["scope"] = issue.severity === "BLOCKER" && issue.line == null ? "STRUCTURAL" : "LOCAL";
    const affectedLabel = [issue.sampleCode, issue.parameterCode].filter(Boolean).join(" · ");
    const key = `${issue.severity}::${issue.code}::${scope}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      if (affectedLabel && !existing.affected.includes(affectedLabel)) existing.affected.push(affectedLabel);
      continue;
    }
    grouped.set(key, {
      severity: issue.severity,
      code: issue.code,
      count: 1,
      scope,
      affected: affectedLabel ? [affectedLabel] : [],
      message: issue.message,
      requiredAction: actionFor(issue),
    });
  }

  const blockers = issues.filter((issue) => issue.severity === "BLOCKER");
  const structuralBlockers = blockers.filter((issue) => issue.line == null).length;
  const localizedBlockers = blockers.length - structuralBlockers;
  const levelMeta = LEVEL_META[confidence.level];

  return {
    score: confidence.score,
    level: confidence.level,
    levelLabel: levelMeta.label,
    levelMeaning: levelMeta.meaning,
    dimensions,
    blockers: blockers.length,
    warnings: issues.filter((issue) => issue.severity === "WARNING").length,
    localizedBlockers,
    structuralBlockers,
    issueGroups: [...grouped.values()].sort((a, b) => {
      const severityOrder = { BLOCKER: 0, WARNING: 1, INFO: 2 } as const;
      return severityOrder[a.severity] - severityOrder[b.severity] || b.count - a.count || a.code.localeCompare(b.code);
    }),
    caveat: "Esta nota mede o arquivo/laudo importado. Contexto agronômico e vínculo espacial são avaliados separadamente e têm peso zero neste score; não aumentam nem reduzem a nota do laudo. Uma ocorrência localizada exclui somente a evidência afetada quando as demais linhas continuam utilizáveis.",
  };
}
