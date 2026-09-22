import assert from "node:assert/strict";
import {
  BIOLOGICAL_FUNCTIONAL_ROLE_NOTES,
  evaluateBiologicalFunctionalEvidence,
} from "../src/domain/biological-functional-evidence.ts";

const detectionOnly=evaluateBiologicalFunctionalEvidence({
  role:"BIOLOGICAL_N_FIXATION",
  cropCode:"MILHO",
  evidence:[{
    kind:"SOIL_OR_ROOT_DETECTION",
    functionalRole:"BIOLOGICAL_N_FIXATION",
    organismOrConsortium:"Azospirillum brasilense",
    methodOrProtocol:"qPCR informado pelo laboratório",
  }],
});
assert.equal(detectionOnly.stage,"DETECTED_ONLY");
assert.equal(detectionOnly.policy.soilDetectionIsInoculationProof,false);
assert.equal(detectionOnly.policy.automaticNutrientCreditAllowed,false);
assert.ok(detectionOnly.warnings.includes("BIOLOGICAL_DETECTION_DOES_NOT_PROVE_FIELD_INOCULATION"));
assert.ok(detectionOnly.warnings.includes("BIOLOGICAL_N_FIXATION_DOES_NOT_AUTHORIZE_GENERIC_N_CREDIT"));

const functional=evaluateBiologicalFunctionalEvidence({
  role:"PHOSPHORUS_SOLUBILIZATION",
  cropCode:"MILHO",
  evidence:[{
    kind:"FUNCTIONAL_LAB_ASSAY",
    functionalRole:"PHOSPHORUS_SOLUBILIZATION",
    organismOrConsortium:"Bacillus spp.",
    methodOrProtocol:"Solubilização em meio informado pelo laboratório",
  }],
});
assert.equal(functional.stage,"FUNCTION_DEMONSTRATED_IN_LAB");
assert.equal(functional.policy.labFunctionIsFieldFluxProof,false);
assert.ok(functional.warnings.includes("BIOLOGICAL_IN_VITRO_FUNCTION_IS_NOT_FIELD_NUTRIENT_FLUX"));
assert.ok(functional.warnings.includes("BIOLOGICAL_NUTRIENT_MOBILIZATION_DOES_NOT_AUTHORIZE_FERTILIZER_REDUCTION"));

const productOnly=evaluateBiologicalFunctionalEvidence({
  role:"BIOLOGICAL_N_FIXATION",
  cropCode:"TRIGO",
  evidence:[{
    kind:"INOCULANT_PRODUCT_QUALITY",
    functionalRole:"BIOLOGICAL_N_FIXATION",
    organismOrConsortium:"Azospirillum brasilense",
    productRegistrationId:"MAPA-EXEMPLO",
    methodOrProtocol:"Controle de qualidade de inoculante",
  }],
});
assert.equal(productOnly.stage,"REGISTERED_OR_QUALITY_CONTROLLED_PRODUCT");
assert.ok(productOnly.warnings.includes("INOCULANT_PRODUCT_QUALITY_DOES_NOT_PROVE_FIELD_APPLICATION"));
assert.equal(productOnly.policy.productRegistrationIsFieldColonizationProof,false);

const applied=evaluateBiologicalFunctionalEvidence({
  role:"BIOLOGICAL_N_FIXATION",
  cropCode:"TRIGO",
  evidence:[
    {
      kind:"INOCULANT_PRODUCT_QUALITY",
      functionalRole:"BIOLOGICAL_N_FIXATION",
      organismOrConsortium:"Azospirillum brasilense",
      productRegistrationId:"MAPA-EXEMPLO",
    },
    {
      kind:"FIELD_APPLICATION_RECORD",
      functionalRole:"BIOLOGICAL_N_FIXATION",
      organismOrConsortium:"Azospirillum brasilense",
      applicationDate:"2026-06-15",
    },
  ],
});
assert.equal(applied.stage,"APPLICATION_DOCUMENTED");
assert.equal(applied.policy.applicationRecordIsAgronomicResponseProof,false);
assert.ok(applied.warnings.includes("BIOLOGICAL_APPLICATION_HAS_NO_CROP_SPECIFIC_VALIDATED_RULE"));

const validated=evaluateBiologicalFunctionalEvidence({
  role:"BIOLOGICAL_N_FIXATION",
  cropCode:"TRIGO",
  evidence:[
    {
      kind:"FIELD_APPLICATION_RECORD",
      functionalRole:"BIOLOGICAL_N_FIXATION",
      organismOrConsortium:"Azospirillum brasilense",
      applicationDate:"2026-06-15",
    },
    {
      kind:"CROP_SPECIFIC_AGRONOMIC_VALIDATION",
      functionalRole:"BIOLOGICAL_N_FIXATION",
      cropCode:"TRIGO",
      validatedAgronomicRuleId:"RULE-TRIGO-AZOSPIRILLUM-001",
      sourceTitle:"Regra técnica validada",
    },
  ],
});
assert.equal(validated.stage,"CROP_SPECIFIC_VALIDATION_PRESENT");
assert.equal(validated.counts.cropSpecificValidations,1);
assert.equal(validated.policy.automaticNutrientCreditAllowed,false);
assert.equal(validated.policy.deterministicAdjustmentRequiresSeparateValidatedRule,true);
assert.equal(validated.warnings.includes("BIOLOGICAL_N_FIXATION_DOES_NOT_AUTHORIZE_GENERIC_N_CREDIT"),false);

const wrongCropValidation=evaluateBiologicalFunctionalEvidence({
  role:"BIOLOGICAL_N_FIXATION",
  cropCode:"MILHO",
  evidence:[{
    kind:"CROP_SPECIFIC_AGRONOMIC_VALIDATION",
    functionalRole:"BIOLOGICAL_N_FIXATION",
    cropCode:"TRIGO",
    validatedAgronomicRuleId:"RULE-TRIGO-AZOSPIRILLUM-001",
  }],
});
assert.equal(wrongCropValidation.stage,"NO_EVIDENCE");
assert.equal(wrongCropValidation.counts.cropSpecificValidations,0);
assert.ok(wrongCropValidation.warnings.includes("BIOLOGICAL_N_FIXATION_DOES_NOT_AUTHORIZE_GENERIC_N_CREDIT"));

assert.throws(
  ()=>evaluateBiologicalFunctionalEvidence({
    role:"BIOLOGICAL_N_FIXATION",
    evidence:[{
      kind:"FIELD_APPLICATION_RECORD",
      functionalRole:"BIOLOGICAL_N_FIXATION",
      applicationDate:"data-invalida",
    }],
  }),
  /BIOLOGICAL_APPLICATION_DATE_INVALID/,
);

assert.throws(
  ()=>evaluateBiologicalFunctionalEvidence({
    role:"PHOSPHORUS_SOLUBILIZATION",
    evidence:[{
      kind:"CROP_SPECIFIC_AGRONOMIC_VALIDATION",
      functionalRole:"PHOSPHORUS_SOLUBILIZATION",
      cropCode:"MILHO",
    }],
  }),
  /BIOLOGICAL_VALIDATION_RULE_ID_REQUIRED/,
);

assert.equal(
  BIOLOGICAL_FUNCTIONAL_ROLE_NOTES.POTASSIUM_SOLUBILIZATION.genericNutrientCreditAllowed,
  false,
);

console.log("biological-functional-evidence: detecção, produto, aplicação e validação permanecem camadas distintas");
