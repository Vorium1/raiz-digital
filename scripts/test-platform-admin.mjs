import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const migration = await read("db/migrations/046_platform_admin_console.sql");
const session = await read("src/lib/auth/session.ts");
const repository = await read("src/lib/repositories/platform-admin.ts");
const listRoute = await read("src/app/api/platform/tenants/route.ts");
const statusRoute = await read("src/app/api/platform/tenants/[id]/route.ts");
const adminRoute = await read("src/app/api/platform/tenants/[id]/first-admin/route.ts");
const page = await read("src/app/(platform)/administracao/empresas/page.tsx");
const manager = await read("src/components/platform-tenant-manager.tsx");
const script = await read("scripts/set-platform-admin.mjs");

assert.match(migration, /is_platform_admin boolean NOT NULL DEFAULT false/);
assert.match(migration, /platform_audit_events/);
assert.doesNotMatch(migration, /is_platform_curator.*admin/i);
assert.match(session, /isPlatformAdmin: boolean/);
assert.match(session, /u\.is_platform_admin AS "isPlatformAdmin"/);

for (const route of [listRoute, statusRoute, adminRoute]) {
  assert.match(route, /session\.isPlatformAdmin/);
  assert.match(route, /status: 403/);
}
assert.match(page, /if \(!session\.isPlatformAdmin\) notFound\(\)/);
assert.match(repository, /"activeAdmins"/);
assert.match(repository, /withTenant\(\{ tenantId: tenant\.id \}/);
assert.doesNotMatch(repository, /FROM clients c/);
assert.doesNotMatch(repository, /FROM properties p/);
assert.doesNotMatch(repository, /FROM fields f/);
assert.match(repository, /role IN \('SUPER_ADMIN','TENANT_ADMIN'\)/);
assert.match(manager, /tenant\.activeAdmins === 0/);
assert.match(repository, /platform_audit_events/);
assert.match(repository, /TENANT_CREATED/);
assert.match(repository, /TENANT_STATUS_CHANGED/);
assert.match(repository, /TENANT_FIRST_ADMIN_CREATED/);
assert.match(script, /PLATFORM_ADMIN_EMAIL/);
assert.match(script, /PLATFORM_ADMIN_VALUE/);

console.log("platform-admin: administração global separada de curadoria/tenant, auditada e protegida por gate explícito");
