import assert from "node:assert/strict";
import { runAgronomicEngine } from "../src/domain/agronomic-engine.ts";

function makeResult(overrides = {}) {
  return { sampleCode: "P001", parameterCode: "PH", value: 5.8, unit: "", method: "CaCl2", sampleType: "SOLO", depthFromCm: 0, depthToCm: 20, ...overrides };
}

function makeProfile(overrides = {}) {
  return {
    id: "profile-1",
    code: "SOJA",
    name: "Soja",
    status: "ACTIVE",
    semanticVersion: "1.0.0",
    contentHash: "abc123",
    parameters: [],
    ...overrides,
  };
}

function makeParam(overrides = {}) {
  return {
    id: "param-1",
    parameterCode: "PH",
    parameterCategory: "QUIMICO",
    sampleType: "SOLO",
    depthFromCm: 0,
    depthToCm: 20,
    analyticalMethodAllowed: ["CaCl2"],
    unitExpected: "",
    sufficiencyRanges: [
      { label: "Muito baixo", max: 5.0 },
      { label: "Baixo", min: 5.0, max: 5.5 },
      { label: "Adequado", min: 5.5, max: 6.2 },
      { label: "Alto", min: 6.2, max: 7.0 },
      { label: "Muito alto", min: 7.0 },
    ],
    criticality: "MEDIA",
    status: "ACTIVE",
    ...overrides,
  };
}

// 1. Sem cultura vinculada -> não interpretável, motivo explícito.
{
  const result = runAgronomicEngine({ cropProfile: null, labResults: [makeResult()] });
  assert.equal(result.interpretable, false);
  assert.equal(result.interpretation[0].interpretable, false);
  assert.equal(result.interpretation[0].code, "NO_CROP_PROFILE");
}

// 2. Cultura vinculada, mas parâmetro não cadastrado no perfil.
{
  const profile = makeProfile({ parameters: [] });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult()] });
  assert.equal(result.interpretation[0].code, "PARAMETER_NOT_IN_PROFILE");
}

// 3. Parâmetro cadastrado mas ainda em DRAFT (não homologado/ativo) -> tratado como ausente.
{
  const profile = makeProfile({ parameters: [makeParam({ status: "DRAFT" })] });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult()] });
  assert.equal(result.interpretation[0].code, "PARAMETER_NOT_IN_PROFILE");
}

// 4. Profundidade da amostra desconhecida, mas a regra exige profundidade -> DEPTH_UNKNOWN, nunca assume.
{
  const profile = makeProfile({ parameters: [makeParam()] });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ depthFromCm: null, depthToCm: null })] });
  assert.equal(result.interpretation[0].code, "DEPTH_UNKNOWN");
}

// 5. Regra sem restrição de profundidade (from/to null) -> não bloqueia mesmo sem profundidade conhecida.
{
  const profile = makeProfile({ parameters: [makeParam({ depthFromCm: null, depthToCm: null })] });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ depthFromCm: null, depthToCm: null })] });
  assert.equal(result.interpretation[0].interpretable, true);
}

// 6. Profundidade da amostra fora da faixa coberta pela regra -> DEPTH_NOT_COVERED.
{
  const profile = makeProfile({ parameters: [makeParam({ depthFromCm: 0, depthToCm: 20 })] });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ depthFromCm: 20, depthToCm: 40 })] });
  assert.equal(result.interpretation[0].code, "DEPTH_NOT_COVERED");
}

// 7. Método analítico fora do que o perfil aceita -> nunca assume equivalência.
{
  const profile = makeProfile({ parameters: [makeParam({ analyticalMethodAllowed: ["SMP"] })] });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ method: "CaCl2" })] });
  assert.equal(result.interpretation[0].code, "METHOD_NOT_SUPPORTED");
}

// 8. Parâmetro/profundidade/método corretos mas faixas ainda aguardando homologação (sufficiencyRanges null).
{
  const profile = makeProfile({ parameters: [makeParam({ sufficiencyRanges: null })] });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult()] });
  assert.equal(result.interpretation[0].code, "AWAITING_HOMOLOGATION");
}

