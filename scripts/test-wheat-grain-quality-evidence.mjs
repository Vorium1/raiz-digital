import assert from "node:assert/strict";
import { evaluateWheatGrainQualityEvidence } from "../src/domain/wheat-grain-quality-evidence.ts";
import { deterministicLimitedPrescriptionProvider } from "../src/lib/ai/providers/deterministic-limited-prescription-provider.ts";

const rows = [
  { sampleCode: "G1", sampleType: "GRAO", parameterCode: "PROTEIN_TOTAL", value: 13.4, unit: "%", method: "NIR", protocol: "AACC" },
  { sampleCode: "G1", sampleType: "GRAO", parameterCode: "GLUTEN_WET", value: 31.2, unit: "%", method: "Glutomatic", protocol: null },
  { sampleCode: "G1", sampleType: "GRAO", parameterCode: "ALVEOGRAPH_W", value: 285, unit: "10^-4 J", method: "Alveografia", protocol: null },
  { sampleCode: "G1", sampleType: "GRAO", parameterCode: "P_L", value: 1.1, unit: "índice", method: "Alveografia", protocol: null },
  { sampleCode: "G1", sampleType: "GRAO", parameterCode: "GLIADIN", value: 4.2, unit: "%", method: "Eletroforese", protocol: null },
  { sampleCode: "G1", sampleType: "GRAO", parameterCode: "GLUTENIN", value: 5.4, unit: "%", method: "Eletroforese", protocol: null },
  // Mesmo nome de parâmetro em SOLO nunca entra na camada de qualidade de grão.
  { sampleCode: "S1", sampleType: "SOLO", parameterCode: "PROTEIN_TOTAL", value: 99, unit: "%", method: "Teste", protocol: null },
];

const quality = evaluateWheatGrainQualityEvidence({
  cropProfileCode: "TRIGO",
  currentCrop: "Trigo",
  currentCultivar: "Cultivar teste",
  rows,
});

assert.equal(quality.status, "AVAILABLE");
assert.equal(quality.targetCultivar, "Cultivar teste");
assert.equal(quality.observations.length, 6);
assert.equal(quality.observations.some((row) => row.sampleCode === "S1"), false);
assert.deepEqual(
  quality.metricsPresent,
  ["PROTEIN_TOTAL", "GLUTEN_WET", "ALVEOGRAPH_W", "P_L", "GLIADIN", "GLUTENIN"],
);
assert.equal(quality.policy.automaticIndustrialGradeAllowed, false);
assert.equal(quality.policy.automaticNitrogenAdjustmentAllowed, false);
assert.equal(quality.policy.crossMetricInferenceAllowed, false);
assert.equal(quality.policy.buyerSpecificationAssumed, false);

const notWheat = evaluateWheatGrainQualityEvidence({
  cropProfileCode: "SOJA",
  currentCrop: "Soja",
  rows,
});
assert.equal(notWheat.status, "NOT_APPLICABLE");
assert.equal(notWheat.observations.length, 0);

function nitrogenEvidence(qualityRequested) {
  return {
    status: "CURRENT",
    executionId: "exec-wheat-n",
    executionStatus: "READY_FOR_IMPLEMENTATION",
    ruleId: "N-TRIGO-EMBRAPA-2026",
    ruleVersion: "1.0.0",
    sourceSnapshotId: "snapshot",
    createdAt: "2026-09-21T00:00:00.000Z",
    limitations: [],
    recommendation: {
      crop: "TRIGO",
      ruleId: "N-TRIGO-EMBRAPA-2026",
      ruleVersion: "1.0.0",
      sourceSnapshotId: "snapshot",
      status: "READY_FOR_IMPLEMENTATION",
      dose: { kind: "EXACT", kgNPerHa: 80 },
      sowingRangeKgNPerHa: { min: 15, max: 20 },
      blockers: [],
      notes: [],
      source: "Embrapa Trigo",
      qualityObjective: {
        kind: "WHEAT_PROTEIN_QUALITY",
        requested: qualityRequested,
        industrialTarget: qualityRequested ? "VITAL_WHEAT_GLUTEN" : null,
        targetProteinFractions: ["GLIADIN", "GLUTENIN"],
        screeningMetrics: ["GRAIN_PROTEIN", "WET_GLUTEN", "DRY_GLUTEN", "GLUTEN_INDEX", "ALVEOGRAPH_W", "P_L", "SDS_SEDIMENTATION"],
        buyerSpecificationRequired: true,
        status: qualityRequested ? "REQUIRES_SPECIFIC_REVIEW" : "NOT_REQUESTED",
        automaticAdditionalDoseAllowed: false,
        additionalDoseKgNPerHa: null,
        evidence: "Mais proteína total não prova, isoladamente, maior funcionalidade do glúten.",
        source: "Embrapa Trigo",
      },
    },
  };
}

function baseEvidence(qualityRequested) {
  return {
    results: [],
    technicalSources: [],
    deterministicInterpretation: null,
    season: {
      cropProfileCode: "TRIGO",
      wheatQualityObjectiveRequested: qualityRequested,
    },
    deterministicPkDoses: {
      P2O5: { ready: false, blockers: ["TEST_NO_P"] },
      K2O: { ready: false, blockers: ["TEST_NO_K"] },
    },
    deterministicNitrogenEvidence: nitrogenEvidence(qualityRequested),
    wheatGrainQualityEvidence: quality,
  };
}

const productivityOnly = await deterministicLimitedPrescriptionProvider.prescribe({
  evidence: baseEvidence(false),
});
const productivityN = productivityOnly.prescription.recommendations.filter((row) => row.inputType === "N");
assert.equal(productivityN.length, 1);
assert.equal(productivityN[0].quantity, 80, "laudo de qualidade não pode alterar N-base");
const productivityText = productivityOnly.prescription.managementPractices.join(" ");
assert.match(productivityText, /Qualidade do grão de trigo/);
assert.match(productivityText, /Proteína total: 13,4 %/);
assert.match(productivityText, /Força de glúten \(W\): 285 10\^-4 J/);
assert.match(productivityText, /Gliadina: 4,2 %/);
assert.match(productivityText, /Glutenina: 5,4 %/);
assert.match(productivityText, /sem transformar a análise em um manejo específico para Glúten Vital/i);
assert.doesNotMatch(productivityOnly.prescription.missingInformation.join(" "), /padrão|prêmio|comprador/i);

const industrial = await deterministicLimitedPrescriptionProvider.prescribe({
  evidence: baseEvidence(true),
});
const industrialN = industrial.prescription.recommendations.filter((row) => row.inputType === "N");
assert.equal(industrialN.length, 1);
assert.equal(industrialN[0].quantity, 80, "objetivo industrial não pode criar/alterar N automaticamente");
const industrialText = industrial.prescription.managementPractices.join(" ");
assert.match(industrialText, /Objetivo proteína\/Glúten Vital/);
assert.match(industrialText, /não são convertidos uns nos outros/);
assert.match(industrialText, /não autorizam N adicional automaticamente/);
assert.match(industrial.prescription.missingInformation.join(" "), /sem especificação oficial\/contratual do comprador/);
assert.doesNotMatch(industrialText, /atende.*Be8|padrão Be8|prêmio Be8/i);

console.log("wheat-grain-quality: measured grain evidence is preserved, non-prescriptive and cannot alter base N");
