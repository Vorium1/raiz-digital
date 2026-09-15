import assert from "node:assert/strict";
import { evaluateAgronomicRuleAutomation } from "../src/domain/agronomic-rule-catalog.ts";
import {
  evaluateRiceDrySoilLimingSosbai2025,
  RICE_DRY_SOIL_LIMING_PROFILE,
} from "../src/domain/rice-liming-dry-soil-sosbai-2025.ts";

const catalogDecision = evaluateAgronomicRuleAutomation("CALAGEM-ARROZ-SECO-SOSBAI-2025");
assert.equal(catalogDecision.allowed, true);
assert.equal(catalogDecision.status, "READY_FOR_IMPLEMENTATION");

const baseInput = {
  profileId: RICE_DRY_SOIL_LIMING_PROFILE,
  establishmentSystem: "DRY_SOIL_SEEDING",
  sampleDepthCm: { from: 0, to: 20 },
  croppingContext: "RICE_ONLY_OR_NO_HIGHER_PH_ROTATION",
  bufferingContext: "STANDARD_SMP_APPLICABLE",
  phWater0To20: 5.2,
  baseSaturation0To20Pct: 60,
  aluminumSaturation0To20Pct: 12,
  smp0To20: 5.6,
};

// Domínio positivo explícito: pH<5,5, V<65% e Al>=10%; Tabela 4.2, pH alvo 5,5.
const standard = evaluateRiceDrySoilLimingSosbai2025(baseInput);
assert.equal(standard.decision, "APPLY");
assert.equal(standard.automaticDoseAllowed, true);
assert.equal(standard.recommendedDoseTonHaPrnt100, 3.2);
assert.equal(standard.doseMethod, "SMP_TABLE_4_2_PH_5_5");
assert.equal(standard.targetPh, 5.5);
assert.equal(standard.applicationMode, "INCORPORATED");
assert.deepEqual(standard.incorporatedDepthCm, { from: 0, to: 20 });
assert.equal(standard.referencePrntPct, 100);
assert.equal(standard.commercialPrntAdjustmentApplied, false);

// Al=10% é inclusivo no domínio positivo quando V<65%.
const alInclusive = evaluateRiceDrySoilLimingSosbai2025({
  ...baseInput,
  baseSaturation0To20Pct: 64.9,
  aluminumSaturation0To20Pct: 10,
});
assert.equal(alInclusive.decision, "APPLY");
assert.equal(alInclusive.recommendedDoseTonHaPrnt100, 3.2);

// Critério principal: pH=5,5 já não entra na regra de correção por pH<5,5.
const phBoundary = evaluateRiceDrySoilLimingSosbai2025({
  ...baseInput,
  phWater0To20: 5.5,
});
assert.equal(phBoundary.decision, "DO_NOT_APPLY");
assert.equal(phBoundary.recommendedDoseTonHaPrnt100, 0);

// Domínio negativo explícito da nota da Tabela 4.1.
const explicitNoApply = evaluateRiceDrySoilLimingSosbai2025({
  ...baseInput,
  baseSaturation0To20Pct: 65,
  aluminumSaturation0To20Pct: 9.9,
});
assert.equal(explicitNoApply.decision, "DO_NOT_APPLY");
assert.equal(explicitNoApply.recommendedDoseTonHaPrnt100, 0);
assert.ok(explicitNoApply.warnings.includes("SOSBAI_2025_TABLE_4_1_EXPLICIT_V_AL_NO_APPLY_DOMAIN"));

// Quadrante misto V alto + Al alto: fonte não autoriza decisão automática.
const mixedHighHigh = evaluateRiceDrySoilLimingSosbai2025({
  ...baseInput,
  baseSaturation0To20Pct: 65,
  aluminumSaturation0To20Pct: 10,
});
assert.equal(mixedHighHigh.decision, "BLOCKED_SOURCE_DOMAIN");
assert.equal(mixedHighHigh.automaticDoseAllowed, false);
assert.equal(mixedHighHigh.recommendedDoseTonHaPrnt100, null);
assert.ok(mixedHighHigh.blockers.includes("V_AL_COMBINATION_NOT_EXPLICITLY_AUTHORIZED_BY_SOURCE"));

// Quadrante misto V baixo + Al baixo também permanece fail-closed.
const mixedLowLow = evaluateRiceDrySoilLimingSosbai2025({
  ...baseInput,
  baseSaturation0To20Pct: 60,
  aluminumSaturation0To20Pct: 9.9,
});
assert.equal(mixedLowLow.decision, "BLOCKED_SOURCE_DOMAIN");
assert.equal(mixedLowLow.recommendedDoseTonHaPrnt100, null);