// 9. Caminho totalmente interpretável: classifica corretamente pela faixa homologada.
{
  const profile = makeProfile({ parameters: [makeParam()] });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ value: 5.8 })] });
  assert.equal(result.interpretation[0].interpretable, true);
  assert.equal(result.interpretation[0].classification, "Adequado");
  assert.equal(result.interpretation[0].matchedParameter.criticality, "MEDIA");
  assert.equal(result.trace.cropProfileCode, "SOJA");
  assert.equal(result.trace.cropProfileVersion, "1.0.0");
  assert.equal(result.confidence.level, "HIGH");
}

// 10. Valor fora de todas as faixas cadastradas -> não interpretável, nunca extrapola.
{
  const profile = makeProfile({ parameters: [makeParam({ sufficiencyRanges: [{ label: "Adequado", min: 5.5, max: 6.2 }] })] });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ value: 9.9 })] });
  assert.equal(result.interpretation[0].code, "NO_MATCHING_BAND");
}

// 11. Pendências deduplicadas e confiança combinando múltiplos parâmetros.
{
  const profile = makeProfile({ parameters: [makeParam(), makeParam({ id: "param-2", parameterCode: "K", sufficiencyRanges: null })] });
  const result = runAgronomicEngine({
    cropProfile: profile,
    labResults: [makeResult({ value: 5.8 }), makeResult({ parameterCode: "K", value: 0.2, method: "CaCl2" })],
  });
  assert.equal(result.interpretation.length, 2);
  assert.equal(result.interpretable, true); // ao menos um parâmetro interpretável
  assert.equal(result.pendencies.length, 1);
}

// 12. Duas faixas para o mesmo parâmetro/profundidade/método, SEM condição
// declarada em nenhuma delas -> cadastro ambíguo, nunca escolhe a primeira
// arbitrariamente (bug real encontrado ao carregar P/K da CQFS-RS/SC: antes
// dessa checagem, `methodMatches[0]` pegava sempre a mesma faixa e ignorava
// as outras 3 classes de argila/CTC silenciosamente).
{
  const profile = makeProfile({
    parameters: [
      makeParam({ id: "p-classe-1", parameterCode: "P", sufficiencyRanges: [{ label: "Baixo", max: 6 }, { label: "Alto", min: 6 }] }),
      makeParam({ id: "p-classe-2", parameterCode: "P", sufficiencyRanges: [{ label: "Baixo", max: 8 }, { label: "Alto", min: 8 }] }),
    ],
  });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ parameterCode: "P", value: 7, method: "CaCl2" })] });
  assert.equal(result.interpretation[0].code, "NO_CONDITION_MATCH");
}

// 13. Faixa condicionada (ex.: P por classe de argila) mas o parâmetro
// condicionante (CLAY) não foi informado na mesma amostra -> nunca supõe.
{
  const profile = makeProfile({
    parameters: [
      makeParam({ id: "p-classe-1", parameterCode: "P", conditionParameterCode: "CLAY", conditionMin: 0, conditionMax: 20, sufficiencyRanges: [{ label: "Baixo", max: 6 }, { label: "Alto", min: 6 }] }),
      makeParam({ id: "p-classe-2", parameterCode: "P", conditionParameterCode: "CLAY", conditionMin: 21, conditionMax: 100, sufficiencyRanges: [{ label: "Baixo", max: 8 }, { label: "Alto", min: 8 }] }),
    ],
  });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ parameterCode: "P", value: 7, method: "CaCl2" })] });
  assert.equal(result.interpretation[0].code, "CONDITION_PARAMETER_MISSING");
}

// 14. Parâmetro condicionante informado, mas fora de todas as classes cadastradas.
{
  const profile = makeProfile({
    parameters: [
      makeParam({ id: "p-classe-1", parameterCode: "P", conditionParameterCode: "CLAY", conditionMin: 0, conditionMax: 20, sufficiencyRanges: [{ label: "Baixo", max: 6 }, { label: "Alto", min: 6 }] }),
      makeParam({ id: "p-classe-2", parameterCode: "P", conditionParameterCode: "CLAY", conditionMin: 21, conditionMax: 60, sufficiencyRanges: [{ label: "Baixo", max: 8 }, { label: "Alto", min: 8 }] }),
    ],
  });
  const result = runAgronomicEngine({
    cropProfile: profile,
    labResults: [makeResult({ parameterCode: "P", value: 7, method: "CaCl2" }), makeResult({ parameterCode: "CLAY", value: 85, method: "" })],
  });
  assert.equal(result.interpretation[0].code, "NO_CONDITION_MATCH");
}

