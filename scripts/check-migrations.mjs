import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const initial = await readFile(new URL("../db/migrations/001_initial.sql", import.meta.url), "utf8");
const tenancy = await readFile(new URL("../db/migrations/002_tenancy_and_imports.sql", import.meta.url), "utf8");
const identity = await readFile(new URL("../db/migrations/003_identity_and_persistence.sql", import.meta.url), "utf8");

assert.match(initial, /CREATE EXTENSION IF NOT EXISTS postgis/i);
assert.match(tenancy, /CREATE POLICY tenant_isolation/i);
assert.match(tenancy, /analysis_import_rows/i);
assert.match(identity, /CREATE TABLE user_sessions/i);
assert.match(identity, /ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY/i);
assert.match(identity, /SECURITY DEFINER/i);
assert.match(identity, /app\.current_user_id/i);
console.log("migrations: contratos estruturais 001-003 aprovados");
