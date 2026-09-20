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

// 9. Soja RS/SC 2025: sistema convencional, domínio positivo explicitamente autorizado.
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

// 10. A Tabela 2.2 usa pH<5,5 como gatilho e define uma única exceção negativa:
 // não aplicar quando V>=65% E saturação por Al<10%.
const conventionalLowAlButLowV = evaluateSoybeanLimingRsSc2025({
  region: "SC",
  system: "CONVENTIONAL",
  phWater0To20: 5.2,
  baseSaturation0To20Pct: 60,
  aluminumSaturation0To20Pct: 5,
  smp0To20: 5.6,
});
assert.equal(conventionalLowAlButLowV.decision, "APPLY");
assert.equal(conventionalLowAlButLowV.recommendedDoseTonHaPrnt100, 5.4);

// 10a. Fronteiras: somente V>=65 E Al<10 desliga a calagem quando pH<5,5.
const conventionalPositiveBoundary = evaluateSoybeanLimingRsSc2025({
  region: "RS",
  system: "CONVENTIONAL",
  phWater0To20: 5.2,
  baseSaturation0To20Pct: 64.9,
  aluminumSaturation0To20Pct: 10.1,
  smp0To20: 5.6,
});
assert.equal(conventionalPositiveBoundary.decision, "APPLY");

const conventionalNegativeBoundary = evaluateSoybeanLimingRsSc2025({
  region: "RS",
  system: "CONVENTIONAL",
  phWater0To20: 5.2,
  baseSaturation0To20Pct: 65,
  aluminumSaturation0To20Pct: 9.9,
  smp0To20: 5.6,
});
assert.equal(conventionalNegativeBoundary.decision, "DO_NOT_APPLY");

const conventionalMixedHighV = evaluateSoybeanLimingRsSc2025({
  region: "RS",
  system: "CONVENTIONAL",
  phWater0To20: 5.2,
  baseSaturation0To20Pct: 65,
  aluminumSaturation0To20Pct: 10.1,
  smp0To20: 5.6,
});
assert.equal(conventionalMixedHighV.decision, "APPLY");

const conventionalAlExact10 = evaluateSoybeanLimingRsSc2025({
  region: "RS",
  system: "CONVENTIONAL",
  phWater0To20: 5.2,
  baseSaturation0To20Pct: 64.9,
  aluminumSaturation0To20Pct: 10,
  smp0To20: 5.6,
});
assert.equal(conventionalAlExact10.decision, "APPLY");

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

// 12. Ata oficial 44ª RPSRS resolve SPD consolidado sem restrições em 1/2 SMP para pH 6,0.
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
assert.equal(consolidatedNoRestriction.ruleStatus, "READY_FOR_IMPLEMENTATION");
assert.equal(consolidatedNoRestriction.decision, "APPLY");
assert.equal(consolidatedNoRestriction.automaticDoseAllowed, true);
assert.equal(consolidatedNoRestriction.rawSmpDoseTonHaPrnt100, 5.4);
assert.equal(consolidatedNoRestriction.recommendedDoseTonHaPrnt100, 2.7);
assert.equal(consolidatedNoRestriction.applicationMode, "SURFACE");
assert.equal(consolidatedNoRestriction.surfaceCapApplied, false);
assert.ok(consolidatedNoRestriction.warnings.includes("OFFICIAL_44_RPSRS_MINUTES_RESOLVE_HALF_SMP_FOR_CONSOLIDATED_NO_RESTRICTIONS"));

// 13. O teto oficial de 5 t/ha PRNT100 é aplicado após a fração de 1/2 SMP.
const consolidatedSurfaceCap = evaluateSoybeanLimingRsSc2025({
  region: "RS",
  system: "NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS",
  noRestrictions10To20Confirmed: true,
  phWater0To10: 5.0,
  baseSaturation0To10Pct: 55,
  aluminumSaturation0To10Pct: 15,
  smp0To10: 4.8,
  yearsSinceLastLiming: 4,
});
assert.equal(consolidatedSurfaceCap.decision, "APPLY");
assert.equal(consolidatedSurfaceCap.rawSmpDoseTonHaPrnt100, 11.9);
assert.equal(consolidatedSurfaceCap.recommendedDoseTonHaPrnt100, 5);
assert.equal(consolidatedSurfaceCap.surfaceCapApplied, true);
assert.ok(consolidatedSurfaceCap.warnings.includes("SURFACE_APPLICATION_CAPPED_AT_5_T_HA_PRNT100"));

// 14. No SPD consolidado sem restrições, a exceção negativa continua sendo somente V>=65 E Al<10.
// V alto com Al>=10 permanece no domínio de aplicação quando pH<5,5.
const consolidatedHighVHighAl = evaluateSoybeanLimingRsSc2025({
  region: "RS",
  system: "NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS",
  noRestrictions10To20Confirmed: true,
  phWater0To10: 5.2,
  baseSaturation0To10Pct: 70,
  aluminumSaturation0To10Pct: 12,
  smp0To10: 5.6,
  yearsSinceLastLiming: 4,
});
assert.equal(consolidatedHighVHighAl.decision, "APPLY");
assert.equal(consolidatedHighVHighAl.automaticDoseAllowed, true);
assert.equal(consolidatedHighVHighAl.recommendedDoseTonHaPrnt100, 2.7);