// 15. Caminho feliz: escolhe a faixa certa entre várias condicionadas usando
// outro resultado da MESMA amostra -- réplica minificada do caso real
// (P pela CQFS-RS/SC, faixa depende da classe de argila do mesmo talhão).
{
  const profile = makeProfile({
    parameters: [
      makeParam({ id: "p-classe-1", parameterCode: "P", conditionParameterCode: "CLAY", conditionMin: 60.0001, conditionMax: null, sufficiencyRanges: [{ label: "Baixo", max: 6 }, { label: "Alto", min: 6 }] }),
      makeParam({ id: "p-classe-4", parameterCode: "P", conditionParameterCode: "CLAY", conditionMin: 0, conditionMax: 20, sufficiencyRanges: [{ label: "Baixo", max: 20 }, { label: "Alto", min: 20 }] }),
    ],
  });
  const result = runAgronomicEngine({
    cropProfile: profile,
    labResults: [makeResult({ parameterCode: "P", value: 15, method: "CaCl2" }), makeResult({ parameterCode: "CLAY", value: 10, method: "" })],
  });
  assert.equal(result.interpretation[0].interpretable, true);
  assert.equal(result.interpretation[0].classification, "Baixo"); // classe 4 (argila 10%): 15 < 20 -> Baixo
  assert.equal(result.interpretation[0].matchedParameter.id, "p-classe-4");
}

// 16-18. Fronteira de faixa: a fonte (CQFS-RS/SC) escreve "9,1-18,0" seguido
// de ">18,0" -- o valor exato do corte pertence à faixa de baixo (inclusive
// no max), só valores ESTRITAMENTE maiores entram na faixa de cima (sem
// `max`). Cross-validado em 2026-09-04 comparando duas pesquisas de IA
// independentes contra o mesmo manual oficial -- achamos que o motor fazia
// o oposto (tratava o corte como já sendo da faixa de cima).
{
  const bands = [
    { label: "Baixo", max: 9.0 },
    { label: "Alto", min: 9.1, max: 18.0 },
    { label: "Muito Alto", min: 18.0 },
  ];
  const profile = makeProfile({ parameters: [makeParam({ sufficiencyRanges: bands })] });

  // 16. Exatamente no corte superior de uma faixa do meio -> pertence a ELA, não à próxima.
  {
    const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ value: 18.0 })] });
    assert.equal(result.interpretation[0].classification, "Alto");
  }
  // 17. Estritamente acima do corte -> só agora entra na faixa de cima.
  {
    const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ value: 18.01 })] });
    assert.equal(result.interpretation[0].classification, "Muito Alto");
  }
  // 18. Exatamente no corte da faixa mais baixa (sem `min`) -> ainda pertence a ela.
  {
    const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ value: 9.0 })] });
    assert.equal(result.interpretation[0].classification, "Baixo");
  }
}

