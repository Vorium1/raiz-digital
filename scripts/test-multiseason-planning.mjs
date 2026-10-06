import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { executeMultiseasonPlan, resolvePlanningCapability } from "../src/domain/multiseason-planning.ts";
assert.equal(resolvePlanningCapability("SOYBEAN").status, "PARTIAL");
assert.equal(resolvePlanningCapability("UNKNOWN").status, "UNSUPPORTED");
const noEvidence = executeMultiseasonPlan({ crops: [{ cropCode: "SOYBEAN" }], hasBaseEvidence: false });
assert.equal(noEvidence[0].limitations[0], "INSUFFICIENT_EVIDENCE");
const plan = executeMultiseasonPlan({ crops: [{ cropCode: "SOYBEAN" }, { cropCode: "WHEAT" }, { cropCode: "RICE" }], hasBaseEvidence: true });
assert.equal(plan[0].status, "PARTIAL");
assert.equal(plan[1].status, "PARTIAL");
assert.equal(plan[2].status, "REANALYSIS_REQUIRED");
assert.equal(plan[2].reanalysisRequired, true);
const calculateRoute = readFileSync(new URL("../src/app/api/planning/[id]/calculate/route.ts", import.meta.url), "utf8");
assert.match(calculateRoute, /writers\.has\(s\.role\)/);
assert.match(calculateRoute, /status:403/);

const repository = readFileSync(new URL("../src/lib/repositories/planning.ts", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/components/planning-scenario-editor.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../db/migrations/047_multiseason_planning.sql", import.meta.url), "utf8");
const planningWorkspace = readFileSync(new URL("../src/components/planning-workspace.tsx", import.meta.url), "utf8");

assert.match(
  repository,
  /cs\.field_id=f\.id/,
  "análise-base precisa pertencer ao mesmo talhão do cenário",
);
assert.match(
  repository,
  /AS "baseEvidenceReady"/,
  "cenário precisa distinguir análise vinculada de evidência laboratorial realmente disponível",
);
assert.match(
  repository,
  /JOIN lab_results plr/,
  "readiness da análise-base deve depender de resultados laboratoriais persistidos",
);
assert.match(
  repository,
  /hasBaseEvidence:Boolean\(scenario\.baseEvidenceReady\)/,
  "orquestração fail-closed deve usar evidência real e não apenas UUID da análise",
);
assert.match(
  planningWorkspace,
  /baseAnalysisId:baseAnalysisId\|\|null/,
  "workspace deve enviar explicitamente a análise-base escolhida",
);
assert.match(
  planningWorkspace,
  /analysis\.fieldId===fieldId/,
  "seletor de análise-base deve ficar restrito ao talhão escolhido",
);
assert.match(
  repository,
  /getPlanningScenarioWithClient\(c,input\.tenantId,input\.scenarioId\)/,
  "lifecycle deve reler o cenário dentro da mesma transação tenant-scoped",
);
assert.match(
  repository,
  /const scenario=await getPlanningScenarioWithClient\(c,tenantId,scenarioId\)/,
  "snapshot deve congelar cenário e cálculo dentro da mesma transação",
);
assert.doesNotMatch(
  editor,
  /target=60|nutrient=K2O/,
  "planejamento sem dose calculada não pode inventar alvo K2O para a calculadora",
);
assert.match(
  editor,
  /\/calculadoras\?area=/,
  "calculadora pode receber apenas contexto neutro de área enquanto não houver alvo calculado",
);
assert.match(
  migration,
  /REVOKE UPDATE, DELETE ON planning_scenario_snapshots FROM raiz_app/,
  "runtime não pode alterar ou apagar snapshots de planejamento",
);
assert.match(
  migration,
  /planning_scenario_snapshots_immutable/,
  "imutabilidade do snapshot precisa existir também no banco",
);
console.log("multiseason-planning: capability, evidência, base por talhão, snapshot imutável e ausência de alvo inventado aprovados");
