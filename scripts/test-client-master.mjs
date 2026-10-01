import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import { readFile } from "node:fs/promises";
import { formatClientDocument, isValidCnpj, isValidCpf, normalizeTaxDocument, validateClientDocument } from "../src/domain/client-document.ts";

assert.equal(normalizeTaxDocument("529.982.247-25"), "52998224725");
assert.equal(isValidCpf("52998224725"), true);
assert.equal(isValidCpf("11111111111"), false);
assert.match(validateClientDocument("PF", "documento inválido").error, /CPF/);
assert.equal(validateClientDocument("PF", " ").normalized, null);
assert.equal(isValidCnpj("04252011000110"), true);
assert.equal(validateClientDocument("PJ", "04.252.011/0001-10").error, null);
assert.match(validateClientDocument("PF", "04.252.011/0001-10").error, /CPF/);

const migration = await readFile(new URL("../db/migrations/044_client_master_multitenant.sql", import.meta.url), "utf8");
const contactMigration = await readFile(new URL("../db/migrations/045_client_contact_address.sql", import.meta.url), "utf8");
const repository = await readFile(new URL("../src/lib/repositories/clients.ts", import.meta.url), "utf8");
const manager = await readFile(new URL("../src/components/client-manager.tsx", import.meta.url), "utf8");
const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
assert.match(migration, /document_normalized/);
assert.match(migration, /clients_tenant_document_normalized_uidx/);
assert.match(migration, /FORCE ROW LEVEL SECURITY/);
assert.match(contactMigration, /whatsapp/);
assert.match(contactMigration, /postal_code/);
assert.match(contactMigration, /municipality/);
assert.match(contactMigration, /country/);
assert.match(repository, /archived_at IS NULL/);
assert.match(repository, /tenant_id = \$1::uuid AND id = \$2::uuid/);
assert.match(repository, /getClient360/);
assert.match(repository, /c\.notes/);
assert.match(repository, /Já existe um cliente com este CPF\/CNPJ nesta empresa\./);
assert.match(repository, /fields\.rows\.filter/);
assert.match(repository, /p\.tenant_id = \$1::uuid AND p\.client_id = \$2::uuid/);
assert.match(manager, /\/clientes\/\$\{client\.id\}/);
assert.match(ci, /npm run test:client-master/);
console.log("client-master: documento normalizado, arquivo lógico e contrato tenant aprovados");

// Execute real handlers with repositories injected; rejected requests must never write.
class ClientError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
async function loadClientRoute(path, role, write) {
  const source = await readFile(new URL(`../src/app/api/${path}/route.ts`, import.meta.url), "utf8");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, {
    exports, Response, Error, SyntaxError,
    require: () => ({
      getPlatformSession: async () => role ? { role, tenantId: "session-tenant", userId: "session-user" } : null,
      ClientError, validateClientDocument,
      createClient: write, updateClient: write,
    }),
  });
  return exports;
}
const clientBody = { name: "Cadastro de teste", personType: "PF" };
for (const [path, method] of [["clients", "POST"], ["clients/[id]", "PATCH"]]) {
  const request = body => new Request("https://test.invalid", { method, body: JSON.stringify(body) });
  for (const role of [null, "VIEWER", "FIELD_TECH", "CLIENT"]) {
    const handler = await loadClientRoute(path, role, () => { assert.fail("unauthorized write"); });
    assert.equal((await handler[method](request(clientBody), { params: Promise.resolve({ id: "client-id" }) })).status, role ? 403 : 401);
  }
  const invalidBody = await loadClientRoute(path, "TENANT_ADMIN", () => { assert.fail("invalid body write"); });
  assert.equal((await invalidBody[method](request(null), { params: Promise.resolve({ id: "client-id" }) })).status, 400);
  const invalidCountry = await loadClientRoute(path, "TENANT_ADMIN", () => { assert.fail("invalid country write"); });
  assert.equal((await invalidCountry[method](request({ ...clientBody, country: "BRA" }), { params: Promise.resolve({ id: "client-id" }) })).status, 400);
  const duplicate = await loadClientRoute(path, "TENANT_ADMIN", async input => {
    assert.equal(input.tenantId, "session-tenant");
    throw new ClientError("Documento duplicado", 409);
  });
  const response = await duplicate[method](request({ ...clientBody, tenantId: "untrusted-tenant" }), { params: Promise.resolve({ id: "client-id" }) });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "Documento duplicado");
  const failure = await loadClientRoute(path, "TENANT_ADMIN", async () => { throw new Error("private database detail"); });
  const failed = await failure[method](request(clientBody), { params: Promise.resolve({ id: "client-id" }) });
  assert.equal(failed.status, 422);
  assert.doesNotMatch(JSON.stringify(await failed.json()), /private database detail/);
}
console.log("client-master: rotas reais validam país, RBAC, tenant da sessão, duplicidade e erros privados");

assert.equal(formatClientDocument("52998224725"), "529.982.247-25");
assert.equal(formatClientDocument("04252011000110"), "04.252.011/0001-10");
assert.equal(formatClientDocument(null), "Não informado");
assert.equal(formatClientDocument("legado"), "legado");
// Execute the read model with an injected database transaction. Every related
// record query must preserve the session tenant and selected client.
const readExports = {};
let queryIndex = 0;
const readFixtures = [
  [{ id: "client-id", name: "Teste", properties: 1 }],
  [{ id: "property-id", name: "Propriedade" }],
  [{ id: "field-id", propertyId: "property-id", name: "Talhão" }],
  [{ id: "season-id", fieldId: "field-id", seasonLabel: "Safra registrada" }],
  [{ id: "analysis-id", code: "Análise" }],
  [{ id: "report-id", analysisId: "analysis-id", revision: 1 }],
  [{ id: "audit-id", action: "CLIENT_CREATED", entityType: "client" }],
];
vm.runInNewContext(ts.transpileModule(repository, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText, {
  exports: readExports, Error,
  require: () => ({ withTenant: async (context, callback) => {
    assert.equal(context.tenantId, "session-tenant");
    return callback({ query: async (sql, params) => {
      assert.deepEqual(Array.from(params), ["session-tenant", "client-id"]);
      assert.match(sql, /tenant_id = \$1::uuid/);
      if (queryIndex === 6) {
        assert.match(sql, /e\.entity_type = ae\.entity_type/);
        assert.doesNotMatch(sql, /actor_user_id|ae\.metadata|users/);
      }
      return { rows: readFixtures[queryIndex++] };
    } });
  } }),
});
const overview = await readExports.getClient360("session-tenant", "client-id", "session-user");
assert.equal(queryIndex, 7);
assert.equal(overview.properties[0].fields[0].id, "field-id");
assert.equal(overview.seasons[0].id, "season-id");
assert.equal(overview.analyses[0].id, "analysis-id");
assert.equal(overview.reports[0].id, "report-id");
assert.equal(overview.history[0].id, "audit-id");
console.log("client-master: Cliente 360° entrega safras, análises, publicações e histórico sem identidade global");

const legacyEdit = await loadClientRoute("clients/[id]", "TENANT_ADMIN", (input) => {
  assert.equal(input.country, null, "legacy edit must not invent country");
  return { id: input.clientId };
});
assert.equal((await legacyEdit.PATCH(new Request("https://test.invalid", { method: "PATCH", body: JSON.stringify(clientBody) }), { params: Promise.resolve({ id: "client-id" }) })).status, 200);
assert.match(repository.slice(repository.indexOf("export async function updateClient(")), /input\.country \?\? ""/);