// Interpolação entre pontos da Tabela 4.2 é explicitamente marcada.
const interpolated = evaluateRiceDrySoilLimingSosbai2025({
  ...baseInput,
  smp0To20: 5.65,
});
assert.equal(interpolated.decision, "APPLY");
assert.equal(interpolated.interpolated, true);
assert.equal(interpolated.recommendedDoseTonHaPrnt100, 3);

// Baixo tamponamento confirmado usa a equação específica SOSBAI para pH 5,5.
const lowBuffer = evaluateRiceDrySoilLimingSosbai2025({
  ...baseInput,
  bufferingContext: "LOW_BUFFERING_CONFIRMED",
  smp0To20: 6.5,
  organicMatterPct: 2,
  exchangeableAlCmolcPerDm3: 0.5,
});
assert.equal(lowBuffer.decision, "APPLY");
assert.equal(lowBuffer.doseMethod, "LOW_BUFFERING_POLYNOMIAL_PH_5_5");
assert.equal(lowBuffer.recommendedDoseTonHaPrnt100, 1.28);
assert.ok(lowBuffer.warnings.includes("LOW_BUFFERING_METHOD_EXPLICITLY_CONFIRMED"));

const lowBufferMissingInputs = evaluateRiceDrySoilLimingSosbai2025({
  ...baseInput,
  bufferingContext: "LOW_BUFFERING_CONFIRMED",
  organicMatterPct: null,
  exchangeableAlCmolcPerDm3: null,
});
assert.equal(lowBufferMissingInputs.decision, "BLOCKED_PROFESSIONAL_REVIEW");
assert.ok(lowBufferMissingInputs.blockers.includes("LOW_BUFFERING_FORMULA_REQUIRES_OM_AND_EXCHANGEABLE_AL"));

// O motor não escolhe sozinho entre tabela SMP e equação de baixo tamponamento.
const unknownBuffering = evaluateRiceDrySoilLimingSosbai2025({
  ...baseInput,
  bufferingContext: "UNKNOWN",
});
assert.equal(unknownBuffering.decision, "BLOCKED_PROFESSIONAL_REVIEW");
assert.ok(unknownBuffering.blockers.includes("BUFFERING_CONTEXT_REQUIRED_TO_SELECT_SOSBAI_DOSE_METHOD"));

// Em rotação/sucessão com culturas de sequeiro a própria fonte muda o alvo para pH 6,0.
const rotation = evaluateRiceDrySoilLimingSosbai2025({
  ...baseInput,
  croppingContext: "ROTATION_WITH_UPLAND_CROPS",
});
assert.equal(rotation.decision, "BLOCKED_PROFESSIONAL_REVIEW");
assert.ok(rotation.blockers.includes("ROTATION_TARGET_PH_6_REQUIRES_SEPARATE_RULE"));
assert.equal(rotation.recommendedDoseTonHaPrnt100, null);

const unknownCropContext = evaluateRiceDrySoilLimingSosbai2025({
  ...baseInput,
  croppingContext: "UNKNOWN",
});
assert.equal(unknownCropContext.decision, "BLOCKED_PROFESSIONAL_REVIEW");
assert.ok(unknownCropContext.blockers.includes("CROPPING_CONTEXT_REQUIRED"));

// SMP zero em domínio positivo é uma inconsistência e não vira dose zero silenciosa.
const zeroSmpConflict = evaluateRiceDrySoilLimingSosbai2025({
  ...baseInput,
  smp0To20: 6.7,
});
assert.equal(zeroSmpConflict.decision, "BLOCKED_PROFESSIONAL_REVIEW");
assert.ok(zeroSmpConflict.blockers.includes("SMP_TABLE_ZERO_CONFLICTS_WITH_POSITIVE_ACIDITY_DOMAIN"));

assert.throws(() => evaluateRiceDrySoilLimingSosbai2025({
  ...baseInput,
  sampleDepthCm: { from: 0, to: 10 },
}), /0-20 cm/);

assert.throws(() => evaluateRiceDrySoilLimingSosbai2025({
  ...baseInput,
  baseSaturation0To20Pct: 101,
}), /Saturação por bases/);

console.log("rice-liming-dry-soil-sosbai-2025: domínio V/Al, SMP pH5,5, baixo tamponamento, rotação e fail-closed validados");
