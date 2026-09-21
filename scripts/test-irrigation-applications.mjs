import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as crypto from "node:crypto";
import * as util from "node:util";
import ts from "typescript";
import * as irrigation from "../src/domain/irrigation-applications.ts";
import { evaluateIrrigationWaterEvidence } from "../src/domain/irrigation-water-assessment.ts";
import { deterministicLimitedPrescriptionProvider } from "../src/lib/ai/providers/deterministic-limited-prescription-provider.ts";

const { parseIrrigationApplications: parse, evaluateIrrigationApplications: evaluate } = irrigation;
assert.equal(evaluate(undefined).status, "NOT_PROVIDED");
assert.equal(evaluate(undefined).policy.missingDataBlocksOfficialReport, false);
const partial = parse([{ id: "application-1", system: "Pivô" }]);
assert.equal(evaluate(partial).applications[0].depthFromVolumeMm, null);
assert.equal(evaluate(partial).applications[0].instantUtc, null);
const input = [{ id: "application-1", date: "2026-09-20", time: "18:00", utcOffset: "-03:00",
  volumeM3: 240, irrigatedAreaHa: 2, depthMm: 11, efficiencyPercent: 80 }];
const quantified = evaluate(input);
assert.equal(quantified.applications[0].depthFromVolumeMm, 12);
assert.equal(quantified.applications[0].depthMm, 11, "no replacement of declared depth");
assert.equal(quantified.applications[0].instantUtc, "2026-09-20T21:00:00.000Z");
assert.equal(quantified.policy.waterBalanceAvailable, false);
assert.equal(quantified.policy.automaticNutrientDoseChangeAllowed, false);
assert.ok(quantified.applications[0].limitations.includes("EFFICIENCY_SOURCE_NOT_PROVIDED"));
assert.equal(evaluate([{ ...input[0], irrigatedAreaHa: null }]).applications[0].depthFromVolumeMm, null);
assert.equal(evaluate([{ ...input[0], utcOffset: null }]).applications[0].instantUtc, null, "never infer timezone");
assert.equal(evaluate([{ ...input[0], irrigatedAreaHa: Number.MIN_VALUE }]).applications[0].depthFromVolumeMm, null);
for (const patch of [{ depthMm: -1 }, { volumeM3: "240" }, { volumeM3: Infinity }, { irrigatedAreaHa: 0 },
  { efficiencyPercent: 101 }, { date: "2026-02-30" }, { date: "2026-13-01" }, { time: "25:00" },
  { utcOffset: "-15:00" }, { utcOffset: "+14:30" }, { evidenceSource: {} }]) {
  assert.throws(() => parse([{ id: "a", ...patch }]));
  assert.equal(evaluate([{ id: "a", ...patch }]).policy.missingDataBlocksOfficialReport, false);
  assert.equal(evaluate([{ id: "a", ...patch }]).status, "INVALID_OPTIONAL_EVIDENCE");
}
assert.throws(() => parse([{ id: "same" }, { id: "same" }]));
assert.throws(() => parse(null));
assert.equal(evaluate([{ id: "a", date: "2024-02-29" }]).status, "AVAILABLE");
assert.equal(evaluate([{ id: "a", time: "18:00" }]).applications[0].instantUtc, null);

// Execute the real repository with an instrumented transaction adapter: no DB writes.
const repository = {};
let root = { otherRoot: "preserve", draft: { waterRegime: "IRRIGADO", irrigationDepthMm: 7,
  laboratoryMethod: "do-not-change", plannedManagementNotes: "Plano anterior" } };