// 19-23. Parâmetro DERIVADO: valor calculado por fórmula (não vem de um
// resultado de laboratório importado direto), depois classificado. Caso
// real: risco de toxidez de ferro em arroz irrigado (Fe2+trocável = 1,66 +
// 2,46×Fe; PSFe2+ = 100×Fe2+trocável/CTC; risco Baixo ≤20%, Médio 21-40%,
// Alto >40% -- Manual CQFS-RS/SC 2016, conferido direto no PDF oficial).
{
  const feProfile = makeProfile({
    parameters: [
      makeParam({
        id: "fe-toxicidade", parameterCode: "FE_TOXICITY_PSFE", derivedParameterCode: "FE_TOXICITY_PSFE",
        analyticalMethodAllowed: [], unitExpected: "%",
        sufficiencyRanges: [{ label: "Baixo", max: 20 }, { label: "Médio", min: 20, max: 40 }, { label: "Alto", min: 40 }],
      }),
    ],
  });

  // 19. Caminho feliz: Fe=1,0 g/dm³, CTC=10 -> Fe2+troc=4,12, PSFe2+=41,2% -> Alto.
  {
    const result = runAgronomicEngine({
      cropProfile: feProfile,
      labResults: [makeResult({ parameterCode: "FE", value: 1.0, method: "" }), makeResult({ parameterCode: "CTC", value: 10, method: "" })],
    });
    const derived = result.interpretation.find((i) => i.parameterCode === "FE_TOXICITY_PSFE");
    assert.equal(derived.interpretable, true);
    assert.equal(derived.classification, "Alto");
    assert.ok(Math.abs(derived.derivation.value - 41.2) < 0.01, `esperava ~41.2, veio ${derived.derivation.value}`);
  }
  // 20. Fe=0,5, CTC=15 -> Fe2+troc=2,89, PSFe2+≈19,27% -> Baixo.
  {
    const result = runAgronomicEngine({
      cropProfile: feProfile,
      labResults: [makeResult({ parameterCode: "FE", value: 0.5, method: "" }), makeResult({ parameterCode: "CTC", value: 15, method: "" })],
    });
    const derived = result.interpretation.find((i) => i.parameterCode === "FE_TOXICITY_PSFE");
    assert.equal(derived.classification, "Baixo");
  }
  // 21. Falta uma das entradas exigidas (CTC não informado) -> nunca inventa, não interpreta.
  {
    const result = runAgronomicEngine({
      cropProfile: feProfile,
      labResults: [makeResult({ parameterCode: "FE", value: 1.0, method: "" })],
    });
    const derived = result.interpretation.find((i) => i.parameterCode === "FE_TOXICITY_PSFE");
    assert.equal(derived.interpretable, false);
    assert.equal(derived.code, "DERIVED_INPUT_MISSING");
  }
  // 22. Função de derivação desconhecida no cadastro -> erro explícito, nunca decide sozinho.
  {
    const badProfile = makeProfile({
      parameters: [makeParam({ id: "x", parameterCode: "ALGO_INVENTADO", derivedParameterCode: "FUNCAO_QUE_NAO_EXISTE", sufficiencyRanges: [{ label: "Baixo", max: 1 }] })],
    });
    const result = runAgronomicEngine({ cropProfile: badProfile, labResults: [makeResult({ parameterCode: "FE", value: 1, method: "" })] });
    const derived = result.interpretation.find((i) => i.parameterCode === "ALGO_INVENTADO");
    assert.equal(derived.code, "UNKNOWN_DERIVATION_FUNCTION");
  }
  // 23. Sem nenhuma amostra na análise -> nenhuma tentativa de derivar nada (não quebra com lista vazia).
  {
    const result = runAgronomicEngine({ cropProfile: feProfile, labResults: [] });
    assert.equal(result.interpretation.length, 0);
  }
  // 27. Parâmetro derivado exige que as entradas tenham o MESMO tipo de amostra
  // do parâmetro derivado -- um resultado com o parameterCode certo (FE) mas
  // tipo de amostra errado (FOLIAR em vez de SOLO) não deve ser aceito como
  // entrada válida (nunca mistura amostra de solo com amostra de folha no
  // mesmo cálculo).
  {
    const result = runAgronomicEngine({
      cropProfile: feProfile,
      labResults: [makeResult({ parameterCode: "FE", value: 1.0, sampleType: "FOLIAR", method: "" }), makeResult({ parameterCode: "CTC", value: 10, method: "" })],
    });
    const derived = result.interpretation.find((i) => i.parameterCode === "FE_TOXICITY_PSFE");
    assert.equal(derived.interpretable, false);
    assert.equal(derived.code, "DERIVED_INPUT_MISSING");
  }
}

