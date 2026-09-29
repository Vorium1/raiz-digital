import assert from "node:assert/strict";
import { buildFertilityCyclePlan } from "../src/domain/fertility-cycle-plan.ts";
import { buildReportFertilityHorizon } from "../src/domain/report-fertility-horizon.ts";
import { buildSoilComplementActions } from "../src/domain/soil-complement-actions.ts";
import { computeDeterministicPkDose, computeDeterministicPkPointDoseEnvelope } from "../src/domain/uniform-pk-readiness.ts";
import {
  buildReportBiologicalContext,
  buildSoybeanApplicationGuidance,
  climateContextFromAnalysisContext,
} from "../src/domain/report-context-blocks.ts";
import { evaluateSoilWaterNutrientDynamics } from "../src/domain/soil-water-nutrient-dynamics.ts";

const plan = buildFertilityCyclePlan({
  horizonYears: 3,
  phosphorusLevel: "Baixo",
  potassiumLevel: "Baixo",
  correctionStrategy: "GRADUAL_TWO_CROPS",
  seasons: [
    { order: 1, cropCode: "SOJA", targetYieldTonPerHa: 4.8 },
    { order: 2, cropCode: "TRIGO", targetYieldTonPerHa: 4.2 },
    { order: 3, cropCode: "SOJA", targetYieldTonPerHa: 4.8 },
    { order: 4, cropCode: "MILHO", targetYieldTonPerHa: 12 },
  ],
});

assert.deepEqual(plan.correctionTotalKgPerHa, { P2O5: 80, K2O: 60 });
assert.deepEqual(plan.correctionScheduleKgPerHa, [
  { order: 1, P2O5: 53.3, K2O: 40 },
  { order: 2, P2O5: 26.7, K2O: 20 },
]);

const first = plan.seasonPlans[0];
assert.equal(first.cropCode, "SOJA");
assert.equal(first.maintenanceKgPerHa.P2O5, 72);
assert.equal(first.maintenanceKgPerHa.K2O, 120);
assert.equal(first.totalPlannedKgPerHa.P2O5, 125.3);
assert.equal(first.totalPlannedKgPerHa.K2O, 160);

const second = plan.seasonPlans[1];
assert.equal(second.cropCode, "TRIGO");
assert.equal(second.maintenanceKgPerHa.P2O5, 63);
assert.equal(second.maintenanceKgPerHa.K2O, 42);
assert.equal(second.totalPlannedKgPerHa.P2O5, 89.7);
assert.equal(second.totalPlannedKgPerHa.K2O, 62);

assert.equal(plan.planningStatus, "READY");
assert.equal(plan.correctionOnlyScenario.productivityForecastAllowed, false);
assert.equal(plan.correctionOnlyScenario.expectedYieldTonPerHa, null);
assert.ok(plan.correctionOnlyScenario.skippedMaintenanceKgPerHa.P2O5 > 0);
assert.ok(plan.correctionOnlyScenario.skippedMaintenanceKgPerHa.K2O > 0);
assert.deepEqual(plan.principles.limeTypicalResidualYears, { min: 3, max: 5 });
assert.equal(plan.principles.annualMaintenanceStillRequired, true);

const totalNow = buildFertilityCyclePlan({
  horizonYears: 2,
  phosphorusLevel: "Muito Baixo",
  potassiumLevel: "Médio",
  correctionStrategy: "TOTAL_AT_START",
  seasons: [
    { order: 1, cropCode: "SOJA", targetYieldTonPerHa: 3 },
    { order: 2, cropCode: "SOJA", targetYieldTonPerHa: 3 },
  ],
});
assert.deepEqual(totalNow.correctionTotalKgPerHa, { P2O5: 160, K2O: 30 });
assert.deepEqual(totalNow.correctionScheduleKgPerHa, [{ order: 1, P2O5: 160, K2O: 30 }]);
assert.equal(totalNow.seasonPlans[1].correctionKgPerHa.P2O5, 0);

const partial = buildFertilityCyclePlan({
  horizonYears: 4,
  phosphorusLevel: "Médio",
  potassiumLevel: "Alto",
  correctionStrategy: "GRADUAL_TWO_CROPS",
  seasons: [
    { order: 1, cropCode: "CANOLA", targetYieldTonPerHa: 2.5 },
    { order: 2, cropCode: "SOJA", targetYieldTonPerHa: null },
  ],
});
assert.equal(partial.planningStatus, "PARTIAL");
assert.ok(partial.blockers.some((item) => item.code === "CROP_MAINTENANCE_TABLE_NOT_HOMOLOGATED"));
assert.ok(partial.blockers.some((item) => item.code === "TARGET_YIELD_MISSING_FOR_MAINTENANCE"));

