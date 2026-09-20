import assert from "node:assert/strict";
import {
  AGRONOMIC_RULES,
  SOURCE_LEDGER,
  RESEARCH_SNAPSHOT_ID,
  CROSSCHECK_SNAPSHOT_ID,
  evaluateAgronomicRuleAutomation,
  buildRuleTrace,
  resolveAgronomicExecutionStatus,
} from "../src/domain/agronomic-rule-catalog.ts";
import {
  computeRiceContinuousNitrogen,
  computeRiceContinuousPhosphorus,
  computeRiceIronToxicityRisk,
  classifyMicronutrientCqfs2016,
  computeSpatialValidationMetrics,
  buildMapDapAcidityLedger,
  RESEARCH_READY_PROFILES,
} from "../src/domain/research-ready-rules.ts";
import { computeRiceContinuousPotassium } from "../src/domain/rice-potassium-sosbai-2025.ts";

assert.ok(AGRONOMIC_RULES.length >= 30);
assert.equal(new Set(AGRONOMIC_RULES.map((rule) => rule.ruleId)).size, AGRONOMIC_RULES.length);
assert.ok(Object.values(SOURCE_LEDGER).every((source) => /^[a-f0-9]{64}$/.test(source.sha256) && source.bytes > 0));
assert.ok(AGRONOMIC_RULES.every((rule) => [RESEARCH_SNAPSHOT_ID, CROSSCHECK_SNAPSHOT_ID].includes(rule.sourceSnapshotId)));

for (const ruleId of [
  "PK-SOJA-CQFS-2016",
  "PK-MILHO-CQFS-2016",
  "PK-TRIGO-CQFS-2016",
  "N-MILHO-CQFS-2016",
  "N-TRIGO-EMBRAPA-2026",
  "N-CANOLA-CQFS-2016",
  "N-GRAMINEA-INVERNO-CQFS-2016",
  "N-ARROZ-CONTINUO-SOSBAI-2025",
  "P-ARROZ-CONTINUO-SOSBAI-2025",
  "K-ARROZ-CONTINUO-SOSBAI-2025",
  "S-ARROZ-SOSBAI-2025",
  "FE-ARROZ-RISCO-SOSBAI-2025",
  "LIMING-SOYBEAN-RS-SC-2025-CONVENTIONAL",
  "LIMING-SOYBEAN-RS-SC-2025-NO-TILL-ESTABLISHMENT",
  "LIMING-SOYBEAN-RS-SC-2025-NO-TILL-CONSOLIDATED",
  "CALAGEM-ARROZ-SECO-SOSBAI-2025",
  "MICRO-CLASS-CQFS-2016",
  "LIME-PRNT",
  "PRODUCT-MASS-ALGEBRA",
  "SPATIAL-SUPPORT-MASK",
  "SPATIAL-VALIDATION-METRICS",
  "VRA-MASS-TOTAL",
  "MAP-DAP-ACID-LEDGER-UNL-2009",
]) {
  const decision = evaluateAgronomicRuleAutomation(ruleId);
  assert.equal(decision.allowed, true, `${ruleId} deveria estar liberada para execução determinística delimitada`);
  assert.equal(decision.status, "READY_FOR_IMPLEMENTATION");
}

for (const ruleId of [
  "N-ARROZ-SOSBAI-2025",
  "MO-SOJA-CQFS-2016",
  "MO-SOJA-EMBRAPA-2020",
  "GESSO-CERRADO-EMBRAPA-2005",
  "GYPSUM-SUBSOIL-DIAGNOSTIC-2018",
  "VRA-SUPPORT-GATE",
  "N-TRIGO-QUALIDADE-EMBRAPA-2026",
]) {
  const decision = evaluateAgronomicRuleAutomation(ruleId);
  assert.equal(decision.allowed, false, `${ruleId} exige revisão profissional`);
  assert.equal(decision.status, "REQUIRES_AGRONOMIST_REVIEW");
}

for (const ruleId of ["CARINATA-RS-SC-NUTRITION", "MICRONUTRIENT-GENERIC-RS-SC", "GYPSUM-RS-SC-AUTOMATIC"]) {
  const decision = evaluateAgronomicRuleAutomation(ruleId);
  assert.equal(decision.allowed, false);
  assert.equal(decision.status, "INSUFFICIENT_EVIDENCE");
}

const unknown = evaluateAgronomicRuleAutomation("DOSE-INVENTADA");
assert.equal(unknown.allowed, false);
assert.equal(unknown.status, "UNKNOWN_RULE");

