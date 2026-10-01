import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/repositories/team.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
let members;
let tail = Promise.resolve();
let sessionScope;
const tenantId = "tenant-a";

async function withTenant(context, work) {
  assert.equal(context.tenantId, tenantId);
  let unlock;
  const client = {
    async query(sql, values) {
      if (sql.includes("FROM tenants") && sql.includes("FOR UPDATE")) {
        assert.deepEqual([...values], [tenantId]);
        const previous = tail;
        tail = new Promise((resolve) => { unlock = resolve; });
        await previous;
        return { rows: [{ id: tenantId }] };
      }
      if (sql.includes("SELECT role::text FROM tenant_members")) {
        assert.ok(unlock, "Autorização precisa ser lida após a trava compartilhada do tenant.");
        const row = members.get(values[1]);
        return { rows: row?.active ? [{ role: row.role }] : [] };
      }
      if (sql.includes("SELECT role::text, active")) {
        assert.ok(unlock, "O estado do alvo precisa ser lido após a trava do tenant.");
        const row = members.get(values[1]);
        return { rows: row ? [{ ...row }] : [] };
      }
      if (sql.includes("SELECT user_id::text")) {
        return { rows: [...members].filter(([, row]) => row.active && ["TENANT_ADMIN", "SUPER_ADMIN"].includes(row.role)).map(([user_id]) => ({ user_id })) };
      }
      if (sql.includes("UPDATE tenant_members SET role")) {
        members.get(values[1]).role = values[2];
        return { rows: [] };
      }
      if (sql.includes("UPDATE tenant_members SET active")) {
        members.get(values[1]).active = values[2];
        return { rows: [] };
      }
      if (sql.includes("UPDATE user_sessions")) return { rows: [] };
      if (sql.includes("JOIN users u")) {
        assert.doesNotMatch(sql, /u\.last_login_at/);
        assert.match(sql, /s\.tenant_id = tm\.tenant_id AND s\.user_id = tm\.user_id/);
        sessionScope = true;
        return { rows: [] };
      }
      throw new Error(`Consulta inesperada: ${sql}`);
    },
  };
  try { return await work(client); } finally { unlock?.(); }
}
vm.runInNewContext(compiled, {
  module,
  exports: module.exports,
  require(name) {
    if (name === "@/lib/db") return { withTenant };
    if (name === "@/lib/repositories/audit") return { writeAudit: async () => {} };
    throw new Error(`Dependência inesperada: ${name}`);
  },
});
const { updateTeamMemberRole, setTeamMemberActive, listTenantMembers } = module.exports;
const admin = () => ({ role: "TENANT_ADMIN", active: true });
members = new Map([["a", admin()], ["b", admin()]]);
const concurrent = await Promise.allSettled([
  updateTeamMemberRole({ tenantId, actorUserId: "a", targetUserId: "a", role: "VIEWER" }),
  updateTeamMemberRole({ tenantId, actorUserId: "b", targetUserId: "b", role: "VIEWER" }),
]);
assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
assert.equal([...members.values()].filter((row) => row.role === "TENANT_ADMIN" && row.active).length, 1);

members = new Map([["a", { role: "VIEWER", active: true }], ["b", admin()]]);
await assert.rejects(updateTeamMemberRole({ tenantId, actorUserId: "a", targetUserId: "b", role: "VIEWER" }), (error) => error.status === 403);
await assert.rejects(setTeamMemberActive({ tenantId, actorUserId: "a", targetUserId: "b", active: false }), (error) => error.status === 403);

members = new Map([["a", admin()], ["b", { role: "SUPER_ADMIN", active: true }]]);
await assert.rejects(updateTeamMemberRole({ tenantId, actorUserId: "a", targetUserId: "b", role: "VIEWER" }), (error) => error.status === 403);
await assert.rejects(setTeamMemberActive({ tenantId, actorUserId: "a", targetUserId: "b", active: false }), (error) => error.status === 403);

await listTenantMembers(tenantId, "a");
assert.equal(sessionScope, true);
console.log("team-administration: autorização transacional, preservação do último admin em concorrência e atividade de login restrita ao tenant aprovadas (banco simulado)");

const routeSource = await readFile(new URL("../src/app/api/platform/tenants/[id]/first-admin/route.ts", import.meta.url), "utf8");
const routeModule = { exports: {} };
const routeCompiled = ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let newAccount = true;
vm.runInNewContext(routeCompiled, {
  module: routeModule,
  exports: routeModule.exports,
  process: { env: {} },
  Response,
  console: { error: () => {} },
  require(name) {
    if (name === "node:crypto") return { randomBytes: () => ({ toString: () => "bootstrap-opaque" }) };
    if (name === "@/lib/auth/session") return { getPlatformSession: async () => ({ isPlatformAdmin: true, userId: "actor" }) };
    if (name === "@/lib/auth/password") return { hashPassword: async () => "bootstrap-hash" };
    if (name === "@/lib/auth/password-reset") return { createPasswordResetToken: async () => "opaque-invitation" };
    if (name === "@/lib/email") return { sendEmail: async () => { throw new Error("provider unavailable"); } };
    if (name === "@/lib/repositories/platform-admin") return {
      createFirstTenantAdmin: async () => ({ createdNewUser: newAccount, userId: "admin", tenantName: "tenant" }),
      PlatformAdminError: class extends Error {},
    };
    throw new Error(`Dependência inesperada: ${name}`);
  },
});
for (const existingAccount of [false, true]) {
  newAccount = !existingAccount;
  const response = await routeModule.exports.POST(new Request("http://localhost/api", {
    method: "POST", body: JSON.stringify({ name: "Administrador", email: "admin@example.test" }),
  }), { params: Promise.resolve({ id: tenantId }) });
  assert.equal(response.status, 201, "A criação confirmada deve continuar bem-sucedida após falha do e-mail.");
  assert.deepEqual(await response.json(), { ok: true, emailDelivery: "failed" });
}
console.log("first-admin: falha de entrega preserva resposta de cadastro confirmado para contas novas e existentes");
