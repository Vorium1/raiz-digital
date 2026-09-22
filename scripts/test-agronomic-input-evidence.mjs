import assert from "node:assert/strict";
import { evaluateAgronomicInputEvidence } from "../src/domain/agronomic-input-evidence.ts";

const mineral = evaluateAgronomicInputEvidence({
  code: "MAP",
  name: "MAP",
  inputClass: "MINERAL_FERTILIZER",
  mechanisms: ["DIRECT_NUTRIENT_SUPPLY"],
  guaranteesPercent: { N: 11, P2O5: 52 },
  mapaRegistration: "REG-TEST",
  evidence: [
    { id: "label-map", kind: "PRODUCT_LABEL_OR_GUARANTEE", institution: "TEST", title: "Garantia MAP" },
  ],
}, { cropCode: "SOJA", regionCode: "RS" });

assert.equal(mineral.comparisonPolicy.higherNpkDoesNotProveHigherAgronomicEfficiency, true);
assert.equal(mineral.comparisonPolicy.neutralAcrossInputClasses, true);
assert.equal(mineral.quantitativePolicy.automaticNutrientCreditAllowed, false);

const organomineral = evaluateAgronomicInputEvidence({
  code: "ORG-MIN-01",
  name: "Organomineral validado",
  inputClass: "ORGANOMINERAL_FERTILIZER",
  mechanisms: ["DIRECT_NUTRIENT_SUPPLY", "ORGANIC_COMPLEXATION", "SLOW_OR_CONTROLLED_RELEASE"],
  guaranteesPercent: { P2O5: 20, K2O: 10 },
  organicMatterPercent: 18,
  mapaRegistration: "REG-ORG-01",
  evidence: [
    { id: "label-org", kind: "PRODUCT_LABEL_OR_GUARANTEE", institution: "TEST", title: "Garantias" },
    { id: "field-org", kind: "PEER_REVIEWED_FIELD_TRIAL", institution: "Embrapa", title: "Ensaio de campo" },
    { id: "multi-org", kind: "MULTI_SITE_FIELD_VALIDATION", institution: "Embrapa", title: "Validação multiambiente" },
  ],
}, { cropCode: "MILHO", regionCode: "RS" });

assert.equal(organomineral.evidenceStrength, "STRONG");
assert.equal(organomineral.comparisonPolicy.lowerNpkCanOutperformHigherNpkWhenFieldEvidenceSupportsIt, true);
assert.equal(organomineral.quantitativePolicy.automaticDoseReplacementAllowed, false);

// Mesmo com mecanismo biológico conhecido, sem regra quantitativa específica não há crédito automático.
const biologicalNoRule = evaluateAgronomicInputEvidence({
  code: "P-SOL",
  name: "Inoculante solubilizador de P",
  inputClass: "INOCULANT",
  mechanisms: ["PHOSPHORUS_SOLUBILIZATION", "ROOT_GROWTH_PROMOTION"],
  mapaRegistration: "REG-BIO-01",
  evidence: [
    { id: "reg-bio", kind: "MAPA_REGISTRATION", institution: "MAPA", title: "Registro" },
    { id: "field-bio", kind: "MULTI_SITE_FIELD_VALIDATION", institution: "Embrapa", title: "Validação de campo" },
  ],
}, { cropCode: "SOJA", regionCode: "RS" });

assert.equal(biologicalNoRule.quantitativePolicy.automaticNutrientCreditAllowed, false);
assert.ok(biologicalNoRule.warnings.includes("BIOLOGICAL_MECHANISM_DOES_NOT_CREATE_AUTOMATIC_NUTRIENT_CREDIT"));

// Uma redução/crédito quantitativo só é permitida se a regra é explicitamente validada para cultura/região
// e referencia evidências cadastradas.
const biologicalWithRule = evaluateAgronomicInputEvidence({
  code: "P-SOL-RULED",
  name: "Inoculante com regra quantitativa homologada",
  inputClass: "INOCULANT",
  mechanisms: ["PHOSPHORUS_SOLUBILIZATION"],
  mapaRegistration: "REG-BIO-02",
  evidence: [
    { id: "field-rule", kind: "MULTI_SITE_FIELD_VALIDATION", institution: "TEST", title: "Validação multiambiente" },
    { id: "protocol-rule", kind: "OFFICIAL_EFFICACY_PROTOCOL", institution: "TEST", title: "Protocolo oficial" },
  ],
  validatedQuantitativeEffects: [
    {
      ruleId: "TEST-P-CREDIT-SOJA-RS",
      cropCodes: ["SOJA"],
      regionCodes: ["RS"],
      mechanism: "PHOSPHORUS_SOLUBILIZATION",
      nutrient: "P2O5",
      effect: { kind: "NUTRIENT_CREDIT_KG_HA", kgPerHa: 10 },
      sourceEvidenceIds: ["field-rule", "protocol-rule"],
      professionalApprovalRequired: true,
    },
  ],
}, { cropCode: "SOJA", regionCode: "RS" });

assert.equal(biologicalWithRule.quantitativePolicy.automaticNutrientCreditAllowed, true);
assert.equal(biologicalWithRule.quantitativePolicy.applicableRules.length, 1);

const sameProductWrongRegion = evaluateAgronomicInputEvidence({
  code: "P-SOL-RULED",
  name: "Inoculante com regra quantitativa homologada",
  inputClass: "INOCULANT",
  mechanisms: ["PHOSPHORUS_SOLUBILIZATION"],
  evidence: [
    { id: "field-rule", kind: "MULTI_SITE_FIELD_VALIDATION", institution: "TEST", title: "Validação multiambiente" },
    { id: "protocol-rule", kind: "OFFICIAL_EFFICACY_PROTOCOL", institution: "TEST", title: "Protocolo oficial" },
  ],
  validatedQuantitativeEffects: [
    {
      ruleId: "TEST-P-CREDIT-SOJA-RS",
      cropCodes: ["SOJA"],
      regionCodes: ["RS"],
      mechanism: "PHOSPHORUS_SOLUBILIZATION",
      nutrient: "P2O5",
      effect: { kind: "NUTRIENT_CREDIT_KG_HA", kgPerHa: 10 },
      sourceEvidenceIds: ["field-rule", "protocol-rule"],
    },
  ],
}, { cropCode: "SOJA", regionCode: "SC" });

assert.equal(sameProductWrongRegion.quantitativePolicy.automaticNutrientCreditAllowed, false);

// Alegação do fabricante pode existir como evidência documental, mas não recebe peso de validação independente.
const manufacturerClaim = evaluateAgronomicInputEvidence({
  code: "TECH-CLAIM",
  name: "Tecnologia declarada",
  inputClass: "BIOFERTILIZER",
  mechanisms: ["MICROBIAL_ACTIVITY_SUPPORT"],
  evidence: [
    { id: "claim", kind: "MANUFACTURER_CLAIM", institution: "Fabricante", title: "Material comercial" },
  ],
}, { cropCode: "SOJA", regionCode: "RS" });

assert.equal(manufacturerClaim.evidenceStrength, "DECLARATIVE_ONLY");
assert.ok(manufacturerClaim.warnings.includes("MANUFACTURER_CLAIM_IS_NOT_INDEPENDENT_FIELD_VALIDATION"));

console.log("agronomic-input-evidence: classe neutra, eficiência por evidência e firewall de equivalência validados");