const trace = buildRuleTrace("N-TRIGO-EMBRAPA-2026");
assert.deepEqual(trace, {
  ruleId: "N-TRIGO-EMBRAPA-2026",
  ruleVersion: "1.0.0",
  sourceSnapshotId: RESEARCH_SNAPSHOT_ID,
  sourceTitle: "Informações técnicas para trigo e triticale, safra 2026",
  sourceInstitution: "Embrapa Trigo",
  sourceYear: 2026,
  sourceLocator: "Tabela 3, pp.29-33",
  executionStatus: "READY_FOR_IMPLEMENTATION",
});

const riceTrace = buildRuleTrace("N-ARROZ-CONTINUO-SOSBAI-2025");
assert.equal(riceTrace.ruleVersion, "1.1.0");
assert.equal(riceTrace.sourceSnapshotId, CROSSCHECK_SNAPSHOT_ID);
assert.equal(riceTrace.sourceInstitution, "SOSBAI");
assert.equal(riceTrace.executionStatus, "READY_FOR_IMPLEMENTATION");

const soybeanConsolidatedLimeTrace = buildRuleTrace("LIMING-SOYBEAN-RS-SC-2025-NO-TILL-CONSOLIDATED");
assert.equal(soybeanConsolidatedLimeTrace.executionStatus, "READY_FOR_IMPLEMENTATION");
assert.match(soybeanConsolidatedLimeTrace.sourceLocator, /1\/2 SMP/);
assert.match(soybeanConsolidatedLimeTrace.sourceLocator, /Al>=10%/);

const dryRiceLimeTrace = buildRuleTrace("CALAGEM-ARROZ-SECO-SOSBAI-2025");
assert.equal(dryRiceLimeTrace.ruleVersion, "1.1.0");
assert.equal(dryRiceLimeTrace.sourceSnapshotId, CROSSCHECK_SNAPSHOT_ID);
assert.equal(dryRiceLimeTrace.sourceInstitution, "SOSBAI");
assert.equal(dryRiceLimeTrace.executionStatus, "READY_FOR_IMPLEMENTATION");
assert.match(dryRiceLimeTrace.sourceLocator, /quadrantes mistos/);

const pkTrace = buildRuleTrace("PK-SOJA-CQFS-2016");
assert.equal(pkTrace.sourceInstitution, "CQFS-RS/SC");
assert.equal(pkTrace.sourceYear, 2016);
assert.equal(pkTrace.sourceLocator, "Tabela 6.1.2 p.106; item 6.1.18 p.130");
assert.equal(pkTrace.executionStatus, "READY_FOR_IMPLEMENTATION");

assert.equal(
  resolveAgronomicExecutionStatus("N-MILHO-CQFS-2016", "REQUIRES_AGRONOMIST_REVIEW"),
  "REQUIRES_AGRONOMIST_REVIEW",
);
assert.equal(
  resolveAgronomicExecutionStatus("VRA-SUPPORT-GATE", "READY_FOR_IMPLEMENTATION"),
  "REQUIRES_AGRONOMIST_REVIEW",
);
assert.equal(
  resolveAgronomicExecutionStatus("CARINATA-RS-SC-NUTRITION", "READY_FOR_IMPLEMENTATION"),
  "INSUFFICIENT_EVIDENCE",
);

// Arroz: SOSBAI 2025 versionada, sem misturar automaticamente CQFS/SOSBAI.
const riceN = computeRiceContinuousNitrogen({
  profileId: RESEARCH_READY_PROFILES.rice,
  organicMatterPct: 2.5,
  responseClass: "MEDIA",
  responseClassApproved: true,
});
assert.deepEqual(riceN.dose, { kind: "EXACT", kgPerHa: 110 });
assert.equal(riceN.parcelingAutomated, false);

const riceNUpper = computeRiceContinuousNitrogen({
  profileId: RESEARCH_READY_PROFILES.rice,
  organicMatterPct: 5.1,
  responseClass: "MUITO_ALTA",
  responseClassApproved: true,
});
assert.deepEqual(riceNUpper.dose, { kind: "UPPER_BOUND", maxKgPerHa: 135 });
assert.throws(() => computeRiceContinuousNitrogen({
  profileId: RESEARCH_READY_PROFILES.rice,
  organicMatterPct: 2.55,
  responseClass: "ALTA",
  responseClassApproved: true,
}), /lacuna de precisão/);
assert.throws(() => computeRiceContinuousNitrogen({
  profileId: RESEARCH_READY_PROFILES.rice,
  organicMatterPct: 3,
  responseClass: "ALTA",
  responseClassApproved: false,
}), /explicitamente validada/);

