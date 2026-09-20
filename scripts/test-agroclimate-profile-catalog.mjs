import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("db/migrations/041_agroclimate_profile_catalog.sql", "utf8");
const repository = readFileSync("src/lib/repositories/agroclimate-profiles.ts", "utf8");
const route = readFileSync("src/app/api/agroclimate-profiles/route.ts", "utf8");
const statusRoute = readFileSync("src/app/api/agroclimate-profiles/[id]/status/route.ts", "utf8");
const runtimeCatalog = readFileSync("src/lib/agroclimate/runtime-catalog.ts", "utf8");

assert.match(migration, /CREATE TABLE IF NOT EXISTS agroclimate_profiles/);
assert.match(migration, /technical_region_code text NOT NULL REFERENCES technical_regions\(code\)/);
assert.match(migration, /status crop_profile_status NOT NULL DEFAULT 'DRAFT'/);
assert.match(migration, /PHYSIOLOGY/);
assert.match(migration, /REGIONAL_CLIMATE/);
assert.match(migration, /DISEASE/);
assert.match(migration, /ZARC_CONTEXT/);

assert.match(repository, /listActiveAgroclimateProfilesForContext/);
assert.match(repository, /ap\.technical_region_code = ANY\(\$2::text\[\]\)/);
assert.match(repository, /ap\.status = 'ACTIVE'/);
assert.match(repository, /ts\.status = 'ACTIVE'/);
assert.match(repository, /Região técnica resolvida é obrigatória/);
assert.match(repository, /A fonte técnica precisa estar ACTIVE antes da homologação do perfil/);
assert.match(repository, /adaptAgroclimateCatalogRows/);
assert.match(repository, /Payload agroclimático inválido para homologação/);
assert.match(repository, /AGROCLIMATE_PROFILE_CREATED/);
assert.match(repository, /AGROCLIMATE_PROFILE_STATUS_CHANGED/);

assert.match(route, /Somente o curador da plataforma pode cadastrar perfis agroclimáticos/);
assert.match(route, /technicalRegionCode/);
assert.match(route, /technicalSourceId/);
assert.match(statusRoute, /Somente o curador da plataforma pode homologar perfis agroclimáticos/);
assert.match(statusRoute, /setAgroclimateProfileStatus/);
assert.match(runtimeCatalog, /listActiveAgroclimateProfilesForContext/);
assert.match(runtimeCatalog, /adaptAgroclimateCatalogRows/);
assert.match(runtimeCatalog, /perfis agroclimáticos ACTIVE incompatíveis com o runtime/);

console.log("agroclimate-profile-catalog: versionamento, fonte, região e homologação validados");
