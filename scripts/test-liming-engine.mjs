import assert from "node:assert/strict";
import {
  targetBaseSaturationForPh,
  estimateHAlFromSmpIndex,
  computeCtcPh7,
  computeBaseSaturationPercent,
  computeLimingDoseByBaseSaturation,
  computeLimingDoseBySmpIndex,
} from "../src/domain/liming-engine.ts";
import {
  SOYBEAN_LIMING_RULE_IDS,
  evaluateSoybeanLimingRsSc2025,
  computeSoybeanLowBufferingLiming2025,
  adjustSoybeanLimeDoseForPrnt2025,
} from "../src/domain/soybean-liming-rs-sc-2025.ts";

// 1. Correspondência pH-alvo -> V% alvo, exatamente como o manual declara.
assert.equal(targetBaseSaturationForPh("5.5"), 65);
assert.equal(targetBaseSaturationForPh("6.0"), 75);
assert.equal(targetBaseSaturationForPh("6.5"), 85);

// 2. H+Al a partir do índice SMP -- fórmula de Kaminski et al. (2001).
const hAlSmp60 = estimateHAlFromSmpIndex(6.0);
assert.ok(Math.abs(hAlSmp60 - 4.3613) < 0.001, `H+Al(SMP=6,0) esperado ~4,3613, obtido ${hAlSmp60}`);
const hAlSmp50 = estimateHAlFromSmpIndex(5.0);
assert.ok(hAlSmp50 > hAlSmp60, "SMP menor (mais ácido) deve estimar H+Al maior");

// 3. CTCpH7,0 = Ca + Mg + K + (H+Al).
const ctc = computeCtcPh7({ ca: 4.0, mg: 1.5, k: 0.3 }, hAlSmp60);
assert.ok(Math.abs(ctc - (4.0 + 1.5 + 0.3 + hAlSmp60)) < 1e-9);
assert.ok(Math.abs(ctc - 10.1613) < 0.001, `CTCpH7 esperado ~10,1613, obtido ${ctc}`);

// 4. V% = (S/CTCpH7,0) x 100, S = Ca+Mg+K.
const v = computeBaseSaturationPercent({ ca: 4.0, mg: 1.5, k: 0.3 }, ctc);
assert.ok(Math.abs(v - 57.087) < 0.01, `V% esperado ~57,09, obtido ${v}`);

// 5. NC = [(V1-V2)/100] x CTCpH7,0.
const dose1 = computeLimingDoseByBaseSaturation({ targetPh: "6.0", measuredBaseSaturationPercent: 40, ctcPh7: 12 });
assert.equal(dose1.needed, true);
if (dose1.needed) {
  assert.equal(dose1.doseTonPerHaPrnt100, 4.2);
  assert.equal(dose1.targetBaseSaturationPercent, 75);
}

// 6. Solo já acima da meta -> sem dose negativa.
const dose2 = computeLimingDoseByBaseSaturation({ targetPh: "5.5", measuredBaseSaturationPercent: 80, ctcPh7: 10 });
assert.equal(dose2.needed, false);
if (!dose2.needed) assert.match(dose2.reason, /não é indicada/);
const dose3 = computeLimingDoseByBaseSaturation({ targetPh: "6.5", measuredBaseSaturationPercent: 85, ctcPh7: 8 });
assert.equal(dose3.needed, false);

// 7. Ponta a ponta com SMP + cátions.
const hAl = estimateHAlFromSmpIndex(5.4);
const ctcReal = computeCtcPh7({ ca: 2.8, mg: 0.9, k: 0.15 }, hAl);
const vReal = computeBaseSaturationPercent({ ca: 2.8, mg: 0.9, k: 0.15 }, ctcReal);
const doseReal = computeLimingDoseByBaseSaturation({ targetPh: "6.0", measuredBaseSaturationPercent: vReal, ctcPh7: ctcReal });
assert.equal(doseReal.needed, true);
if (doseReal.needed) assert.ok(doseReal.doseTonPerHaPrnt100 > 0);

// 8. Tabela SMP auditada.
assert.equal(computeLimingDoseBySmpIndex(5.2, "6.0").doseTonPerHaPrnt100, 8.3);
assert.equal(computeLimingDoseBySmpIndex(4.4, "6.5").doseTonPerHaPrnt100, 29.0);
assert.equal(computeLimingDoseBySmpIndex(6.0, "5.5").doseTonPerHaPrnt100, 1.6);
assert.equal(computeLimingDoseBySmpIndex(3.5, "6.0").doseTonPerHaPrnt100, 21.0);
assert.equal(computeLimingDoseBySmpIndex(7.5, "6.5").doseTonPerHaPrnt100, 0);
const smpInterp = computeLimingDoseBySmpIndex(5.25, "6.0");
assert.equal(smpInterp.interpolated, true);
assert.ok(Math.abs(smpInterp.doseTonPerHaPrnt100 - 7.9) < 0.01);

// 9. Soja RS/SC 2025: sistema convencional, domínio inequívoco.
const conventional = evaluateSoybeanLimingRsSc2025({
  region: "RS",
  system: "CONVENTIONAL",
  phWater0To20: 5.2,
  baseSaturation0To20Pct: 60,
  aluminumSaturation0To20Pct: 12,
  smp0To20: 5.6,
});
assert.equal(conventional.ruleId, SOYBEAN_LIMING_RULE_IDS.conventional);
assert.equal(conventional.ruleStatus, "READY_FOR_IMPLEMENTATION");
assert.equal(conventional.decision, "APPLY");
assert.equal(conventional.recommendedDoseTonHaPrnt100, 5.4);
assert.equal(conventional.applicationMode, "INCORPORATED");