// 24-26. Tipo de amostra (sample_type) -- decisão do diretor (2026-09-04): uma
// faixa de solo e uma faixa de folha pro MESMO código de parâmetro nunca
// podem ser confundidas pelo motor (ex.: videira tem N insuficiente<0,40%
// no pecíolo mas <1,60% na folha completa -- e nenhuma das duas tem
// qualquer relação com N no solo).
{
  const dualProfile = makeProfile({
    parameters: [
      makeParam({ id: "n-solo", parameterCode: "N", sampleType: "SOLO", sufficiencyRanges: [{ label: "Baixo-solo", max: 50 }, { label: "Alto-solo", min: 50 }] }),
      makeParam({ id: "n-foliar", parameterCode: "N", sampleType: "FOLIAR", depthFromCm: null, depthToCm: null, sufficiencyRanges: [{ label: "Insuficiente-folha", max: 1.6 }, { label: "Normal-folha", min: 1.6, max: 2.4 }, { label: "Excessivo-folha", min: 2.4 }] }),
    ],
  });

  // 24. Resultado de SOLO bate na faixa de solo, não na de folha.
  {
    const result = runAgronomicEngine({ cropProfile: dualProfile, labResults: [makeResult({ parameterCode: "N", value: 60, sampleType: "SOLO" })] });
    const item = result.interpretation[0];
    assert.equal(item.interpretable, true);
    assert.equal(item.classification, "Alto-solo");
    assert.equal(item.matchedParameter.id, "n-solo");
  }

  // 25. Resultado FOLIAR bate na faixa de folha, não na de solo -- mesmo valor
  // numérico (2,0) que seria "Alto-solo" se fosse tratado como solo.
  {
    const result = runAgronomicEngine({ cropProfile: dualProfile, labResults: [makeResult({ parameterCode: "N", value: 2.0, sampleType: "FOLIAR", depthFromCm: null, depthToCm: null })] });
    const item = result.interpretation[0];
    assert.equal(item.interpretable, true);
    assert.equal(item.classification, "Normal-folha");
    assert.equal(item.matchedParameter.id, "n-foliar");
  }

  // 26. Tipo de amostra sem nenhuma faixa cadastrada (PECIOLO, só existe SOLO e
  // FOLIAR neste perfil) -> não interpretável, motivo explícito, nunca
  // confunde com outro tipo por engano.
  {
    const result = runAgronomicEngine({ cropProfile: dualProfile, labResults: [makeResult({ parameterCode: "N", value: 1.0, sampleType: "PECIOLO", depthFromCm: null, depthToCm: null })] });
    const item = result.interpretation[0];
    assert.equal(item.interpretable, false);
    assert.equal(item.code, "SAMPLE_TYPE_NOT_COVERED");
  }
}

// 27-31. Compatibilidade de UNIDADE (item 3 do fechamento técnico, auditoria RAIZ_2.0/Cabeda 2026-09-11):
// `unitExpected` existia em `CropProfileParameterDef` mas nunca era conferido contra `result.unit` --
// achado real, corrigido. Comparação sempre EXATA, nunca frouxa (nenhuma tradução de unidade dentro do
// motor -- isso é responsabilidade da ingestão/normalização, `lab-method-normalization.ts`).

// 27. unidade esperada bate exatamente com a recebida -> interpreta normalmente.
{
  const profile = makeProfile({ parameters: [makeParam({ unitExpected: "mg/dm³" })] });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ unit: "mg/dm³", value: 5.8 })] });
  assert.equal(result.interpretation[0].interpretable, true);
}

// 28. unidade incompatível de verdade (cmolc/dm³ esperado, mg/dm³ recebido) -> nunca classifica.
{
  const profile = makeProfile({ parameters: [makeParam({ unitExpected: "cmolc/dm³" })] });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ unit: "mg/dm³", value: 5.8 })] });
  assert.equal(result.interpretation[0].interpretable, false);
  assert.equal(result.interpretation[0].code, "UNIT_NOT_SUPPORTED");
}

// 29. unidade totalmente desconhecida/não relacionada -> não interpreta (nunca assume).
{
  const profile = makeProfile({ parameters: [makeParam({ unitExpected: "mg/dm³" })] });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ unit: "unidade-desconhecida-xyz", value: 5.8 })] });
  assert.equal(result.interpretation[0].interpretable, false);
  assert.equal(result.interpretation[0].code, "UNIT_NOT_SUPPORTED");
}

