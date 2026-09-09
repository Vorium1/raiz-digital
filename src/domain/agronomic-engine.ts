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

/**
 * Tipo de amostra -- dimensão explícita do dado, não assumida implicitamente
 * como solo. Decisão do diretor (2026-09-04): a RAIZ precisa separar
 * classificação/cálculo por tipo de amostra (solo, foliar, pecíolo, massa
 * seca, grão, semente, fertilizante, biológico), porque culturas perenes/
 * frutíferas (videira, macieira, citros...) usam diagnose foliar como
 * método PRINCIPAL de avaliação nutricional -- uma faixa de suficiência de
 * folha e uma de solo pro mesmo código de parâmetro (ex.: "N", "P") não são
 * intercambiáveis e nunca podem ser confundidas pelo motor. FOLIAR = folha
 * completa (limbo+pecíolo); PECIOLO = só o pecíolo -- tratados como tipos
 * diferentes porque o próprio manual CQFS-RS/SC 2016 tem tabelas de
 * classificação DIFERENTES pra cada um, pra várias frutíferas.
 */
export type SampleType = "SOLO" | "FOLIAR" | "PECIOLO" | "MASSA_SECA" | "GRAO" | "SEMENTE" | "FERTILIZANTE" | "BIOLOGICO";

/**
 * Registro de "parâmetros derivados": um valor a ser classificado que não
 * vem direto de um resultado de laboratório, mas de uma fórmula real e
 * citável aplicada sobre um ou mais resultados da MESMA amostra. Fica
 * neste arquivo (não num módulo separado) de propósito: este motor precisa
 * continuar rodando com `node --experimental-strip-types` puro, sem
 * bundler/Next.js e sem alias "@/" -- é assim que
 * scripts/test-agronomic-engine.mjs testa o motor sem subir a aplicação
 * inteira, e um import relativo entre dois arquivos `.ts` quebra esse
 * caminho (Node exige extensão explícita, o `tsc`/Next.js em modo
 * "bundler" não aceita import com extensão -- sem solução limpa nos dois
 * mundos ao mesmo tempo, então o motor inteiro fica num arquivo só).
 *
 * Por que código, e não fórmula guardada como texto no banco: uma fórmula
 * em texto exigiria interpretar/avaliar uma expressão em tempo de
 * execução -- risco de injeção e, principalmente, quebra a regra do
 * projeto de que cálculo agronômico é "determinístico, versionado e
 * homologado" por revisão de código, não por texto solto editável por
 * qualquer curador. Cada função aqui implementa direto uma fórmula
 * publicada, com a fonte citada no comentário, coberta por teste que
 * reproduz um exemplo verificável da própria fonte.
 */
export type DerivedParameterFunction = {
  /** Códigos de parâmetro (da mesma amostra) que a fórmula precisa como entrada, na ordem que `compute` espera. */
  requiredParameterCodes: string[];
  /** Fonte da fórmula, pra rastreabilidade. */
  source: string;
  compute: (inputs: number[]) => number;
};

export const DERIVED_PARAMETER_FUNCTIONS: Record<string, DerivedParameterFunction> = {
  /**
   * Risco de toxidez por ferro em arroz irrigado por alagamento.
   * Fonte: Manual de Calagem e Adubação CQFS-RS/SC, 11ª ed. (2016), item
   * "Toxidez por ferro em arroz irrigado" (verificado direto no PDF oficial
   * em 2026-09-04):
   *   Fe2+ trocável (cmolc/dm³) = 1,66 + 2,46 × Fe-oxalato-pH6 (g/dm³)
   *   PSFe2+ (%) = 100 × Fe2+trocável / CTCpH7,0
   * Entradas: [FE (g/dm³, oxalato de amônio pH 6,0), CTC (cmolc/dm³)].
   * Saída: PSFe2+ (%), classificado como risco Baixo (≤20%) / Médio
   * (21-40%) / Alto (>40%).
   */
  FE_TOXICITY_PSFE: {
    requiredParameterCodes: ["FE", "CTC"],
    source: "Manual de Calagem e Adubação CQFS-RS/SC, 11ª ed. (2016), item Toxidez por ferro em arroz irrigado",
    compute: ([fe, ctc]) => {
      const feTrocavel = 1.66 + 2.46 * fe;
      return (100 * feTrocavel) / ctc;
    },
  },
};