// 10. Quadrantes V/Al não resolvidos de forma inequívoca entre Tabela 2.2 e texto falham fechado.
const conventionalAmbiguous = evaluateSoybeanLimingRsSc2025({
  region: "SC",
  system: "CONVENTIONAL",
  phWater0To20: 5.2,
  baseSaturation0To20Pct: 60,
  aluminumSaturation0To20Pct: 5,
  smp0To20: 5.6,
});
assert.equal(conventionalAmbiguous.decision, "BLOCKED_SOURCE_CONFLICT");
assert.equal(conventionalAmbiguous.automaticDoseAllowed, false);

// 11. Implantação de SPD permanece direta: pH<5,5 + 1 SMP para pH 6,0 incorporado.
const establishment = evaluateSoybeanLimingRsSc2025({
  region: "RS",
  system: "NO_TILL_ESTABLISHMENT",
  phWater0To20: 5.2,
  smp0To20: 5.6,
});
assert.equal(establishment.ruleId, SOYBEAN_LIMING_RULE_IDS.noTillEstablishment);
assert.equal(establishment.decision, "APPLY");
assert.equal(establishment.recommendedDoseTonHaPrnt100, 5.4);

// 12. SPD consolidado sem restrições: edição 2025 conflita 1/2 SMP (Tabela 2.2) x 1/4 SMP (texto 2.3.3).
const consolidatedNoRestriction = evaluateSoybeanLimingRsSc2025({
  region: "RS",
  system: "NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS",
  noRestrictions10To20Confirmed: true,
  phWater0To10: 5.2,
  baseSaturation0To10Pct: 60,
  aluminumSaturation0To10Pct: 12,
  smp0To10: 5.6,
  yearsSinceLastLiming: 4,
});
assert.equal(consolidatedNoRestriction.ruleStatus, "REQUIRES_AGRONOMIST_REVIEW");
assert.equal(consolidatedNoRestriction.decision, "BLOCKED_SOURCE_CONFLICT");
assert.equal(consolidatedNoRestriction.evidenceConflict.table2_2.candidateTonHaPrnt100, 2.7);
assert.equal(consolidatedNoRestriction.evidenceConflict.section2_3_3.candidateTonHaPrnt100, 1.35);

// 13. SPD consolidado com restrições: 10-29,99% Al cai no conflito 10% (tabela) x 30% (texto).
const consolidatedThresholdConflict = evaluateSoybeanLimingRsSc2025({
  region: "SC",
  system: "NO_TILL_CONSOLIDATED_WITH_10_20_RESTRICTIONS",
  phWater10To20: 5.2,
  aluminumSaturation10To20Pct: 20,
  smp0To10: 5.6,
  smp10To20: 5.7,
  yearsSinceLastLiming: 4,
  restrictionAssessment: {
    yieldBelowLocalAverageEspeciallyInDrought: true,
    compactionRestrictsRootGrowthAtDepth: true,
    phosphorus10To20BelowCritical: true,
    agronomistConfirmedIncorporationDecision: false,
  },
});
assert.equal(consolidatedThresholdConflict.decision, "BLOCKED_SOURCE_CONFLICT");
assert.equal(consolidatedThresholdConflict.automaticDoseAllowed, false);

// 14. Quando ambos os trechos concordam (Al>=30), ainda exige decisão profissional e não vira dose automática.
const consolidatedReviewed = evaluateSoybeanLimingRsSc2025({
  region: "RS",
  system: "NO_TILL_CONSOLIDATED_WITH_10_20_RESTRICTIONS",
  phWater10To20: 5.1,
  aluminumSaturation10To20Pct: 35,
  smp0To10: 5.6,
  smp10To20: 5.7,
  yearsSinceLastLiming: 4,
  restrictionAssessment: {
    yieldBelowLocalAverageEspeciallyInDrought: true,
    compactionRestrictsRootGrowthAtDepth: true,
    phosphorus10To20BelowCritical: true,
    agronomistConfirmedIncorporationDecision: true,
  },
});
assert.equal(consolidatedReviewed.decision, "BLOCKED_PROFESSIONAL_REVIEW");
assert.equal(consolidatedReviewed.reviewedDoseCandidateTonHaPrnt100, 5.1);
assert.equal(consolidatedReviewed.automaticDoseAllowed, false);

// 15. Calagem recente em SPD consolidado bloqueia reaplicação automática por risco de SMP não detectar corretivo ainda reagindo.
const recentLiming = evaluateSoybeanLimingRsSc2025({
  region: "RS",
  system: "NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS",
  yearsSinceLastLiming: 2,
});
assert.equal(recentLiming.decision, "BLOCKED_PROFESSIONAL_REVIEW");
assert.ok(recentLiming.blockers.includes("RECENT_LIMING_CAN_MASK_SMP_RESPONSE_REVIEW_BEFORE_REAPPLICATION"));

// 16. Equação oficial para baixo tamponamento e ajuste de PRNT ficam explícitos e separados da escolha comercial.
const lowBuffer = computeSoybeanLowBufferingLiming2025({ targetPh: "6.0", organicMatterPct: 2, exchangeableAlCmolcDm3: 0.5 });
assert.equal(lowBuffer.ready, true);
assert.equal(lowBuffer.recommendedDoseTonHaPrnt100, 2.31);
assert.equal(adjustSoybeanLimeDoseForPrnt2025(5, 80), 6.25);
assert.throws(() => adjustSoybeanLimeDoseForPrnt2025(5, 0), /PRNT_INVALID/);

console.log("liming-engine: base CQFS + soja RS/SC 2025 validadas; conflitos internos da edição 2025 permanecem fail-closed");
