import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, Response, require: () => dependencies });
  return exports;
}
class CatalogError extends Error { constructor(message, status) { super(message); this.status = status; } }
const cases = [
  ['properties', 'createProperty', { clientId: 'foreign-id', name: 'E2E', municipality: 'E2E', state: 'RS' }, ['SUPER_ADMIN', 'TENANT_ADMIN', 'AGRONOMIST', 'FIELD_TECH', 'COMMERCIAL']],
  ['fields', 'createField', { propertyId: 'foreign-id', name: 'E2E', boundary: { type: 'Polygon', coordinates: [] } }, ['SUPER_ADMIN', 'TENANT_ADMIN', 'AGRONOMIST', 'FIELD_TECH']],
];
for (const [resource, fn, body, roles] of cases) {
  for (const role of [null, 'VIEWER', 'COMMERCIAL', 'FIELD_TECH', 'AGRONOMIST', 'TENANT_ADMIN', 'SUPER_ADMIN']) {
    let calls = 0;
    const handlers = load(`src/app/api/${resource}/route.ts`, {
      getPlatformSession: async () => role ? { role, tenantId: 'tenant-a', userId: 'actor-a' } : null,
      CatalogError,
      [fn]: async (input) => {
        calls++;
        assert.equal(input.tenantId, 'tenant-a');
        assert.equal(input.userId, 'actor-a');
        throw new CatalogError('Não encontrado.', 404);
      },
    });
    const result = await handlers.POST(new Request('https://e2e.invalid', { method: 'POST', body: JSON.stringify(body) }));
    assert.equal(result.status, role ? roles.includes(role) ? 404 : 403 : 401);
    assert.equal(calls, role && roles.includes(role) ? 1 : 0);
  }
}
// Execute the real repository: no visible parent must mean no child or audit write.
for (const [fn, input] of [
  ['createProperty', { tenantId: 'tenant-a', userId: 'actor-a', clientId: 'foreign-id', name: 'E2E' }],
  ['createField', { tenantId: 'tenant-a', userId: 'actor-a', propertyId: 'foreign-id', name: 'E2E', boundary: {} }],
]) {
  let audited = false;
  const repository = load('src/lib/repositories/catalog.ts', {
    withTenant: async (context, work) => {
      assert.equal(context.tenantId, 'tenant-a');
      return work({ query: async (sql, values) => {
        assert.equal(values[0], 'tenant-a');
        assert.equal(values[1], 'foreign-id');
        assert.match(sql, /tenant_id = \$1::uuid AND [\w.]*id = \$2::uuid/);
        return { rows: [] };
      } });
    },
    writeAudit: async () => { audited = true; },
  });
  await assert.rejects(repository[fn](input), error => error.status === 404);
  assert.equal(audited, false);
}
console.log('tenant-catalog-routes: RBAC, tenant de sessão e pais invisíveis retornam 404 sem escrita/auditoria.');