let writes = 0;
let seasonTouches = 0;
const audits = [];
let visible = true;
const client = { async query(sql, args) {
  assert.equal(args[0], "tenant-a", "every SQL request scoped to session tenant");
  if (/SELECT id::text/.test(sql)) {
    assert.equal(args[1], "analysis-a");
    assert.match(sql, /tenant_id = \$1::uuid AND id = \$2::uuid/);
    return { rows: visible ? [{ id: "analysis-a", cropSeasonId: "season-a", analysisContext: structuredClone(root) }] : [] };
  }
  if (/UPDATE analyses/.test(sql)) {
    assert.equal(args[1], "analysis-a");
    root = JSON.parse(args[2]); writes++; return { rows: [] };
  }
  if (/UPDATE crop_seasons/.test(sql)) {
    assert.equal(args[1], "season-a"); seasonTouches++; return { rows: [] };
  }
  throw new Error(`Unexpected SQL: ${sql}`);
} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/repositories/analyses.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: repository, require(name) {
  if (name === "node:crypto") return crypto;
  // VM-created arrays have another prototype; production JSON uses one realm.
  if (name === "node:util") return { isDeepStrictEqual: (a, b) => util.isDeepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b))) };
  if (name.includes("irrigation-applications")) return irrigation;
  if (name === "@/lib/db") return { withTenant: async (scope, run) => {
    assert.equal(scope.tenantId, "tenant-a"); assert.equal(scope.userId, "user-a"); return run(client);
  } };
  if (name === "@/lib/repositories/audit") return { writeAudit: async (_client, audit) => { audits.push(audit); } };
  throw new Error(`Unexpected dependency ${name}`);
} });
const scope = { tenantId: "tenant-a", userId: "user-a", analysisId: "analysis-a" };
const saved = await repository.updateAnalysisPlanningContext({ ...scope, irrigationApplications: input, expectedIrrigationApplications: [] });
assert.equal(saved.changed, true);
assert.equal(root.otherRoot, "preserve");
assert.equal(root.draft.laboratoryMethod, "do-not-change");
assert.equal(root.draft.irrigationDepthMm, 7, "individual event never replaces usual pattern");
assert.equal(root.draft.plannedManagementNotes, "Plano anterior");
assert.equal(evaluate(irrigation.irrigationApplicationsFromContext(root)).applications[0].depthFromVolumeMm, 12);
assert.equal(writes, 1); assert.equal(seasonTouches, 1, "freshness invalidated without rewriting reports");
assert.ok(audits[0].metadata.changedFields.includes("irrigationApplications"));
// JSONB may reorder object keys. This must remain a no-op, not a false conflict.
const reordered = saved.irrigationApplications.map(item => Object.fromEntries(Object.entries(item).reverse()));
const noop = await repository.updateAnalysisPlanningContext({ ...scope, irrigationApplications: reordered, expectedIrrigationApplications: reordered });
assert.equal(noop.changed, false); assert.equal(writes, 1);
await assert.rejects(repository.updateAnalysisPlanningContext({ ...scope, irrigationApplications: [], expectedIrrigationApplications: [] }), error => error.status === 409);
await assert.rejects(repository.updateAnalysisPlanningContext({ ...scope, irrigationApplications: [] }), error => error.status === 409);
assert.equal(writes, 1, "stale edits never overwrite newer operations");
await repository.updateAnalysisPlanningContext({ ...scope, plannedManagementNotes: "Plano atualizado" });
assert.equal(root.draft.irrigationApplications.length, 1, "unrelated patch retains all operations");
visible = false;
assert.equal(await repository.getAnalysisPlanningContext(scope), null);
await assert.rejects(repository.updateAnalysisPlanningContext({ ...scope, irrigationApplications: [], expectedIrrigationApplications: saved.irrigationApplications }), error => error.status === 404);
assert.equal(writes, 2, "non-visible analysis cannot be written");

// Same deterministic nutrient result with/without operational irrigation evidence.
const dose = { ready: true, expected: { isDiscretionaryRange: false, doseKgPerHa: 75,
  ruleId: "TEST_ONLY", soilLevel: "HIGH", assumptions: [] } };
const baseEvidence = { results: [], technicalSources: [], deterministicInterpretation: null, season: { cropProfileCode: "SOJA" },
  deterministicPkDoses: { P2O5: { ready: false, blockers: ["TEST_HETEROGENEITY"] }, K2O: dose } };
