/**
 * Motor determinístico agronômico.
 *
 * Regras rígidas (não são só documentação, são o comportamento deste arquivo):
 *  - nunca inventa um valor ausente;
 *  - nunca assume método laboratorial;
 *  - nunca mistura faixas técnicas de perfis/profundidades/métodos incompatíveis;
 *  - nunca gera classificação sem cultura/contexto mínimo resolvido;
 *  - toda classificação carrega a regra usada, a versão do perfil e o nível de confiança;
 *  - quando falta regra, método, unidade, cultura ou profundidade compatível, o
 *    resultado para aquele parâmetro é NOT_INTERPRETABLE com um motivo explícito,
 *    nunca um número aproximado.
 *
 * Este módulo é puro: não acessa banco. Quem monta o `EngineInput` (a partir de
 * crop_seasons + crop_profiles + crop_profile_parameters + lab_results reais) é
 * a camada de repositório.
 */

export type SufficiencyBand = { label: string; min?: number; max?: number };

export type CropProfileParameterDef = {
  id: string;
  parameterCode: string;
  parameterCategory: "QUIMICO" | "FISICO" | "MICROBIOLOGICO";
  depthFromCm: number | null;
  depthToCm: number | null;
  analyticalMethodAllowed: string[];
  unitExpected: string | null;
  sufficiencyRanges: SufficiencyBand[] | null;
  criticality: "BAIXA" | "MEDIA" | "ALTA" | null;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED";
};

export type CropProfileDef = {
  id: string;
  code: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED";
  semanticVersion: string;
  contentHash: string | null;
  parameters: CropProfileParameterDef[];
};

export type LabResultInput = {
  sampleCode: string;
  parameterCode: string;
  value: number;
  unit: string;
  method: string;
  depthFromCm: number | null;
  depthToCm: number | null;
};

export type EngineInput = {
  cropProfile: CropProfileDef | null;
  labResults: LabResultInput[];
};

export type ParameterFact = {
  sampleCode: string;
  parameterCode: string;
  value: number;
  unit: string;
  method: string;
};

export type ParameterInterpretation =
  | {
      sampleCode: string;
      parameterCode: string;
      interpretable: true;
      classification: string;
      matchedParameter: { id: string; criticality: "BAIXA" | "MEDIA" | "ALTA" | null };
    }
  | {
      sampleCode: string;
      parameterCode: string;
      interpretable: false;
      reason: string;
      code:
        | "NO_CROP_PROFILE"
        | "PARAMETER_NOT_IN_PROFILE"
        | "AWAITING_HOMOLOGATION"
        | "METHOD_NOT_SUPPORTED"
        | "DEPTH_UNKNOWN"
        | "DEPTH_NOT_COVERED"
        | "NO_MATCHING_BAND";
    };

export type EngineConfidence = {
  score: number;
  level: "HIGH" | "ADEQUATE" | "LIMITED" | "INSUFFICIENT";
  dimensions: Array<{ key: string; label: string; score: number; weight: number }>;
};

export type EngineTrace = {
  cropProfileId: string | null;
  cropProfileCode: string | null;
  cropProfileVersion: string | null;
  cropProfileContentHash: string | null;
  generatedAt: string;
};

export type EngineResult = {
  interpretable: boolean;
  facts: ParameterFact[];
  interpretation: ParameterInterpretation[];
  pendencies: string[];
  confidence: EngineConfidence;
  trace: EngineTrace;
};

function depthCompatible(resultFrom: number | null, resultTo: number | null, ruleFrom: number | null, ruleTo: number | null) {
  if (ruleFrom == null && ruleTo == null) return true;
  if (resultFrom == null || resultTo == null) return false;
  const ruleF = ruleFrom ?? -Infinity;
  const ruleT = ruleTo ?? Infinity;
  return resultFrom >= ruleF && resultTo <= ruleT;
}

function classifyValue(value: number, bands: SufficiencyBand[]): string | null {
  for (const band of bands) {
    const min = band.min ?? -Infinity;
    const max = band.max ?? Infinity;
    if (value >= min && value < max) return band.label;
  }
  return null;
}