// 15. Ata oficial resolve Al>=10%; entre 10 e 30% não há mais conflito de fonte, mas incorporação exige decisão agronômica.
const consolidatedNeedsReview = evaluateSoybeanLimingRsSc2025({
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
assert.equal(consolidatedNeedsReview.ruleStatus, "REQUIRES_AGRONOMIST_REVIEW");
assert.equal(consolidatedNeedsReview.decision, "BLOCKED_PROFESSIONAL_REVIEW");
assert.equal(consolidatedNeedsReview.automaticDoseAllowed, false);
assert.ok(!consolidatedNeedsReview.blockers.some((blocker) => blocker.includes("SOURCE_CONFLICT_AL_THRESHOLD")));

// 16. O limiar Al=10% é inclusivo no ramo específico com restrições; com decisão profissional confirmada, dose usa SMP médio.
const consolidatedReviewed = evaluateSoybeanLimingRsSc2025({
  region: "RS",
  system: "NO_TILL_CONSOLIDATED_WITH_10_20_RESTRICTIONS",
  phWater10To20: 5.1,
  aluminumSaturation10To20Pct: 10,
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
assert.equal(consolidatedReviewed.ruleStatus, "REQUIRES_AGRONOMIST_REVIEW");
assert.equal(consolidatedReviewed.decision, "APPLY");
assert.equal(consolidatedReviewed.automaticDoseAllowed, true);
assert.equal(consolidatedReviewed.recommendedDoseTonHaPrnt100, 5.1);
assert.equal(consolidatedReviewed.reviewedSmpMean, 5.65);
assert.equal(consolidatedReviewed.applicationMode, "INCORPORATED");
assert.deepEqual(consolidatedReviewed.incorporatedDepthCm, { from: 0, to: 20 });

// 17. Limites de decisão do ramo com restrições permanecem literais: pH=5,5 ou Al<10 -> não aplicar por essa regra.
const consolidatedPhBoundary = evaluateSoybeanLimingRsSc2025({
  region: "RS",
  system: "NO_TILL_CONSOLIDATED_WITH_10_20_RESTRICTIONS",
  phWater10To20: 5.5,
  aluminumSaturation10To20Pct: 20,
  smp0To10: 5.6,
  smp10To20: 5.7,
  restrictionAssessment: {
    yieldBelowLocalAverageEspeciallyInDrought: true,
    compactionRestrictsRootGrowthAtDepth: true,
    phosphorus10To20BelowCritical: true,
    agronomistConfirmedIncorporationDecision: true,
  },
});
assert.equal(consolidatedPhBoundary.decision, "DO_NOT_APPLY");
const consolidatedAlBoundary = evaluateSoybeanLimingRsSc2025({
  region: "RS",
  system: "NO_TILL_CONSOLIDATED_WITH_10_20_RESTRICTIONS",
  phWater10To20: 5.2,
  aluminumSaturation10To20Pct: 9.9,
  smp0To10: 5.6,
  smp10To20: 5.7,
  restrictionAssessment: {
    yieldBelowLocalAverageEspeciallyInDrought: true,
    compactionRestrictsRootGrowthAtDepth: true,
    phosphorus10To20BelowCritical: true,
    agronomistConfirmedIncorporationDecision: true,
  },
});
assert.equal(consolidatedAlBoundary.decision, "DO_NOT_APPLY");

// 18. Calagem recente em SPD consolidado bloqueia reaplicação automática por risco de SMP não detectar corretivo ainda reagindo.
const recentLiming = evaluateSoybeanLimingRsSc2025({
  region: "RS",
  system: "NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS",
  yearsSinceLastLiming: 2,
});
assert.equal(recentLiming.decision, "BLOCKED_PROFESSIONAL_REVIEW");
assert.ok(recentLiming.blockers.includes("RECENT_LIMING_CAN_MASK_SMP_RESPONSE_REVIEW_BEFORE_REAPPLICATION"));

// 19. Equação oficial para baixo tamponamento e ajuste de PRNT ficam explícitos e separados da escolha comercial.
const lowBuffer = computeSoybeanLowBufferingLiming2025({ targetPh: "6.0", organicMatterPct: 2, exchangeableAlCmolcDm3: 0.5 });
assert.equal(lowBuffer.ready, true);
assert.equal(lowBuffer.recommendedDoseTonHaPrnt100, 2.31);
assert.equal(adjustSoybeanLimeDoseForPrnt2025(5, 80), 6.25);
assert.throws(() => adjustSoybeanLimeDoseForPrnt2025(5, 0), /PRNT_INVALID/);

console.log("liming-engine: base CQFS + soja RS/SC 2025 validadas; C1/C2 resolvidos e C3 tratado como lacuna de domínio fail-closed");