const baseResult = await deterministicLimitedPrescriptionProvider.prescribe({ evidence: baseEvidence });
const refinedResult = await deterministicLimitedPrescriptionProvider.prescribe({ evidence: {
  ...baseEvidence, irrigationApplicationEvidence: quantified,
} });
assert.deepEqual(refinedResult.prescription.recommendations, baseResult.prescription.recommendations);
assert.deepEqual(refinedResult.prescription.missingInformation, baseResult.prescription.missingInformation);
assert.match(refinedResult.prescription.managementPractices.join(" "), /12 mm/);
assert.match(refinedResult.prescription.managementPractices.join(" "), /lâmina declarada 11 mm/);
const invalidResult = await deterministicLimitedPrescriptionProvider.prescribe({ evidence: {
  ...baseEvidence, irrigationApplicationEvidence: evaluate([{ id: "a", date: "invalid" }]),
} });
assert.deepEqual(invalidResult.prescription.recommendations, baseResult.prescription.recommendations);
assert.match(invalidResult.prescription.managementPractices.join(" "), /preservadas/);
const progressiveWaterResult = await deterministicLimitedPrescriptionProvider.prescribe({ evidence: {
  ...baseEvidence,
  irrigationWaterEvidence: evaluateIrrigationWaterEvidence({ waterRegime: "IRRIGADO" }),
} });
assert.deepEqual(progressiveWaterResult.prescription.recommendations, baseResult.prescription.recommendations);
assert.deepEqual(progressiveWaterResult.prescription.missingInformation, baseResult.prescription.missingInformation);
assert.match(progressiveWaterResult.prescription.managementPractices.join(" "), /declarada irrigada/);
assert.match(progressiveWaterResult.prescription.managementPractices.join(" "), /não comprova quanto da demanda/);

const rainfedWaterResult = await deterministicLimitedPrescriptionProvider.prescribe({ evidence: {
  ...baseEvidence,
  irrigationWaterEvidence: evaluateIrrigationWaterEvidence({ waterRegime: "SEQUEIRO" }),
} });
assert.deepEqual(rainfedWaterResult.prescription.recommendations, baseResult.prescription.recommendations);
assert.match(rainfedWaterResult.prescription.managementPractices.join(" "), /declarada de sequeiro/);


// Real React component state/effects, isolated from network and browser rendering.
async function loadedContext(fetchImpl) {
  const state = [], effects = [];
  let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  const component = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/components/simple-recommendation-context.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports: component, fetch: fetchImpl, require(name) {
    if (name === "react") return {
      useState: initial => { const i = cursor++; if (!(i in state)) state[i] = initial;
        return [state[i], next => { state[i] = typeof next === "function" ? next(state[i]) : next; }]; },
      useEffect: fn => effects.push(fn), useMemo: fn => fn(),
    };
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name.includes("irrigation-applications-editor")) return { IrrigationApplicationsEditor: "IRRIGATION_EDITOR" };
    if (name.includes("irrigation-applications")) return irrigation;
    if (name.includes("management-system")) return { normalizeManagementSystem: () => "OTHER", MANAGEMENT_SYSTEM_OPTIONS: [] };
    if (name.includes("yield-goal-presets")) return { yieldGoalPresetConfig: () => null };
    if (name.includes("icon")) return { Icon: "ICON" };
    throw new Error(name);
  } });
  const render = () => { cursor = 0; return component.SimpleRecommendationContext({
    analysisId: "a", cropSeasonId: "s", blockers: [], yieldGoal: null, cropProfileCode: "SOJA", onSaved() {},
  }); };
  render(); effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const nodes = [];
  function visit(node) { if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === "object") { nodes.push(node); visit(node.props?.children); } }
  visit(render());
  return nodes;
}
const failedLoad = await loadedContext(async () => { throw new Error("Network offline"); });
assert.equal(failedLoad.find(node => node.type === "IRRIGATION_EDITOR").props.disabled, true);
assert.ok(failedLoad.filter(node => node.type === "textarea").every(node => node.props.disabled), "failed read is never treated as an empty editable plan");
const corruptOptional = await loadedContext(async () => ({ ok: true, json: async () => ({ planningContext: {
  plannedManagementNotes: "Plano válido", irrigationApplications: [{ id: "a", depthMm: -1 }],
} }) }));
assert.equal(corruptOptional.find(node => node.type === "IRRIGATION_EDITOR").props.disabled, true);
assert.ok(corruptOptional.filter(node => node.type === "textarea").every(node => !node.props.disabled), "invalid irrigation cannot disable unrelated planning");
console.log("irrigation-applications: partial evidence, units, timestamps, invalid optional inputs, persistence, concurrency, tenant scope and freshness passed");
