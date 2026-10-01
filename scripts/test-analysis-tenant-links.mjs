import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../src/lib/repositories/analyses.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
let laboratory;
let inserts = 0;
let validations = 0;
const tenantId = "tenant-a";
vm.runInNewContext(compiled, {
  module, exports: module.exports,
  require(name) {
    if (name.startsWith("node:")) return require(name);
    if (name === "@/lib/db") return { withTenant: async (context, work) => {
      assert.equal(context.tenantId, tenantId);
      return work({ query: async (sql, values) => {
        if (sql.includes("FROM laboratories")) {
          validations++;
          assert.match(sql, /tenant_id = \$1::uuid OR tenant_id IS NULL/);
          assert.match(sql, /AND active/);
          assert.match(sql, /FOR SHARE/);
          assert.deepEqual([...values], [tenantId, "laboratory"]);
          return { rows: laboratory && laboratory.active && (laboratory.tenantId === tenantId || laboratory.tenantId === null) ? [{ id: "laboratory" }] : [] };
        }
        if (sql.includes("INSERT INTO analyses")) { inserts++; return { rows: [{ id: "analysis", code: "code" }] }; }
        throw new Error(`Consulta inesperada: ${sql}`);
      } });
    } };
    if (name === "@/lib/repositories/audit") return { writeAudit: async () => {} };
    if (name === "@/domain/management-system") return { normalizeManagementSystem: () => null };
    return {};
  },
});
const input = { tenantId, userId: "actor", cropSeasonId: "season", laboratoryId: "laboratory" };
for (const invalid of [undefined, { tenantId: "tenant-b", active: true }, { tenantId, active: false }]) {
  laboratory = invalid;
  await assert.rejects(module.exports.createAnalysis(input), (error) => error.status === 404);
}
assert.equal(inserts, 0, "Laboratório ausente, de outro tenant ou inativo não pode chegar ao INSERT.");
for (const allowed of [{ tenantId, active: true }, { tenantId: null, active: true }]) {
  laboratory = allowed;
  await module.exports.createAnalysis(input);
}
assert.equal(inserts, 2);
assert.equal(validations, 5);
await module.exports.createAnalysis({ ...input, laboratoryId: null });
assert.equal(inserts, 3);
assert.equal(validations, 5, "Laboratório continua opcional.");
console.log("analysis-tenant-links: laboratório local/global permitido; outro tenant, inativo e inexistente bloqueados antes da escrita (banco simulado)");
