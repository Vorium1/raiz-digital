import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { assertUniqueMigrationNumbers, buildAtomicMigrationSql } from "./migration-transaction.mjs";

const initial = await readFile(new URL("../db/migrations/001_initial.sql", import.meta.url), "utf8");
const tenancy = await readFile(new URL("../db/migrations/002_tenancy_and_imports.sql", import.meta.url), "utf8");
const identity = await readFile(new URL("../db/migrations/003_identity_and_persistence.sql", import.meta.url), "utf8");
const fieldOps = await readFile(new URL("../db/migrations/004_field_operations.sql", import.meta.url), "utf8");
const forceRls = await readFile(new URL("../db/migrations/005_force_row_level_security.sql", import.meta.url), "utf8");
const appRole = await readFile(new URL("../db/migrations/006_app_runtime_role.sql", import.meta.url), "utf8");
const appRolePortability = await readFile(new URL("../db/migrations/007_app_runtime_role_portability.sql", import.meta.url), "utf8");
const loginAttempts = await readFile(new URL("../db/migrations/008_login_attempts.sql", import.meta.url), "utf8");
const passwordReset = await readFile(new URL("../db/migrations/009_password_reset_tokens.sql", import.meta.url), "utf8");
const twoFactor = await readFile(new URL("../db/migrations/010_two_factor_auth.sql", import.meta.url), "utf8");
const totpReplay = await readFile(new URL("../db/migrations/011_totp_replay_protection.sql", import.meta.url), "utf8");
const agronomicFoundation = await readFile(new URL("../db/migrations/012_agronomic_intelligence_foundation.sql", import.meta.url), "utf8");
const aiLayer = await readFile(new URL("../db/migrations/013_ai_layer_and_crop_catalog.sql", import.meta.url), "utf8");
const reportBranding = await readFile(new URL("../db/migrations/014_report_branding.sql", import.meta.url), "utf8");
const areaHistory = await readFile(new URL("../db/migrations/015_area_history_and_input_audit.sql", import.meta.url), "utf8");
const platformCurator = await readFile(new URL("../db/migrations/016_platform_curator.sql", import.meta.url), "utf8");
const agronomicPrescription = await readFile(new URL("../db/migrations/017_agronomic_prescription.sql", import.meta.url), "utf8");
const knowledgeResearch = await readFile(new URL("../db/migrations/018_knowledge_research.sql", import.meta.url), "utf8");
const prescriptionLimit = await readFile(new URL("../db/migrations/019_tenant_prescription_limit.sql", import.meta.url), "utf8");
const conditionalRanges = await readFile(new URL("../db/migrations/020_conditional_sufficiency_ranges.sql", import.meta.url), "utf8");
const derivedParameters = await readFile(new URL("../db/migrations/021_derived_parameters.sql", import.meta.url), "utf8");
const sampleType = await readFile(new URL("../db/migrations/022_sample_type.sql", import.meta.url), "utf8");
const satelliteNdvi = await readFile(new URL("../db/migrations/023_satellite_ndvi.sql", import.meta.url), "utf8");
const parameterAiValidation = await readFile(new URL("../db/migrations/024_parameter_ai_cross_validation.sql", import.meta.url), "utf8");
const ruleExecutions = await readFile(new URL("../db/migrations/031_agronomic_rule_executions.sql", import.meta.url), "utf8");
const nitrogenContext = await readFile(new URL("../db/migrations/032_nitrogen_recommendation_context.sql", import.meta.url), "utf8");
const commercialInputCatalog = await readFile(new URL("../db/migrations/033_commercial_input_catalog.sql", import.meta.url), "utf8");
const commercialPlanSnapshots = await readFile(new URL("../db/migrations/034_commercial_plan_snapshots.sql", import.meta.url), "utf8");
const ndviRasterCustody = await readFile(new URL("../db/migrations/037_ndvi_raster_custody.sql", import.meta.url), "utf8");
const reportSnapshotRepublication = await readFile(new URL("../db/migrations/038_report_snapshot_republication.sql", import.meta.url), "utf8");
const reportRepublishOnNewNdvi = await readFile(new URL("../db/migrations/039_report_republish_on_new_ndvi.sql", import.meta.url), "utf8");
const migrationRunner = await readFile(new URL("./migrate.mjs", import.meta.url), "utf8");
const migrationFiles = (await readdir(new URL("../db/migrations/", import.meta.url)))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();