const riceP = computeRiceContinuousPhosphorus({
  profileId: RESEARCH_READY_PROFILES.rice,
  phosphorusClass: "BAIXO",
  classificationProfileId: RESEARCH_READY_PROFILES.rice,
  responseClass: "ALTA",
  responseClassApproved: true,
});
assert.deepEqual(riceP.dose, { kind: "EXACT", kgPerHa: 75 });
const ricePUpper = computeRiceContinuousPhosphorus({
  profileId: RESEARCH_READY_PROFILES.rice,
  phosphorusClass: "MUITO_ALTO",
  classificationProfileId: RESEARCH_READY_PROFILES.rice,
  responseClass: "MEDIA",
  responseClassApproved: true,
});
assert.deepEqual(ricePUpper.dose, { kind: "UPPER_BOUND", maxKgPerHa: 40 });

const riceK = computeRiceContinuousPotassium({
  profileId: RESEARCH_READY_PROFILES.rice,
  potassiumClass: "BAIXO",
  classificationProfileId: RESEARCH_READY_PROFILES.rice,
  potassiumMethod: "MEHLICH_1",
  responseClass: "ALTA",
  responseClassApproved: true,
  ctcPh7CmolcPerDm3: 16,
  ctcUnit: "cmolc/dm3",
});
assert.deepEqual(riceK.baseDose, { kind: "EXACT", kgPerHa: 100 });
assert.deepEqual(riceK.dose, { kind: "EXACT", kgPerHa: 120 });
assert.equal(riceK.ctcAdjustmentKgPerHa, 20);
assert.equal(riceK.splitApplicationAutomated, false);

const feRisk = computeRiceIronToxicityRisk({
  feOxalateGPerDm3: 1,
  ctcPh7CmolcPerDm3: 10,
  extractionMethod: "AMMONIUM_OXALATE_0_2M_PH6",
});
assert.equal(feRisk.estimatedFeCmolcPerDm3, 4.12);
assert.equal(feRisk.psFePct, 41.2);
assert.equal(feRisk.riskClass, "ALTO");
assert.equal(feRisk.managementRecommendation, null);

// Micronutrientes: classificação é permitida; dose continua nula.
const zinc = classifyMicronutrientCqfs2016({
  crop: "MILHO",
  nutrient: "ZN",
  valueMgPerDm3: 0.3,
  method: "MEHLICH_1",
  unit: "mg/dm3",
  depthProtocolValidated: true,
});
assert.equal(zinc.classification, "MEDIO");
assert.equal(zinc.doseKgPerHa, null);
const boronGap = classifyMicronutrientCqfs2016({
  crop: "CANOLA",
  nutrient: "B",
  valueMgPerDm3: 0.15,
  method: "HOT_WATER",
  unit: "mg/dm3",
  depthProtocolValidated: true,
});
assert.equal(boronGap.classification, "INDETERMINATE");
assert.throws(() => classifyMicronutrientCqfs2016({
  crop: "SOJA",
  nutrient: "MN",
  valueMgPerDm3: 3,
  method: "MEHLICH_1",
  unit: "mg/dm3",
  depthProtocolValidated: true,
}), /Método incompatível/);

// Métricas espaciais são calculáveis; a pesquisa não fornece threshold universal de aprovação.
const spatialMetrics = computeSpatialValidationMetrics({ observed: [1, 2, 3], predicted: [2, 2, 1] });
assert.equal(spatialMetrics.rmse, 1.291);
assert.equal(spatialMetrics.mae, 1);
assert.equal(spatialMetrics.me, -0.3333);
assert.equal(spatialMetrics.passes, null);
assert.equal(spatialMetrics.meSignConvention, "PREDICTED_MINUS_OBSERVED");

// MAP x DAP: resolve a aparente contradição por denominador, sem gerar calcário adicional.
const mapLedger = buildMapDapAcidityLedger({ product: "MAP_10_52_0", productMassKg: 100 });
const dapLedger = buildMapDapAcidityLedger({ product: "DAP_18_46_0", productMassKg: 100 });
assert.equal(mapLedger.sourceFactorKgCaCO3EqPerKgN, 5.4);
assert.equal(dapLedger.sourceFactorKgCaCO3EqPerKgN, 3.6);
assert.ok(mapLedger.sourceFactorKgCaCO3EqPerKgN > dapLedger.sourceFactorKgCaCO3EqPerKgN, "MAP é maior por kg N na tabela UNL usada");
assert.ok(dapLedger.kgCaCO3EqPerKgProduct > mapLedger.kgCaCO3EqPerKgProduct, "DAP 18-46-0 é maior por kg de produto nessa normalização");
assert.equal(mapLedger.automaticLimeAdjustmentAllowed, false);
assert.equal(dapLedger.automaticLimeAdjustmentAllowed, false);

console.log("agronomic-rule-catalog: arroz N/P/K/S/Fe e calagem seca delimitada, micros, métricas e ledger liberados apenas no escopo fechado; Mo/gesso/carinata/trigo qualidade/VRA final permanecem fail-closed");