const irrigatedDynamics = evaluateSoilWaterNutrientDynamics({
  irrigationRegime: "FULL",
  soilTexture: "COARSE",
  cecClass: "LOW",
  waterStatus: "SURPLUS",
  drainage: "MODERATE",
  trafficOnWetSoil: "POSSIBLE",
  residueLevel: "HIGH",
});

const irrigatedPlan = buildFertilityCyclePlan({
  horizonYears: 3,
  phosphorusLevel: "Baixo",
  potassiumLevel: "Baixo",
  correctionStrategy: "GRADUAL_TWO_CROPS",
  seasons: [
    { order: 1, cropCode: "SOJA", targetYieldTonPerHa: 4.8 },
    { order: 2, cropCode: "TRIGO", targetYieldTonPerHa: 4.2 },
  ],
  soilWaterDynamics: irrigatedDynamics,
});
assert.ok(irrigatedPlan.waterDynamicsAdjustment?.splitApplicationPriority.includes("K"));
assert.ok(irrigatedPlan.waterDynamicsAdjustment?.splitApplicationPriority.includes("N_NO3"));
assert.equal(irrigatedPlan.waterDynamicsAdjustment?.earlierSoilMonitoringAdvised, true);
assert.equal(irrigatedPlan.waterDynamicsAdjustment?.automaticDoseIncreaseAllowed, false);
assert.equal(irrigatedPlan.waterDynamicsAdjustment?.automaticDoseReductionAllowed, false);
assert.deepEqual(irrigatedPlan.correctionTotalKgPerHa, { P2O5: 80, K2O: 60 });


const interpretationItem = (sampleCode, parameterCode, classification) => ({
  sampleCode,
  parameterCode,
  interpretable: true,
  classificationRole: "TARGET",
  classification,
});

const cabedaP = ["Alto", "Alto", "Baixo", "Alto", "Médio", "Baixo", "Médio", "Alto"];
const cabedaK = ["Alto", "Alto", "Alto", "Muito Alto", "Muito Alto", "Alto", "Muito Alto", "Alto"];
const cabedaInterpretation = cabedaP.flatMap((classification, index) => [
  interpretationItem(`P${index + 1}`, "P", classification),
  interpretationItem(`P${index + 1}`, "K", cabedaK[index]),
]);

const currentPPoints = computeDeterministicPkPointDoseEnvelope({
  cropCode: "SOJA",
  interpretation: cabedaInterpretation,
  yieldGoal: 4.8,
  yieldGoalUnit: "t/ha",
  cultivationOrderAfterSoilAnalysis: 1,
  nutrient: "P2O5",
  allowEqualWeightOperationalAverage: false,
});
const currentKPoints = computeDeterministicPkPointDoseEnvelope({
  cropCode: "SOJA",
  interpretation: cabedaInterpretation,
  yieldGoal: 4.8,
  yieldGoalUnit: "t/ha",
  cultivationOrderAfterSoilAnalysis: 1,
  nutrient: "K2O",
  allowEqualWeightOperationalAverage: false,
});
const currentPUniform = computeDeterministicPkDose({
  cropCode: "SOJA",
  interpretation: cabedaInterpretation,
  yieldGoal: 4.8,
  yieldGoalUnit: "t/ha",
  cultivationOrderAfterSoilAnalysis: 1,
  nutrient: "P2O5",
});
const currentKUniform = computeDeterministicPkDose({
  cropCode: "SOJA",
  interpretation: cabedaInterpretation,
  yieldGoal: 4.8,
  yieldGoalUnit: "t/ha",
  cultivationOrderAfterSoilAnalysis: 1,
  nutrient: "K2O",
});

const cabedaHorizon = buildReportFertilityHorizon({
  horizonYears: 5,
  cropCode: "SOJA",
  interpretation: cabedaInterpretation,
  targetYieldTonPerHa: 4.8,
  targetYieldUnit: "t/ha",
  cultivationOrderAfterSoilAnalysis: 1,
  currentPkPointDoses: { P2O5: currentPPoints, K2O: currentKPoints },
  currentPkDoses: { P2O5: currentPUniform, K2O: currentKUniform },
});
assert.ok(cabedaHorizon);
assert.equal(cabedaHorizon.horizonYears, 5);
assert.equal(cabedaHorizon.targetYieldDisplay, "80 sc/ha (4,8 t/ha)");
assert.equal(cabedaHorizon.reanalysisAfterCultivations, 2);
assert.equal(cabedaHorizon.stages[0].status, "SPATIAL_READY");
assert.equal(cabedaHorizon.stages[0].p2o5KgPerHa, null);
assert.deepEqual(cabedaHorizon.stages[0].p2o5RangeKgPerHa, { min: 72, max: 122 });
assert.equal(cabedaHorizon.stages[0].k2oKgPerHa, 120);
assert.match(cabedaHorizon.stages[0].rationale, /sem promover média/i);
assert.equal(cabedaHorizon.stages[1].status, "SPATIAL_READY");
assert.equal(cabedaHorizon.stages[1].p2o5KgPerHa, null);
assert.deepEqual(cabedaHorizon.stages[1].p2o5RangeKgPerHa, { min: 72, max: 102 });
assert.equal(cabedaHorizon.stages[1].k2oKgPerHa, 120);
assert.equal(cabedaHorizon.stages[2].status, "REANALYSIS_REQUIRED");
assert.equal(cabedaHorizon.stages[3].p2o5KgPerHa, null);
assert.match(cabedaHorizon.stages[3].rationale, /não promete produtividade/i);

