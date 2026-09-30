import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isValidCnpj, isValidCpf, normalizeTaxDocument, validateClientDocument } from "../src/domain/client-document.ts";

assert.equal(normalizeTaxDocument("529.982.247-25"), "52998224725");
assert.equal(isValidCpf("52998224725"), true);
assert.equal(isValidCpf("11111111111"), false);
assert.equal(isValidCnpj("04252011000110"), true);
assert.equal(validateClientDocument("PJ", "04.252.011/0001-10").error, null);
assert.match(validateClientDocument("PF", "04.252.011/0001-10").error, /CPF/);

const migration = await readFile(new URL("../db/migrations/044_client_master_multitenant.sql", import.meta.url), "utf8");
const repository = await readFile(new URL("../src/lib/repositories/clients.ts", import.meta.url), "utf8");
const manager = await readFile(new URL("../src/components/client-manager.tsx", import.meta.url), "utf8");
const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
assert.match(migration, /document_normalized/);
assert.match(migration, /clients_tenant_document_normalized_uidx/);
assert.match(migration, /FORCE ROW LEVEL SECURITY/);
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
