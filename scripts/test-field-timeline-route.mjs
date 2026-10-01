import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/app/api/fields/[id]/timeline/route.ts", import.meta.url), "utf8");
const repository = await readFile(new URL("../src/lib/repositories/field-timeline.ts", import.meta.url), "utf8");
let session = null;
let timeline = null;
const calls = [];
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  module, exports: module.exports, Response,
  require(name) {
    if (name === "@/lib/auth/session") return { getPlatformSession: async () => session };
    if (name === "@/lib/repositories/field-timeline") return { getFieldTimeline: async (...args) => { calls.push(args); return timeline; } };
    throw new Error(`Dependência inesperada: ${name}`);
  },
});
const context = { params: Promise.resolve({ id: "field" }) };
const request = new Request("http://localhost/api/fields/field/timeline?tenantId=other-tenant&userId=other-user");
let response = await module.exports.GET(request, context);
assert.equal(response.status, 401);
assert.equal(calls.length, 0);
assert.equal(response.headers.get("cache-control"), "private, no-store");
session = { tenantId: "authenticated-tenant", userId: "authenticated-user" };
response = await module.exports.GET(request, context);
assert.equal(response.status, 404);
assert.deepEqual([...calls[0]], [session.tenantId, "field", session.userId]);
assert.equal(response.headers.get("cache-control"), "private, no-store");
timeline = { fieldId: "field", events: [], seasons: [], undatedCount: 0 };
response = await module.exports.GET(request, context);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), timeline);
assert.equal(response.headers.get("cache-control"), "private, no-store");
assert.doesNotMatch(repository, /request_payload|response_payload|storage_key|raw_object_key|reviewer_note|\.email|ae\.metadata/);
assert.doesNotMatch(repository, /LIMIT 1/);
console.log("field-timeline-route: sessão obrigatória, tenant autenticado, 404, no-store e projeção sem payloads privados aprovados");
