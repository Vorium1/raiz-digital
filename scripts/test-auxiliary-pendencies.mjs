import assert from "node:assert/strict";
import { runAgronomicEngine } from "../src/domain/agronomic-engine.ts";

const profile = {
  id: "profile-soja-test",
  code: "SOJA",
  name: "Soja",
  status: "ACTIVE",
  semanticVersion: "test",
  contentHash: "test",
  auxiliaryParameterCodes: ["CLAY", "SMP", "H_AL", "PH", "AL"],
  parameters: [
    {
      id: "ca-active",
      parameterCode: "CA",
      parameterCategory: "QUIMICO",
      sampleType: "SOLO",
      depthFromCm: 0,
      depthToCm: 20,
      analyticalMethodAllowed: ["KCl 1 mol/L"],
      unitExpected: "cmolc/dm³",
      sufficiencyRanges: [{ label: "Baixo", max: 2 }, { label: "Alto", min: 2 }],
      criticality: "MEDIA",
      status: "ACTIVE",
      conditionParameterCode: null,
      conditionMin: null,
      conditionMax: null,
      derivedParameterCode: null,
    },
    {
      id: "ctc-draft",
      parameterCode: "CTC",
      parameterCategory: "QUIMICO",
      sampleType: "SOLO",
      depthFromCm: 0,
      depthToCm: 20,
      analyticalMethodAllowed: ["Calculado: CTCpH7,0 = Ca + Mg + K + (H+Al)"],
      unitExpected: "cmolc/dm³",
      sufficiencyRanges: [{ label: "Baixa", max: 7.5 }, { label: "Alta", min: 7.5 }],
      criticality: "BAIXA",
      status: "DRAFT",
      conditionParameterCode: null,
      conditionMin: null,
      conditionMax: null,
      derivedParameterCode: null,
    },
  ],
};

const common = { sampleCode: "SQC-TEST", sampleType: "SOLO", depthFromCm: 0, depthToCm: 20, source: "MEASURED" };
const result = runAgronomicEngine({
  cropProfile: profile,
  labResults: [
    { ...common, parameterCode: "CA", value: 6.2, unit: "cmolc/dm³", method: "KCl 1 mol/L" },
    { ...common, parameterCode: "CLAY", value: 72, unit: "%", method: "Densímetro" },
    { ...common, parameterCode: "SMP", value: 5.6, unit: "", method: "Índice SMP" },
    { ...common, parameterCode: "CTC", value: 16.1, unit: "cmolc/dm³", method: "Calculado: CTCpH7,0 = Ca + Mg + K + (H+Al)" },
  ],
});

const aux = result.interpretation.filter((item) => item.classificationRole === "AUXILIARY");
assert.equal(aux.length, 2);
assert.ok(aux.every((item) => item.code === "NOT_CLASSIFICATION_TARGET"));
assert.equal(result.interpretation.find((item) => item.parameterCode === "CA")?.interpretable, true);
assert.equal(result.interpretation.find((item) => item.parameterCode === "CTC")?.classificationRole, "TARGET");
assert.equal(result.interpretation.find((item) => item.parameterCode === "CTC")?.interpretable, false);
assert.equal(result.pendencies.length, 1, "somente CTC TARGET deve aparecer como pendência");
assert.match(result.pendencies[0], /CTC/);
assert.ok(!result.pendencies.some((text) => /CLAY|SMP/.test(text)), "auxiliares não podem vazar para pendências");

console.log("OK — dados auxiliares ficam no contexto e nunca viram pendência agronômica.");
