import assert from "node:assert/strict";
import { runAgronomicEngine } from "../src/domain/agronomic-engine.ts";

function makeResult(overrides = {}) {
  return { sampleCode: "P001", parameterCode: "PH", value: 5.8, unit: "", method: "CaCl2", depthFromCm: 0, depthToCm: 20, ...overrides };
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

console.log("agronomic-engine: 11 cenários aprovados");
