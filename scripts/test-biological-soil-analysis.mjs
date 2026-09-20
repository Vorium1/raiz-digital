import assert from "node:assert/strict";
import { evaluateBiologicalSoilEvidence } from "../src/domain/biological-soil-analysis.ts";

const none = evaluateBiologicalSoilEvidence({
  regionScope: "SOUTH_BRAZIL",
  cropGroup: "ANNUAL_GRAIN_FIBER",
  observations: [],
});
assert.equal(none.hasAnyBiology, false);
assert.equal(none.analysisPolicy.missingBiologyBlocksAnalysis, false);
assert.equal(none.analysisPolicy.missingBiologyBlocksOfficialReport, false);

const southAnnual = evaluateBiologicalSoilEvidence({
  regionScope: "SOUTH_BRAZIL",
  cropGroup: "ANNUAL_GRAIN_FIBER",
  officialLabInterpretationAvailable: true,
  sourceVersion: "Embrapa BioAS vigente",
  observations: [
    {
      parameterCode: "BIOAS_BETA_GLUCOSIDASE",
      value: 152,
      unit: "mg p-nitrofenol kg⁻¹ solo h⁻¹",
      method: "BioAS Embrapa — atividade enzimática",
      depthFromCm: 0,
      depthToCm: 10,
    },
    {
      parameterCode: "BIOAS_ARYLSULFATASE",
      value: 158,
      unit: "mg p-nitrofenol kg⁻¹ solo h⁻¹",
      method: "BioAS Embrapa — atividade enzimática",
      depthFromCm: 0,
      depthToCm: 10,
    },
    {
      parameterCode: "BIOAS_IQS_FERTBIO",
      value: 0.92,
      unit: "índice",
      method: "BioAS/MIQS — índice informado no laudo",
      sourceKind: "LAB_DERIVED_INDEX",
    },
  ],
});
assert.equal(southAnnual.coreBioAs.complete, true);
assert.equal(southAnnual.interpretation.automaticRaizInterpretationAllowed, false);
assert.equal(southAnnual.interpretation.officialNationalBioAsInterpretationUsable, true);
assert.equal(southAnnual.interpretation.labReportedInterpretationCanBePreserved, true);
assert.equal(southAnnual.interpretation.nationalBioAsNetworkEvidenceAllowed, true);
assert.equal(southAnnual.interpretation.raizRecomputationOfOfficialIndexesAllowed, false);
assert.equal(southAnnual.interpretation.crossRegionAlgorithmTransferAllowed, false);
assert.equal(southAnnual.interpretation.labIndexesMustBePreservedNotRecomputed, true);
assert.equal(southAnnual.warnings.includes("BIOAS_RAIZ_REGIONAL_CALIBRATION_NOT_HOMOLOGATED_FOR_SOUTH_BRAZIL"), false);
assert.equal(southAnnual.analysisPolicy.automaticNutrientCreditAllowed, false);
assert.equal(southAnnual.analysisPolicy.automaticDoseReductionAllowed, false);
assert.equal(southAnnual.analysisPolicy.automaticDoseIncreaseAllowed, false);

const horticulture = evaluateBiologicalSoilEvidence({
  regionScope: "SOUTH_BRAZIL",
  cropGroup: "HORTICULTURE",
  observations: southAnnual.coreBioAs.complete ? [
    {
      parameterCode: "BIOAS_BETA_GLUCOSIDASE",
      value: 90,
      unit: "mg p-nitrofenol kg⁻¹ solo h⁻¹",
      method: "BioAS Embrapa — atividade enzimática",
    },
    {
      parameterCode: "BIOAS_ARYLSULFATASE",
      value: 100,
      unit: "mg p-nitrofenol kg⁻¹ solo h⁻¹",
      method: "BioAS Embrapa — atividade enzimática",
    },
  ] : [],
});
assert.equal(horticulture.hasAnyBiology, true);
assert.equal(horticulture.interpretation.automaticRaizInterpretationAllowed, false);
assert.ok(horticulture.warnings.includes("BIOAS_RAW_ENZYMES_REQUIRE_OFFICIAL_OR_VERSIONED_INTERPRETATION"));
assert.equal(horticulture.analysisPolicy.missingBiologyBlocksAnalysis, false);

const incomplete = evaluateBiologicalSoilEvidence({
  regionScope: "CERRADO",
  cropGroup: "ANNUAL_GRAIN_FIBER",
  observations: [{
    parameterCode: "BIOAS_BETA_GLUCOSIDASE",
    value: 70,
    unit: "mg p-nitrofenol kg⁻¹ solo h⁻¹",
    method: "BioAS Embrapa — atividade enzimática",
  }],
});
assert.ok(incomplete.warnings.includes("BIOAS_CORE_ENZYME_PAIR_INCOMPLETE"));
assert.equal(incomplete.interpretation.automaticRaizInterpretationAllowed, false);

const cerradoAnnual = evaluateBiologicalSoilEvidence({
  regionScope: "CERRADO",
  cropGroup: "ANNUAL_GRAIN_FIBER",
  observations: [
    {
      parameterCode: "BIOAS_BETA_GLUCOSIDASE",
      value: 140,
      unit: "mg p-nitrofenol kg⁻¹ solo h⁻¹",
      method: "BioAS Embrapa — atividade enzimática",
      depthFromCm: 0,
      depthToCm: 10,
    },
    {
      parameterCode: "BIOAS_ARYLSULFATASE",
      value: 150,
      unit: "mg p-nitrofenol kg⁻¹ solo h⁻¹",
      method: "BioAS Embrapa — atividade enzimática",
      depthFromCm: 0,
      depthToCm: 10,
    },
  ],
});
assert.equal(cerradoAnnual.interpretation.automaticRaizInterpretationAllowed, false);
assert.equal(cerradoAnnual.interpretation.officialNationalBioAsInterpretationUsable, false);
assert.ok(cerradoAnnual.warnings.includes("BIOAS_RAW_ENZYMES_REQUIRE_OFFICIAL_OR_VERSIONED_INTERPRETATION"));

console.log("biological-soil-analysis: evidência opcional, domínio BioAS e firewall de dose validados");
