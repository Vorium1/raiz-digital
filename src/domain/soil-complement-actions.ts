export type SoilComplementParameter = "B" | "ZN" | "CU" | "MN" | "MO";

export type SoilComplementAction = {
  parameterCode: SoilComplementParameter;
  label: string;
  status:
    | "NOT_EVALUATED"
    | "SUFFICIENT_NO_GENERAL_COMPLEMENT"
    | "LOW_REQUIRES_COMPLEMENT_REVIEW"
    | "HETEROGENEOUS_REQUIRES_COMPLEMENT_REVIEW";
  lowCount: number;
  evaluatedCount: number;
  classifications: string[];
  numericDoseAllowed: false;
  generalFieldApplicationAllowed: boolean;
  action: string;
};

type InterpretationItem = {
  parameterCode?: unknown;
  classificationRole?: unknown;
  interpretable?: unknown;
  classification?: unknown;
};

const LABELS: Record<SoilComplementParameter, string> = {
  B: "Boro",
  ZN: "Zinco",
  CU: "Cobre",
  MN: "Manganês",
  MO: "Matéria orgânica",
};

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function lowClassification(value: string) {
  return normalized(value).startsWith("BAIX");
}

function rowsFor(value: unknown, parameterCode: SoilComplementParameter) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is InterpretationItem => {
    if (!item || typeof item !== "object") return false;
    const row = item as InterpretationItem;
    return row.interpretable === true
      && row.classificationRole !== "AUXILIARY"
      && typeof row.parameterCode === "string"
      && row.parameterCode.trim().toUpperCase() === parameterCode
      && typeof row.classification === "string"
      && row.classification.trim().length > 0;
  });
}

function actionFor(parameterCode: SoilComplementParameter, lowCount: number, evaluatedCount: number, classifications: string[]) {
  const label = LABELS[parameterCode];
  if (evaluatedCount === 0) {
    return {
      parameterCode,
      label,
      status: "NOT_EVALUATED" as const,
      lowCount: 0,
      evaluatedCount: 0,
      classifications,
      numericDoseAllowed: false as const,
      generalFieldApplicationAllowed: false,
      action: parameterCode === "MO"
        ? "Matéria orgânica sem classificação suficiente nesta análise; não converter ausência de diagnóstico em dose de produto orgânico."
        : `${label}: sem classificação suficiente para concluir necessidade de complemento.`,
    };
  }

  if (lowCount === 0) {
    return {
      parameterCode,
      label,
      status: "SUFFICIENT_NO_GENERAL_COMPLEMENT" as const,
      lowCount,
      evaluatedCount,
      classifications,
      numericDoseAllowed: false as const,
      generalFieldApplicationAllowed: false,
      action: parameterCode === "MO"
        ? "Matéria orgânica não apresenta classe baixa nos pontos avaliados; manter rotação, cobertura e aporte de resíduos, sem transformar isso em dose automática de condicionador."
        : `${label}: nenhum ponto classificado como baixo; não há indicação para aplicação geral automática neste momento.`,
    };
  }

  const heterogeneous = lowCount < evaluatedCount;
  if (parameterCode === "MO") {
    return {
      parameterCode,
      label,
      status: heterogeneous ? "HETEROGENEOUS_REQUIRES_COMPLEMENT_REVIEW" as const : "LOW_REQUIRES_COMPLEMENT_REVIEW" as const,
      lowCount,
      evaluatedCount,
      classifications,
      numericDoseAllowed: false as const,
      generalFieldApplicationAllowed: false,
      action: heterogeneous
        ? `Matéria orgânica baixa em ${lowCount} de ${evaluatedCount} ponto(s). Priorizar construção localizada/estratégica de carbono, rotação e cobertura; não prescrever massa de produto orgânico sem análise do insumo e balanço específico.`
        : "Matéria orgânica baixa nos pontos avaliados. Priorizar aumento de aporte de resíduos, cobertura e rotação; qualquer composto/esterco/condicionador precisa de análise própria antes de definir quantidade.",
    };
  }

  return {
    parameterCode,
    label,
    status: heterogeneous ? "HETEROGENEOUS_REQUIRES_COMPLEMENT_REVIEW" as const : "LOW_REQUIRES_COMPLEMENT_REVIEW" as const,
    lowCount,
    evaluatedCount,
    classifications,
    numericDoseAllowed: false as const,
    generalFieldApplicationAllowed: false,
    action: heterogeneous
      ? `${label}: ${lowCount} de ${evaluatedCount} ponto(s) estão baixos. Incluir a correção no plano técnico, mas não aplicar uma dose geral ao talhão sem regra específica de dose/fonte e revisão da distribuição espacial.`
      : `${label}: classe baixa nos pontos avaliados. Complementação deve ser definida tecnicamente, mas a RAIZ não inventa kg/ha porque a regra regional genérica de dose ainda não está homologada.`,
  };
}

/**
 * Traduz classes determinísticas em ações editoriais de complemento.
 * Não cria dose de micronutriente nem de matéria orgânica.
 */
export function buildSoilComplementActions(interpretation: unknown): SoilComplementAction[] {
  return (["B", "ZN", "CU", "MN", "MO"] as const).map((parameterCode) => {
    const rows = rowsFor(interpretation, parameterCode);
    const classifications = [...new Set(rows.map((row) => String(row.classification)))];
    const lowCount = rows.filter((row) => lowClassification(String(row.classification))).length;
    return actionFor(parameterCode, lowCount, rows.length, classifications);
  });
}