export type CropProfileParameterDef = {
  id: string;
  parameterCode: string;
  parameterCategory: "QUIMICO" | "FISICO" | "MICROBIOLOGICO";
  sampleType: SampleType;
  depthFromCm: number | null;
  depthToCm: number | null;
  analyticalMethodAllowed: string[];
  unitExpected: string | null;
  sufficiencyRanges: SufficiencyBand[] | null;
  criticality: "BAIXA" | "MEDIA" | "ALTA" | null;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED";
  /**
   * Condição opcional: esta faixa só é válida quando o parâmetro
   * `conditionParameterCode` (medido na MESMA amostra) tem valor dentro de
   * [conditionMin, conditionMax]. Existe porque, na ciência do solo
   * brasileira, P e K quase sempre têm faixa de suficiência condicionada a
   * outro parâmetro do mesmo solo (classe de argila para P, classe de CTC
   * para K) -- sem isso, múltiplas faixas para o mesmo parâmetro/profundidade
   * seriam indistinguíveis. null nos três campos = sem condição (se aplica
   * sempre que parâmetro/profundidade/método baterem).
   */
  conditionParameterCode: string | null;
  conditionMin: number | null;
  conditionMax: number | null;
  /**
   * Nome de uma função registrada em `DERIVED_PARAMETER_FUNCTIONS` (ex.:
   * "FE_TOXICITY_PSFE"). Quando definido, este parâmetro NÃO classifica um
   * resultado de laboratório existente -- ele é calculado a partir de
   * outros parâmetros da mesma amostra (`requiredParameterCodes` da
   * função) e o valor calculado é classificado por `sufficiencyRanges`.
   * `parameterCode` neste caso é o nome do parâmetro VIRTUAL de saída
   * (ex.: "FE_TOXICITY_PSFE"), não corresponde a nenhum resultado
   * importado diretamente. null = parâmetro normal (classifica um
   * resultado real, comportamento de sempre).
   */
  derivedParameterCode: string | null;
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
  sampleType: SampleType;
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
      /** Só presente quando este parâmetro é derivado (ver `derivedParameterCode`): o valor calculado que foi classificado, e as entradas reais usadas -- rastreabilidade do cálculo. */
      derivation?: { value: number; source: string; inputs: Array<{ parameterCode: string; value: number }> };
    }
  | {
      sampleCode: string;
      parameterCode: string;
      interpretable: false;
      reason: string;
      code:
        | "NO_CROP_PROFILE"
        | "PARAMETER_NOT_IN_PROFILE"
        | "SAMPLE_TYPE_NOT_COVERED"
        | "AWAITING_HOMOLOGATION"
        | "METHOD_NOT_SUPPORTED"
        | "DEPTH_UNKNOWN"
        | "DEPTH_NOT_COVERED"
        | "NO_MATCHING_BAND"
        | "DERIVED_INPUT_MISSING"
        | "UNKNOWN_DERIVATION_FUNCTION"
        | "CONDITION_PARAMETER_MISSING"
        | "NO_CONDITION_MATCH";
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

/**
 * As tabelas técnicas brasileiras (CQFS-RS/SC e equivalentes) escrevem faixa
 * como "9,1-18,0" seguida de ">18,0" -- ou seja, o valor 18,0 exato pertence
 * à faixa de baixo (o corte é no máximo, inclusive), e só valores
 * ESTRITAMENTE maiores entram na faixa de cima (que não tem `max`, só
 * `min`). Faixa sem `min` (a mais baixa) é "≤ max", inclusive. Faixa com os
 * dois é "min a max", inclusive nos dois lados -- o "buraco" aparente entre
 * o max de uma faixa e o min da próxima (ex.: 18,0 e 18,1) é só precisão
 * decimal da fonte, não uma lacuna real. Cross-validado por duas pesquisas
 * de IA independentes (2026-09-04) contra o mesmo manual oficial.
 */
function classifyValue(value: number, bands: SufficiencyBand[]): string | null {
  for (const band of bands) {
    const min = band.min ?? -Infinity;
    if (band.max == null) {
      if (value > min) return band.label; // faixa mais alta: estritamente maior que o mínimo
    } else if (value >= min && value <= band.max) {
      return band.label;
    }
  }
  return null;
}

function interpretOne(result: LabResultInput, cropProfile: CropProfileDef | null, sampleResults: LabResultInput[]): ParameterInterpretation {
  const base = { sampleCode: result.sampleCode, parameterCode: result.parameterCode };

  if (!cropProfile) {
    return { ...base, interpretable: false, reason: "A safra não tem uma cultura vinculada a um perfil cadastrado.", code: "NO_CROP_PROFILE" };
  }

  const codeMatches = cropProfile.parameters.filter((param) => param.parameterCode === result.parameterCode && param.status === "ACTIVE");
  if (codeMatches.length === 0) {
    return { ...base, interpretable: false, reason: `O perfil "${cropProfile.name}" não tem um parâmetro homologado para ${result.parameterCode}.`, code: "PARAMETER_NOT_IN_PROFILE" };
  }

  const candidates = codeMatches.filter((param) => param.sampleType === result.sampleType);
  if (candidates.length === 0) {
    return { ...base, interpretable: false, reason: `O perfil "${cropProfile.name}" tem faixa homologada para ${result.parameterCode}, mas não para amostra do tipo "${result.sampleType}" -- as faixas cadastradas são de outro tipo de amostra.`, code: "SAMPLE_TYPE_NOT_COVERED" };
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

  let matched: CropProfileParameterDef;
  if (methodMatches.length === 1 && !methodMatches[0].conditionParameterCode) {
    matched = methodMatches[0];
  } else {
    // Múltiplas faixas para o mesmo parâmetro/profundidade/método: precisam
    // de uma condição (ex.: classe de argila para P, classe de CTC para K)
    // para escolher a certa -- nunca pega a primeira arbitrariamente.
    const conditioned = methodMatches.filter((param) => param.conditionParameterCode);
    if (conditioned.length === 0) {
      // Nenhuma tem condição declarada mas há mais de uma -- cadastro
      // ambíguo (curador precisa revisar), não decide sozinho.
      return { ...base, interpretable: false, reason: `${result.parameterCode} tem mais de uma faixa homologada para a mesma profundidade/método, sem condição para escolher entre elas -- revisão de cadastro necessária.`, code: "NO_CONDITION_MATCH" };
    }
    const conditionParamCode = conditioned[0].conditionParameterCode!;
    const conditionResult = sampleResults.find((r) => r.parameterCode === conditionParamCode);
    if (!conditionResult) {
      return { ...base, interpretable: false, reason: `A faixa de ${result.parameterCode} depende do valor de ${conditionParamCode} na mesma amostra, mas esse resultado não foi informado.`, code: "CONDITION_PARAMETER_MISSING" };
    }
    const matchingCondition = conditioned.find((param) => {
      const min = param.conditionMin ?? -Infinity;
      const max = param.conditionMax ?? Infinity;
      return conditionResult.value >= min && conditionResult.value <= max;
    });
    if (!matchingCondition) {
      return { ...base, interpretable: false, reason: `O valor de ${conditionParamCode} (${conditionResult.value}) não se encaixa em nenhuma classe condicional homologada para ${result.parameterCode}.`, code: "NO_CONDITION_MATCH" };
    }
    matched = matchingCondition;
  }

  if (!matched.sufficiencyRanges || matched.sufficiencyRanges.length === 0) {
    return { ...base, interpretable: false, reason: `${result.parameterCode} está cadastrado no perfil, mas as faixas de suficiência ainda aguardam homologação técnica.`, code: "AWAITING_HOMOLOGATION" };
  }

  const classification = classifyValue(result.value, matched.sufficiencyRanges);
  if (!classification) {
    return { ...base, interpretable: false, reason: `O valor ${result.value} ${result.unit} não se encaixa em nenhuma faixa homologada para ${result.parameterCode}.`, code: "NO_MATCHING_BAND" };
  }

  return { ...base, interpretable: true, classification, matchedParameter: { id: matched.id, criticality: matched.criticality } };
}

/**
 * Interpreta um parâmetro DERIVADO (ver `derivedParameterCode`): busca as
 * entradas exigidas na mesma amostra (respeitando profundidade, mas não
 * método analítico por entrada -- limitação conhecida, cada entrada pode
 * ter método diferente e o motor hoje não valida isso separadamente),
 * calcula o valor com a função registrada e classifica o resultado. Nunca
 * inventa uma entrada ausente -- se faltar qualquer uma, não interpreta.
 */
function interpretDerivedParameter(param: CropProfileParameterDef, sampleCode: string, sampleResults: LabResultInput[]): ParameterInterpretation {
  const base = { sampleCode, parameterCode: param.parameterCode };
  const fn = DERIVED_PARAMETER_FUNCTIONS[param.derivedParameterCode!];
  if (!fn) {
    return { ...base, interpretable: false, reason: `${param.parameterCode} está configurado com a função de cálculo "${param.derivedParameterCode}", que não existe no motor -- revisão de cadastro necessária.`, code: "UNKNOWN_DERIVATION_FUNCTION" };
  }

  const resolvedInputs: Array<{ parameterCode: string; value: number }> = [];
  for (const requiredCode of fn.requiredParameterCodes) {
    const match = sampleResults.find((r) => r.parameterCode === requiredCode && r.sampleType === param.sampleType && depthCompatible(r.depthFromCm, r.depthToCm, param.depthFromCm, param.depthToCm));
    if (!match) {
      return { ...base, interpretable: false, reason: `${param.parameterCode} é calculado a partir de ${fn.requiredParameterCodes.join(" e ")}, mas ${requiredCode} não foi informado (ou não tem profundidade compatível) na mesma amostra.`, code: "DERIVED_INPUT_MISSING" };
    }
    resolvedInputs.push({ parameterCode: requiredCode, value: match.value });
  }

  if (!param.sufficiencyRanges || param.sufficiencyRanges.length === 0) {
    return { ...base, interpretable: false, reason: `${param.parameterCode} está cadastrado no perfil, mas as faixas de classificação ainda aguardam homologação técnica.`, code: "AWAITING_HOMOLOGATION" };
  }

  const derivedValue = fn.compute(resolvedInputs.map((i) => i.value));
  const classification = classifyValue(derivedValue, param.sufficiencyRanges);
  if (!classification) {
    return { ...base, interpretable: false, reason: `O valor calculado ${derivedValue.toFixed(2)} para ${param.parameterCode} não se encaixa em nenhuma faixa homologada.`, code: "NO_MATCHING_BAND" };
  }

  return {
    ...base,
    interpretable: true,
    classification,
    matchedParameter: { id: param.id, criticality: param.criticality },
    derivation: { value: derivedValue, source: fn.source, inputs: resolvedInputs },
  };
}

export function runAgronomicEngine(input: EngineInput): EngineResult {
  const facts: ParameterFact[] = input.labResults.map((row) => ({ sampleCode: row.sampleCode, parameterCode: row.parameterCode, value: row.value, unit: row.unit, method: row.method }));
  const interpretation = input.labResults.map((row) => interpretOne(row, input.cropProfile, input.labResults.filter((r) => r.sampleCode === row.sampleCode)));

  const derivedParameters = (input.cropProfile?.parameters ?? []).filter((param) => param.status === "ACTIVE" && param.derivedParameterCode);
  if (derivedParameters.length > 0) {
    const sampleCodes = Array.from(new Set(input.labResults.map((r) => r.sampleCode)));
    for (const sampleCode of sampleCodes) {
      const sampleResults = input.labResults.filter((r) => r.sampleCode === sampleCode);
      for (const param of derivedParameters) {
        interpretation.push(interpretDerivedParameter(param, sampleCode, sampleResults));
      }
    }
  }

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