const complementsSufficient = buildSoilComplementActions([
  interpretationItem("P1", "B", "Médio"),
  interpretationItem("P2", "B", "Alto"),
  interpretationItem("P1", "ZN", "Alto"),
  interpretationItem("P1", "CU", "Alto"),
  interpretationItem("P1", "MN", "Alto"),
  interpretationItem("P1", "MO", "Médio"),
]);
assert.equal(complementsSufficient.find((item) => item.parameterCode === "B")?.status, "SUFFICIENT_NO_GENERAL_COMPLEMENT");
assert.equal(complementsSufficient.find((item) => item.parameterCode === "MO")?.status, "SUFFICIENT_NO_GENERAL_COMPLEMENT");

const complementsLow = buildSoilComplementActions([
  interpretationItem("P1", "B", "Baixo"),
  interpretationItem("P2", "B", "Alto"),
  interpretationItem("P1", "MO", "Baixo"),
]);
const lowB = complementsLow.find((item) => item.parameterCode === "B");
assert.equal(lowB?.status, "HETEROGENEOUS_REQUIRES_COMPLEMENT_REVIEW");
assert.equal(lowB?.numericDoseAllowed, false);
assert.match(lowB?.action ?? "", /não aplicar uma dose geral/i);
const lowMo = complementsLow.find((item) => item.parameterCode === "MO");
assert.equal(lowMo?.status, "LOW_REQUIRES_COMPLEMENT_REVIEW");
assert.match(lowMo?.action ?? "", /cobertura|rotação/i);


const climateProvided = climateContextFromAnalysisContext({
  draft: {
    weatherContextStatus: "PROVIDED",
    weatherContextNotes: "Safra com risco hídrico informado pelo responsável técnico.",
  },
});
assert.equal(climateProvided.status, "PROVIDED");
assert.match(climateProvided.notes ?? "", /risco hídrico/);
assert.equal(climateProvided.automaticDoseAdjustmentAllowed, false);

const biologyContext = buildReportBiologicalContext({
  biologicalSoilEvidence: {
    hasAnyBiology: true,
    coreBioAs: { complete: true },
    interpretation: { officialLabInterpretationAvailable: true },
    warnings: [],
  },
  soilMicrobiologyEvidence: {
    hasMicrobiologyEvidence: true,
    observations: [{ id: 1 }, { id: 2 }],
    detectedFunctionalRoles: ["PHOSPHORUS_SOLUBILIZATION"],
    warnings: [],
  },
});
assert.equal(biologyContext.hasAnyBiology, true);
assert.equal(biologyContext.microbiologyObservationCount, 2);
assert.equal(biologyContext.automaticNutrientCreditAllowed, false);
assert.equal(biologyContext.automaticDoseAdjustmentAllowed, false);
assert.match(biologyContext.summary ?? "", /não gera crédito automático/i);

const cabedaPlacement = buildSoybeanApplicationGuidance({
  cropCode: "SOJA",
  state: "RS",
  p2o5KgPerHa: null,
  k2oKgPerHa: null,
  p2o5RangeKgPerHa: { min: 72, max: 122 },
  k2oRangeKgPerHa: { min: 45, max: 120 },
});
assert.equal(cabedaPlacement.status, "PLACEMENT_REVIEW_REQUIRED");
assert.equal(cabedaPlacement.assessmentBasis, "POINT_RANGE_MAX");
assert.ok(cabedaPlacement.blockers.includes("FURROW_P2O5_EXCEEDS_120_WITHOUT_SAFE_OFFSET"));
assert.ok(cabedaPlacement.blockers.includes("FURROW_K2O_EXCEEDS_80_WITHOUT_SAFE_OFFSET"));
assert.match(cabedaPlacement.guidance, /maior valor da faixa por ponto/i);
assert.match(cabedaPlacement.guidance, /80 kg K₂O\/ha/);
assert.match(cabedaPlacement.costBenefitNote, /produto, preço, concentração, equipamento e logística/i);

console.log("fertility-cycle-plan: correção multi-ano, manutenção e cenário sem reinvestimento validados");
