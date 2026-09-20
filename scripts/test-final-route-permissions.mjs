import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Run actual route handlers with injected sessions. Repository calls are never allowed
// in a denied request; this verifies execution order, not just role-name strings.
function route(path, session, dependencies = {}) {
  const exports = {};
  const source = readFileSync(new URL(`../src/app/api/${path}/route.ts`, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, {
    exports, Response, URL, Error,
    require() {
      return new Proxy({}, { get(_target, key) {
        if (key === "getPlatformSession") return async () => session;
        if (key in dependencies) return dependencies[key];
        if (String(key).endsWith("Error")) return class extends Error {};
        return () => { throw new Error(`Unexpected repository call: ${String(key)}`); };
      } });
    },
  });
  return exports;
}
const finalRoutes = [
  "analyses/[id]/official-result", "analyses/[id]/final-review",
  "agronomic-prescriptions/[id]/review", "interpretations/[id]/review",
];
for (const path of finalRoutes) {
  for (const role of [null, "FIELD_TECH", "VIEWER", "CLIENT"]) {
    const handler = route(path, role ? { role, tenantId: "test-tenant", userId: "test-user" } : null);
    const result = await handler.POST(new Request("https://test.invalid/", { method: "POST" }), { params: Promise.resolve({ id: "test-analysis" }) });
    assert.equal(result.status, role ? 403 : 401, `${path}: ${role}`);
  }
}
for (const role of ["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]) {
  let checkedTenant = null;
  const handler = route("analyses/[id]/official-result", { role, tenantId: "test-tenant", userId: "test-user" }, {
    getAnalysisEvidenceState: async input => { checkedTenant = input.tenantId; return { analysisExists: false }; },
  });
  const result = await handler.POST(new Request("https://test.invalid/", { method: "POST" }), { params: Promise.resolve({ id: "test-analysis" }) });
  assert.equal(result.status, 404);
  assert.equal(checkedTenant, "test-tenant", "authorized calls must retain the session tenant");
}
for (const role of [null, "VIEWER", "CLIENT"]) {
  const handler = route(
    "analyses/[id]/planned-management",
    role ? { role, tenantId: "test-tenant", userId: "test-user" } : null,
  );
  const result = await handler.PATCH(
    new Request("https://test.invalid/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plannedManagementNotes: "cultivar definida" }),
    }),
    { params: Promise.resolve({ id: "test-analysis" }) },
  );
  assert.equal(result.status, role ? 403 : 401, `planned-management: ${role}`);
}

for (const role of ["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]) {
  let checkedTenant = null;
  const handler = route("analyses/[id]/planned-management", { role, tenantId: "test-tenant", userId: "test-user" }, {
    updateAnalysisPlannedManagementNotes: async input => {
      checkedTenant = input.tenantId;
      assert.equal(input.analysisId, "test-analysis");
      assert.equal(input.plannedManagementNotes, "cultivar definida");
      return { analysisId: input.analysisId, plannedManagementNotes: input.plannedManagementNotes, changed: true };
    },
  });
  const result = await handler.PATCH(
    new Request("https://test.invalid/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plannedManagementNotes: "cultivar definida" }),
    }),
    { params: Promise.resolve({ id: "test-analysis" }) },
  );
  assert.equal(result.status, 200);
  assert.equal(checkedTenant, "test-tenant");
}

const preparation = route("analyses/[id]/interpret", { role: "FIELD_TECH", tenantId: "test-tenant", userId: "test-user" }, {
  runInterpretationForAnalysis: async input => {
    assert.equal(input.tenantId, "test-tenant");
    return { interpretation: { status: "APPROVED" }, engineResult: {} };
  },
});
const prepared = await preparation.POST(new Request("https://test.invalid/?draft=0", { method: "POST" }), { params: Promise.resolve({ id: "test-analysis" }) });
assert.equal(prepared.status, 201);
console.log("OK — final routes protect publication; FIELD_TECH can prepare analyses and edit optional planned management within tenant.");