// 30. P/K com unidade "mg/L" não homologada (perfil espera "mg/dm³") -> não interpreta -- o MOTOR nunca
// aceita uma tradução de unidade sozinho; essa tradução só pode acontecer na ingestão (fora do motor,
// antes do resultado chegar aqui), nunca dentro de `interpretOne`.
{
  const profile = makeProfile({ parameters: [makeParam({ parameterCode: "P", unitExpected: "mg/dm³", analyticalMethodAllowed: ["Mehlich-1"] })] });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ parameterCode: "P", method: "Mehlich-1", unit: "mg/L", value: 11.0 })] });
  assert.equal(result.interpretation[0].interpretable, false);
  assert.equal(result.interpretation[0].code, "UNIT_NOT_SUPPORTED");
}

// 31. parâmetro SEM unitExpected declarado (null/vazio) -> comportamento explícito: sem restrição, nunca
// bloqueia por unidade (mesmo padrão já usado por `analyticalMethodAllowed: []`) -- mesmo com uma unidade
// "esquisita" no resultado, a ausência de `unitExpected` significa "perfil não declarou restrição".
{
  const profile = makeProfile({ parameters: [makeParam({ unitExpected: null })] });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ unit: "qualquer-coisa", value: 5.8 })] });
  assert.equal(result.interpretation[0].interpretable, true);
}

// 32-35. `classificationRole` / dado AUXILIAR (item 2 do fechamento técnico): um código listado em
// `cropProfile.auxiliaryParameterCodes` nunca é tratado como "parâmetro não homologado" -- é
// estruturalmente um dado auxiliar, código `NOT_CLASSIFICATION_TARGET`, `classificationRole: "AUXILIARY"`,
// mesmo que NENHUMA linha exista pra ele em `parameters` (não é sobre existir cadastro, é sobre nunca ser
// um alvo de classificação nesta metodologia).

// 32. Parâmetro auxiliar sem NENHUMA linha em `parameters` -> NOT_CLASSIFICATION_TARGET, não
// PARAMETER_NOT_IN_PROFILE (achado real: os dois casos usavam o MESMO código antes desta correção).
{
  const profile = makeProfile({ parameters: [], auxiliaryParameterCodes: ["CLAY"] });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ parameterCode: "CLAY", unit: "%", value: 72 })] });
  const item = result.interpretation[0];
  assert.equal(item.interpretable, false);
  assert.equal(item.code, "NOT_CLASSIFICATION_TARGET");
  assert.equal(item.classificationRole, "AUXILIARY");
}

// 33. Todo resultado TARGET (classificado ou não) carrega `classificationRole: "TARGET"`.
{
  const profile = makeProfile({ parameters: [makeParam()], auxiliaryParameterCodes: ["CLAY"] });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ parameterCode: "PH", value: 5.8 })] });
  assert.equal(result.interpretation[0].classificationRole, "TARGET");
  assert.equal(result.interpretation[0].interpretable, true);
}

// 34. Um parâmetro genuinamente ainda não homologado (existe em `parameters` mas DRAFT, não está em
// `auxiliaryParameterCodes`) continua PARAMETER_NOT_IN_PROFILE/TARGET -- nunca vira AUXILIARY por engano.
{
  const profile = makeProfile({ parameters: [makeParam({ parameterCode: "CTC", status: "DRAFT" })], auxiliaryParameterCodes: ["CLAY"] });
  const result = runAgronomicEngine({ cropProfile: profile, labResults: [makeResult({ parameterCode: "CTC", value: 15 })] });
  const item = result.interpretation[0];
  assert.equal(item.classificationRole, "TARGET");
  assert.equal(item.code, "PARAMETER_NOT_IN_PROFILE");
}

// 35. Completude (confidence.dimensions) conta só entre alvos reais (classificado + aguardando) -- um
// dado auxiliar nunca derruba a nota de completude por só existir. 1 TARGET classificado + 1 AUXILIARY
// -> completude 100% (não 50%).
{
  const profile = makeProfile({ parameters: [makeParam()], auxiliaryParameterCodes: ["CLAY"] });
  const result = runAgronomicEngine({
    cropProfile: profile,
    labResults: [makeResult({ parameterCode: "PH", value: 5.8 }), makeResult({ parameterCode: "CLAY", unit: "%", value: 72 })],
  });
  const completeness = result.confidence.dimensions.find((d) => d.key === "completeness");
  assert.equal(completeness.score, 100);
}

console.log("agronomic-engine: 35 cenários aprovados");
