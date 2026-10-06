import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { executeMultiseasonPlan, resolvePlanningCapability, resolvePlanningScenarioPersistenceStatus } from "../src/domain/multiseason-planning.ts";
assert.equal(resolvePlanningCapability("SOYBEAN").status, "PARTIAL");
assert.equal(resolvePlanningCapability("UNKNOWN").status, "UNSUPPORTED");
const noEvidence = executeMultiseasonPlan({ crops: [{ cropCode: "SOYBEAN" }], hasBaseEvidence: false });
assert.equal(noEvidence[0].limitations[0], "INSUFFICIENT_EVIDENCE");
const plan = executeMultiseasonPlan({ crops: [{ cropCode: "SOYBEAN" }, { cropCode: "WHEAT" }, { cropCode: "RICE" }], hasBaseEvidence: true });
assert.equal(plan[0].status, "PARTIAL");
assert.equal(plan[1].status, "PARTIAL");
assert.equal(plan[2].status, "REANALYSIS_REQUIRED");
assert.equal(plan[2].reanalysisRequired, true);
assert.equal(resolvePlanningScenarioPersistenceStatus([]), "DRAFT");
assert.equal(resolvePlanningScenarioPersistenceStatus(plan), "REANALYSIS_REQUIRED");
assert.equal(
  resolvePlanningScenarioPersistenceStatus(plan.slice(0,2)),
  "CALCULATED",
);
const calculateRoute = readFileSync(new URL("../src/app/api/planning/[id]/calculate/route.ts", import.meta.url), "utf8");
assert.match(calculateRoute, /writers\.has\(s\.role\)/);
assert.match(calculateRoute, /status:403/);

const repository = readFileSync(new URL("../src/lib/repositories/planning.ts", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/components/planning-scenario-editor.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../db/migrations/047_multiseason_planning.sql", import.meta.url), "utf8");
const planningWorkspace = readFileSync(new URL("../src/components/planning-workspace.tsx", import.meta.url), "utf8");
const declaredContextMigration = readFileSync(new URL("../db/migrations/048_multiseason_declared_context.sql", import.meta.url), "utf8");

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
  /FOR UPDATE/,
  "mutações concorrentes do cenário precisam serializar a posição dos cultivos",
);
for (const auditAction of [
  "PLANNING_CROP_ADDED",
  "PLANNING_CROP_UPDATED",
  "PLANNING_CROP_REMOVED",
  "PLANNING_CROPS_REORDERED",
  "PLANNING_SCENARIO_CALCULATED",
  "PLANNING_SCENARIO_SNAPSHOT_CREATED",
]) {
  assert.match(repository, new RegExp(auditAction), `auditoria ausente: ${auditAction}`);
}
assert.match(
  repository,
  /SET status='DRAFT'/,
  "edições precisam invalidar o estado calculado anterior",
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
assert.match(
  declaredContextMigration,
  /ADD COLUMN management_system text/,
  "contexto declarado precisa ser persistido sem inferir manejo",
);
assert.match(declaredContextMigration, /ADD COLUMN irrigation_type text/);
assert.match(declaredContextMigration, /ADD COLUMN recent_crop_history text/);
assert.match(declaredContextMigration, /ADD COLUMN fertilization_history text/);
assert.match(declaredContextMigration, /ADD COLUMN organic_inputs text/);
assert.match(
  editor,
  /Data prevista/,
  "cada cultivo deve expor a data prevista já existente no modelo",
);
assert.match(
  editor,
  /Condição hídrica/,
  "cada cultivo deve distinguir irrigado, sequeiro e não informado",
);
assert.match(
  editor,
  /Eles não criam doses, clima ou efeito residual por conta própria/,
  "entrevista declarada não pode ser apresentada como regra agronômica",
);
console.log("multiseason-planning: capability, evidência, base por talhão, snapshot imutável e ausência de alvo inventado aprovados");