assert.match(initial, /CREATE EXTENSION IF NOT EXISTS postgis/i);
assert.match(tenancy, /CREATE POLICY tenant_isolation/i);
assert.match(tenancy, /analysis_import_rows/i);
assert.match(identity, /CREATE TABLE user_sessions/i);
assert.match(identity, /ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY/i);
assert.match(identity, /SECURITY DEFINER/i);
assert.match(identity, /app\.current_user_id/i);
assert.match(fieldOps, /ALTER TABLE collection_orders/i);
assert.match(fieldOps, /observed_position geometry\(Point,4326\)/i);
assert.match(fieldOps, /sample_points_observed_position_gix/i);
assert.match(fieldOps, /collection_orders_touch_updated_at/i);
assert.match(forceRls, /FORCE ROW LEVEL SECURITY/i);
assert.match(forceRls, /collection_orders/i);
assert.match(forceRls, /audit_events/i);
assert.match(appRole, /CREATE ROLE raiz_app/i);
assert.match(appRole, /NOBYPASSRLS/i);
assert.doesNotMatch(appRole, /\bSUPERUSER\b/i);
assert.match(appRolePortability, /ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT/i);
assert.match(loginAttempts, /CREATE TABLE login_attempts/i);
assert.match(loginAttempts, /login_attempts_email_idx/i);
assert.match(passwordReset, /CREATE TABLE password_reset_tokens/i);
assert.match(passwordReset, /token_hash text NOT NULL UNIQUE/i);
assert.match(twoFactor, /ALTER TABLE users ADD COLUMN totp_secret/i);
assert.match(twoFactor, /CREATE TABLE totp_backup_codes/i);
assert.match(twoFactor, /CREATE TABLE pending_two_factor_logins/i);
assert.match(totpReplay, /ALTER TABLE users ADD COLUMN totp_last_counter/i);
assert.match(agronomicFoundation, /CREATE TABLE crop_profiles/i);
assert.match(agronomicFoundation, /CREATE TABLE crop_profile_parameters/i);
assert.match(agronomicFoundation, /sufficiency_ranges jsonb/i);
assert.match(agronomicFoundation, /ALTER COLUMN rule_set_id DROP NOT NULL/i);
assert.match(agronomicFoundation, /not_interpretable_reason/i);
assert.doesNotMatch(agronomicFoundation, /sufficiency_ranges jsonb NOT NULL/i);
assert.match(aiLayer, /CREATE TABLE ai_generations/i);
assert.match(aiLayer, /FORCE ROW LEVEL SECURITY/i);
assert.match(aiLayer, /CREATE TABLE technical_sources/i);
assert.match(aiLayer, /ALTER TABLE crop_profiles ADD COLUMN crop_group/i);
assert.match(reportBranding, /ALTER TABLE tenants/i);
assert.match(reportBranding, /report_logo_data_url/i);
assert.match(reportBranding, /report_responsible_name/i);
assert.match(reportBranding, /report_responsible_registration/i);
assert.match(areaHistory, /ADD COLUMN IF NOT EXISTS next_cultivar/i);
assert.match(areaHistory, /ADD COLUMN IF NOT EXISTS is_first_year_area/i);
assert.match(areaHistory, /CREATE TABLE field_yield_history/i);
assert.match(areaHistory, /CREATE TABLE input_recommendations/i);
assert.match(areaHistory, /CREATE TABLE input_applications/i);
assert.match(areaHistory, /FORCE ROW LEVEL SECURITY/i);
assert.match(platformCurator, /ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_curator/i);
assert.match(agronomicPrescription, /ALTER TYPE ai_generation_kind ADD VALUE IF NOT EXISTS 'AGRONOMIC_PRESCRIPTION'/i);
assert.match(knowledgeResearch, /ALTER TYPE ai_generation_kind ADD VALUE IF NOT EXISTS 'KNOWLEDGE_RESEARCH'/i);
assert.match(prescriptionLimit, /ADD COLUMN IF NOT EXISTS monthly_prescription_limit/i);
assert.match(conditionalRanges, /ADD COLUMN condition_parameter_code/i);
assert.match(conditionalRanges, /crop_profile_parameters_unique_range/i);
assert.match(derivedParameters, /ADD COLUMN derived_parameter_code/i);
assert.match(sampleType, /ADD COLUMN sample_type text NOT NULL DEFAULT 'SOLO'/i);
assert.match(sampleType, /ALTER TABLE lab_samples/i);
assert.match(sampleType, /DROP CONSTRAINT crop_profile_parameters_unique_range/i);
assert.match(sampleType, /UNIQUE \(crop_profile_id, parameter_code, sample_type,/i);
assert.match(satelliteNdvi, /CREATE TABLE field_ndvi_snapshots/i);
assert.match(satelliteNdvi, /FORCE ROW LEVEL SECURITY/i);
assert.match(satelliteNdvi, /mean_ndvi numeric\(6,4\) NOT NULL CHECK \(mean_ndvi BETWEEN -1 AND 1\)/i);
assert.match(satelliteNdvi, /UNIQUE \(tenant_id,field_id,captured_at,source\)/i);
assert.match(parameterAiValidation, /ADD COLUMN ai_validation_status text NOT NULL DEFAULT 'NAO_VALIDADO'/i);
assert.match(parameterAiValidation, /CHECK \(ai_validation_status IN \('NAO_VALIDADO', 'CONSISTENTE', 'INCONSISTENTE', 'INDETERMINADO'\)\)/i);
assert.match(parameterAiValidation, /ai_validation_sources jsonb/i);

assert.match(ruleExecutions, /CREATE TABLE agronomic_rule_executions/i);
assert.match(ruleExecutions, /FORCE ROW LEVEL SECURITY/i);
assert.match(ruleExecutions, /GRANT SELECT, INSERT ON agronomic_rule_executions TO raiz_app/i);
assert.match(ruleExecutions, /REVOKE UPDATE, DELETE ON agronomic_rule_executions FROM raiz_app/i);

assert.match(nitrogenContext, /CREATE TABLE nitrogen_recommendation_contexts/i);
assert.match(nitrogenContext, /UNIQUE \(tenant_id,crop_season_id\)/i);
assert.match(nitrogenContext, /FORCE ROW LEVEL SECURITY/i);
assert.match(nitrogenContext, /effective_legume_inoculation IS TRUE AND proven_legume_inoculation_failure IS TRUE/i);
assert.match(nitrogenContext, /CREATE POLICY tenant_isolation ON nitrogen_recommendation_contexts/i);

assert.match(commercialInputCatalog, /CREATE TABLE commercial_input_products/i);
assert.match(commercialInputCatalog, /UNIQUE \(tenant_id, code\)/i);
assert.match(commercialInputCatalog, /FORCE ROW LEVEL SECURITY/i);
assert.match(commercialInputCatalog, /CREATE POLICY tenant_isolation ON commercial_input_products/i);
assert.match(commercialInputCatalog, /GRANT SELECT, INSERT, UPDATE ON commercial_input_products TO raiz_app/i);
assert.doesNotMatch(commercialInputCatalog, /GRANT[^;]*DELETE[^;]*commercial_input_products/i);
assert.match(commercialInputCatalog, /min_rate_kg_ha IS NULL OR max_rate_kg_ha IS NULL OR min_rate_kg_ha <= max_rate_kg_ha/i);

assert.match(commercialPlanSnapshots, /CREATE TABLE commercial_plan_snapshots/i);
assert.match(commercialPlanSnapshots, /source_targets jsonb NOT NULL/i);
assert.match(commercialPlanSnapshots, /product_snapshots jsonb NOT NULL/i);
assert.match(commercialPlanSnapshots, /engine_input jsonb NOT NULL/i);
assert.match(commercialPlanSnapshots, /engine_output jsonb NOT NULL/i);
assert.match(commercialPlanSnapshots, /FORCE ROW LEVEL SECURITY/i);
assert.match(commercialPlanSnapshots, /CREATE POLICY tenant_isolation ON commercial_plan_snapshots/i);
assert.match(commercialPlanSnapshots, /GRANT SELECT, INSERT ON commercial_plan_snapshots TO raiz_app/i);
assert.match(commercialPlanSnapshots, /REVOKE UPDATE, DELETE ON commercial_plan_snapshots FROM raiz_app/i);
assert.doesNotMatch(commercialPlanSnapshots, /GRANT[^;]*(UPDATE|DELETE)[^;]*commercial_plan_snapshots/i);

assert.match(ndviRasterCustody, /ADD COLUMN raster_object_key text/i);
assert.match(ndviRasterCustody, /field_ndvi_raster_metadata_all_or_none/i);
assert.match(ndviRasterCustody, /IF OLD\.raster_object_key IS NOT NULL THEN/i);
assert.match(ndviRasterCustody, /CREATE TRIGGER field_ndvi_snapshots_protect_archived/i);
assert.match(ndviRasterCustody, /BEFORE UPDATE OR DELETE ON field_ndvi_snapshots/i);
assert.match(ndviRasterCustody, /REVOKE DELETE ON field_ndvi_snapshots FROM raiz_app/i);

assert.match(reportSnapshotRepublication, /DROP CONSTRAINT IF EXISTS reports_tenant_id_interpretation_id_revision_key/i);
assert.match(reportSnapshotRepublication, /ADD COLUMN IF NOT EXISTS prescription_generation_id uuid/i);
assert.match(reportSnapshotRepublication, /CREATE UNIQUE INDEX IF NOT EXISTS ai_generations_tenant_interpretation_generation_uidx/i);
assert.match(reportSnapshotRepublication, /ON ai_generations \(tenant_id, interpretation_id, id\)/i);
assert.match(reportSnapshotRepublication, /approvedPrescriptionId/i);
assert.match(reportSnapshotRepublication, /ag\.kind = 'AGRONOMIC_PRESCRIPTION'/i);
assert.match(reportSnapshotRepublication, /ag\.interpretation_id = r\.interpretation_id/i);
assert.match(reportSnapshotRepublication, /FOREIGN KEY \(tenant_id, interpretation_id, prescription_generation_id\)/i);
assert.match(reportSnapshotRepublication, /REFERENCES ai_generations \(tenant_id, interpretation_id, id\)/i);
assert.match(reportSnapshotRepublication, /CREATE INDEX IF NOT EXISTS reports_decision_lookup_idx/i);
assert.match(reportSnapshotRepublication, /ON reports \(tenant_id, interpretation_id, prescription_generation_id, published_at DESC\)/i);
assert.match(reportSnapshotRepublication, /WHERE prescription_generation_id IS NOT NULL/i);
assert.doesNotMatch(reportSnapshotRepublication, /CREATE UNIQUE INDEX IF NOT EXISTS reports_decision_unique_idx/i);
assert.match(reportSnapshotRepublication, /CREATE INDEX IF NOT EXISTS reports_interpretation_published_idx/i);
assert.match(reportSnapshotRepublication, /ON reports \(tenant_id, interpretation_id, published_at DESC\)/i);

assert.match(reportRepublishOnNewNdvi, /DROP INDEX IF EXISTS reports_decision_unique_idx/i);
assert.match(reportRepublishOnNewNdvi, /CREATE INDEX IF NOT EXISTS reports_decision_lookup_idx/i);
assert.match(reportRepublishOnNewNdvi, /ON reports \(tenant_id, interpretation_id, prescription_generation_id, published_at DESC\)/i);
assert.match(reportRepublishOnNewNdvi, /WHERE prescription_generation_id IS NOT NULL/i);
assert.doesNotMatch(reportRepublishOnNewNdvi, /CREATE UNIQUE INDEX IF NOT EXISTS reports_decision_unique_idx/i);

assert.doesNotThrow(() => assertUniqueMigrationNumbers(migrationFiles));
for (const migrationName of migrationFiles) {
  const migrationSql = await readFile(new URL(`../db/migrations/${migrationName}`, import.meta.url), "utf8");
  assert.doesNotThrow(
    () => buildAtomicMigrationSql(migrationSql, migrationName),
    `Migration incompatível com o runner atômico: ${migrationName}`,
  );
}
assert.throws(
  () => assertUniqueMigrationNumbers(["039_a.sql", "039_b.sql"]),
  /Prefixo de migration duplicado 039/,
);

const wrapped = buildAtomicMigrationSql("BEGIN;\nSELECT 1;\nCOMMIT;", "040_atomic.sql");
assert.match(wrapped, /^BEGIN;/);
assert.match(wrapped, /SELECT 1;/);
assert.match(wrapped, /INSERT INTO schema_migrations\(name\) VALUES \('040_atomic\.sql'\);[\s\S]*COMMIT;$/);
assert.equal((wrapped.match(/\bBEGIN\s*;/gi) ?? []).length, 1);
assert.equal((wrapped.match(/\bCOMMIT\s*;/gi) ?? []).length, 1);

const unwrapped = buildAtomicMigrationSql("SELECT 2;", "041_wrapped.sql");
assert.match(unwrapped, /^BEGIN;/);
assert.match(unwrapped, /SELECT 2;/);
assert.match(unwrapped, /INSERT INTO schema_migrations\(name\) VALUES \('041_wrapped\.sql'\);/);
assert.match(unwrapped, /COMMIT;$/);
assert.throws(
  () => buildAtomicMigrationSql("BEGIN;\nSELECT 3;", "042_incomplete.sql"),
  /wrapper transacional incompleto/,
);

assert.match(migrationRunner, /assertUniqueMigrationNumbers\(files\)/);
assert.match(migrationRunner, /pool\.query\(buildAtomicMigrationSql\(sql, name\)\)/);
assert.doesNotMatch(migrationRunner, /pool\.query\("INSERT INTO schema_migrations\(name\)/);

console.log("migrations: contratos estruturais críticos até 039 aprovados");