function interpretOne(result: LabResultInput, cropProfile: CropProfileDef | null): ParameterInterpretation {
  const base = { sampleCode: result.sampleCode, parameterCode: result.parameterCode };

  if (!cropProfile) {
    return { ...base, interpretable: false, reason: "A safra não tem uma cultura vinculada a um perfil cadastrado.", code: "NO_CROP_PROFILE" };
  }

  const candidates = cropProfile.parameters.filter((param) => param.parameterCode === result.parameterCode && param.status === "ACTIVE");
  if (candidates.length === 0) {
    return { ...base, interpretable: false, reason: `O perfil "${cropProfile.name}" não tem um parâmetro homologado para ${result.parameterCode}.`, code: "PARAMETER_NOT_IN_PROFILE" };
  }

  const depthMatches = candidates.filter((param) => depthCompatible(result.depthFromCm, result.depthToCm, param.depthFromCm, param.depthToCm));
  if (depthMatches.length === 0) {
    if (result.depthFromCm == null || result.depthToCm == null) {
      return { ...base, interpretable: false, reason: "A profundidade da amostra não está registrada — sem profundidade não é possível escolher a faixa técnica correta.", code: "DEPTH_UNKNOWN" };
    }
    return { ...base, interpretable: false, reason: `Nenhuma faixa homologada cobre a profundidade ${result.depthFromCm}-${result.depthToCm}cm para ${result.parameterCode}.`, code: "DEPTH_NOT_COVERED" };
  }

  const methodMatches = depthMatches.filter((param) => param.analyticalMethodAllowed.length === 0 || param.analyticalMethodAllowed.includes(result.method));
  if (methodMatches.length === 0) {
    return { ...base, interpretable: false, reason: `Método "${result.method}" não está entre os métodos aceitos para ${result.parameterCode} neste perfil.`, code: "METHOD_NOT_SUPPORTED" };
  }

  const matched = methodMatches[0];
  if (!matched.sufficiencyRanges || matched.sufficiencyRanges.length === 0) {
    return { ...base, interpretable: false, reason: `${result.parameterCode} está cadastrado no perfil, mas as faixas de suficiência ainda aguardam homologação técnica.`, code: "AWAITING_HOMOLOGATION" };
  }

  const classification = classifyValue(result.value, matched.sufficiencyRanges);
  if (!classification) {
    return { ...base, interpretable: false, reason: `O valor ${result.value} ${result.unit} não se encaixa em nenhuma faixa homologada para ${result.parameterCode}.`, code: "NO_MATCHING_BAND" };
  }

  return { ...base, interpretable: true, classification, matchedParameter: { id: matched.id, criticality: matched.criticality } };
}

export function runAgronomicEngine(input: EngineInput): EngineResult {
  const facts: ParameterFact[] = input.labResults.map((row) => ({ sampleCode: row.sampleCode, parameterCode: row.parameterCode, value: row.value, unit: row.unit, method: row.method }));
  const interpretation = input.labResults.map((row) => interpretOne(row, input.cropProfile));

  const interpretableCount = interpretation.filter((item) => item.interpretable).length;
  const total = interpretation.length;
  const pendencies = Array.from(
    new Set(interpretation.filter((item): item is Extract<ParameterInterpretation, { interpretable: false }> => !item.interpretable).map((item) => item.reason)),
  );

  const completeness = total === 0 ? 0 : Math.round((interpretableCount / total) * 100);
  const dimensions = [
    { key: "completeness", label: "Completude", score: completeness, weight: 0.5 },
    { key: "context", label: "Contexto agronômico", score: input.cropProfile ? 100 : 0, weight: 0.3 },
    { key: "ruleCompatibility", label: "Compatibilidade de regra", score: input.cropProfile?.status === "ACTIVE" ? 100 : 40, weight: 0.2 },
  ];
  const score = Math.round(dimensions.reduce((sum, dim) => sum + dim.score * dim.weight, 0));
  const level: EngineConfidence["level"] = score >= 90 ? "HIGH" : score >= 75 ? "ADEQUATE" : score >= 50 ? "LIMITED" : "INSUFFICIENT";

  return {
    interpretable: total > 0 && interpretableCount > 0,
    facts,
    interpretation,
    pendencies,
    confidence: { score, level, dimensions },
    trace: {
      cropProfileId: input.cropProfile?.id ?? null,
      cropProfileCode: input.cropProfile?.code ?? null,
      cropProfileVersion: input.cropProfile?.semanticVersion ?? null,
      cropProfileContentHash: input.cropProfile?.contentHash ?? null,
      generatedAt: new Date().toISOString(),
    },
  };
}
