import { Pool } from "pg";

export type SchemaRepairResult = {
  ok: boolean;
  repairedMigrations: string[];
  missingAfter: string[];
  errorCode?: string;
};

const EXPECTED_MIGRATIONS = [
  "035_analysis_depth_context.sql",
  "036_technical_source_transferability.sql",
  "037_ndvi_raster_custody.sql",
] as const;

function adminDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw Object.assign(new Error("DATABASE_URL administrativa não configurada."), { code: "ADMIN_DATABASE_URL_MISSING" });
  return value;
}

async function missingSchema(client: import("pg").PoolClient) {
  const result = await client.query<{ name: string }>(`
    WITH required(table_name, column_name) AS (
      VALUES
        ('analyses','requested_analysis_depth'),
        ('analyses','analysis_context'),
        ('technical_sources','evidence_type'),
        ('technical_sources','context_profile'),
        ('field_ndvi_snapshots','raster_object_key'),
        ('field_ndvi_snapshots','raster_sha256'),
        ('field_ndvi_snapshots','raster_archived_at')
    )
    SELECT required.table_name || '.' || required.column_name AS name
      FROM required
      LEFT JOIN information_schema.columns c
        ON c.table_schema = 'public'
       AND c.table_name = required.table_name
       AND c.column_name = required.column_name
     WHERE c.column_name IS NULL
     ORDER BY 1
  `);
  return result.rows.map((row) => row.name);
}

export async function repairSchema035to037(): Promise<SchemaRepairResult> {
  const pool = new Pool({
    connectionString: adminDatabaseUrl(),
    ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
    max: 1,
    connectionTimeoutMillis: 8_000,
  });
  const client = await pool.connect();
  const repairedMigrations: string[] = [];

  try {
    await client.query("BEGIN");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

    // 035 — profundidade/contexto da análise. ADD COLUMN/constraints idempotentes.
    await client.query(`ALTER TABLE analyses
      ADD COLUMN IF NOT EXISTS requested_analysis_depth text,
      ADD COLUMN IF NOT EXISTS analysis_context jsonb NOT NULL DEFAULT '{}'::jsonb`);
    await client.query(`DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analyses_requested_analysis_depth_chk') THEN
          ALTER TABLE analyses ADD CONSTRAINT analyses_requested_analysis_depth_chk CHECK (
            requested_analysis_depth IS NULL OR requested_analysis_depth IN (
              'interpretacao-rapida','recomendacao-manejo','analise-completa-campo','diagnostico-360','personalizada'
            )
          );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analyses_analysis_context_object_chk') THEN
          ALTER TABLE analyses ADD CONSTRAINT analyses_analysis_context_object_chk
            CHECK (jsonb_typeof(analysis_context) = 'object');
        END IF;
      END $$`);
    await client.query(`INSERT INTO schema_migrations(name) VALUES ('035_analysis_depth_context.sql') ON CONFLICT (name) DO NOTHING`);
    repairedMigrations.push("035_analysis_depth_context.sql");

    // 036 — metadados de transferibilidade científica.
    await client.query(`ALTER TABLE technical_sources
      ADD COLUMN IF NOT EXISTS evidence_type text NOT NULL DEFAULT 'UNCLASSIFIED',
      ADD COLUMN IF NOT EXISTS evidence_strength text NOT NULL DEFAULT 'UNASSESSED',
      ADD COLUMN IF NOT EXISTS context_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS critical_dimensions text[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS requires_local_calibration boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS requires_agronomist_review boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS quantitative_use_status text NOT NULL DEFAULT 'CONTEXT_ONLY',
      ADD COLUMN IF NOT EXISTS quantitative_applicability_approved boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS homologated_rule_id text,
      ADD COLUMN IF NOT EXISTS source_locator text,
      ADD COLUMN IF NOT EXISTS source_url text,
      ADD COLUMN IF NOT EXISTS doi text,
      ADD COLUMN IF NOT EXISTS study_design text,
      ADD COLUMN IF NOT EXISTS peer_reviewed boolean`);
    await client.query(`DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'technical_sources_evidence_type_chk') THEN
          ALTER TABLE technical_sources ADD CONSTRAINT technical_sources_evidence_type_chk CHECK (evidence_type IN ('UNCLASSIFIED','MECHANISTIC','CALIBRATED_RESPONSE','MULTILOCATION_TRIAL','CONTROLLED_FIELD_TRIAL','OBSERVATIONAL_FIELD','REGIONAL_MANUAL','SYSTEMATIC_REVIEW','META_ANALYSIS'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'technical_sources_evidence_strength_chk') THEN
          ALTER TABLE technical_sources ADD CONSTRAINT technical_sources_evidence_strength_chk CHECK (evidence_strength IN ('UNASSESSED','DIRECT_STRONG','TRANSFERRED_STRONG','MODERATE','EXPERIMENTAL','OBSERVATIONAL','CONFLICTING','INSUFFICIENT'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'technical_sources_context_profile_object_chk') THEN
          ALTER TABLE technical_sources ADD CONSTRAINT technical_sources_context_profile_object_chk CHECK (jsonb_typeof(context_profile) = 'object');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'technical_sources_quantitative_use_status_chk') THEN
          ALTER TABLE technical_sources ADD CONSTRAINT technical_sources_quantitative_use_status_chk CHECK (quantitative_use_status IN ('CONTEXT_ONLY','REVIEW_ONLY','HOMOLOGATED_DETERMINISTIC'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'technical_sources_homologated_rule_guard_chk') THEN
          ALTER TABLE technical_sources ADD CONSTRAINT technical_sources_homologated_rule_guard_chk CHECK (quantitative_use_status <> 'HOMOLOGATED_DETERMINISTIC' OR (homologated_rule_id IS NOT NULL AND length(trim(homologated_rule_id)) > 0 AND quantitative_applicability_approved = true));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'technical_sources_quantitative_approval_guard_chk') THEN
          ALTER TABLE technical_sources ADD CONSTRAINT technical_sources_quantitative_approval_guard_chk CHECK (quantitative_applicability_approved = false OR (quantitative_use_status = 'HOMOLOGATED_DETERMINISTIC' AND homologated_rule_id IS NOT NULL AND length(trim(homologated_rule_id)) > 0));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'technical_sources_rule_id_guard_chk') THEN
          ALTER TABLE technical_sources ADD CONSTRAINT technical_sources_rule_id_guard_chk CHECK (homologated_rule_id IS NULL OR quantitative_use_status = 'HOMOLOGATED_DETERMINISTIC');
        END IF;
      END $$`);
    await client.query(`CREATE INDEX IF NOT EXISTS technical_sources_evidence_type_idx ON technical_sources (evidence_type, evidence_strength, status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS technical_sources_context_profile_gin ON technical_sources USING gin (context_profile)`);
    await client.query(`INSERT INTO schema_migrations(name) VALUES ('036_technical_source_transferability.sql') ON CONFLICT (name) DO NOTHING`);
    repairedMigrations.push("036_technical_source_transferability.sql");

    // 037 — cadeia de custódia NDVI e imutabilidade no PostgreSQL.
    await client.query(`ALTER TABLE field_ndvi_snapshots
      ADD COLUMN IF NOT EXISTS raster_object_key text,
      ADD COLUMN IF NOT EXISTS raster_sha256 text,
      ADD COLUMN IF NOT EXISTS raster_bytes integer,
      ADD COLUMN IF NOT EXISTS raster_bbox jsonb,
      ADD COLUMN IF NOT EXISTS raster_width integer,
      ADD COLUMN IF NOT EXISTS raster_height integer,
      ADD COLUMN IF NOT EXISTS raster_algorithm text,
      ADD COLUMN IF NOT EXISTS raster_mosaicking_order text,
      ADD COLUMN IF NOT EXISTS raster_archived_at timestamptz`);
    await client.query(`DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_ndvi_raster_sha256_format') THEN
          ALTER TABLE field_ndvi_snapshots ADD CONSTRAINT field_ndvi_raster_sha256_format CHECK (raster_sha256 IS NULL OR raster_sha256 ~ '^[0-9a-f]{64}$');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_ndvi_raster_bytes_positive') THEN
          ALTER TABLE field_ndvi_snapshots ADD CONSTRAINT field_ndvi_raster_bytes_positive CHECK (raster_bytes IS NULL OR raster_bytes > 0);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_ndvi_raster_dimensions_positive') THEN
          ALTER TABLE field_ndvi_snapshots ADD CONSTRAINT field_ndvi_raster_dimensions_positive CHECK ((raster_width IS NULL AND raster_height IS NULL) OR (raster_width > 0 AND raster_height > 0));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_ndvi_raster_bbox_shape') THEN
          ALTER TABLE field_ndvi_snapshots ADD CONSTRAINT field_ndvi_raster_bbox_shape CHECK (raster_bbox IS NULL OR (jsonb_typeof(raster_bbox) = 'array' AND jsonb_array_length(raster_bbox) = 4));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_ndvi_raster_metadata_all_or_none') THEN
          ALTER TABLE field_ndvi_snapshots ADD CONSTRAINT field_ndvi_raster_metadata_all_or_none CHECK (
            (raster_object_key IS NULL AND raster_sha256 IS NULL AND raster_bytes IS NULL AND raster_bbox IS NULL AND raster_width IS NULL AND raster_height IS NULL AND raster_algorithm IS NULL AND raster_mosaicking_order IS NULL AND raster_archived_at IS NULL)
            OR
            (raster_object_key IS NOT NULL AND raster_sha256 IS NOT NULL AND raster_bytes IS NOT NULL AND raster_bbox IS NOT NULL AND raster_width IS NOT NULL AND raster_height IS NOT NULL AND raster_algorithm IS NOT NULL AND raster_mosaicking_order IS NOT NULL AND raster_archived_at IS NOT NULL)
          );
        END IF;
      END $$`);
    await client.query(`CREATE INDEX IF NOT EXISTS field_ndvi_snapshots_raster_idx ON field_ndvi_snapshots (tenant_id, field_id, captured_at DESC) WHERE raster_object_key IS NOT NULL`);
    await client.query(`CREATE OR REPLACE FUNCTION protect_archived_ndvi_snapshot()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.raster_object_key IS NOT NULL THEN
          RAISE EXCEPTION 'Archived NDVI snapshot is immutable' USING ERRCODE = '55000';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END; $$`);
    await client.query(`DROP TRIGGER IF EXISTS field_ndvi_snapshots_protect_archived ON field_ndvi_snapshots`);
    await client.query(`CREATE TRIGGER field_ndvi_snapshots_protect_archived BEFORE UPDATE OR DELETE ON field_ndvi_snapshots FOR EACH ROW EXECUTE FUNCTION protect_archived_ndvi_snapshot()`);
    await client.query(`REVOKE DELETE ON field_ndvi_snapshots FROM raiz_app`);
    await client.query(`INSERT INTO schema_migrations(name) VALUES ('037_ndvi_raster_custody.sql') ON CONFLICT (name) DO NOTHING`);
    repairedMigrations.push("037_ndvi_raster_custody.sql");

    const missingAfter = await missingSchema(client);
    if (missingAfter.length > 0) {
      throw Object.assign(new Error("Schema continua incompleto após reparo."), { code: "SCHEMA_REPAIR_INCOMPLETE" });
    }

    await client.query("COMMIT");
    return { ok: true, repairedMigrations, missingAfter };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    const code = error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "SCHEMA_REPAIR_FAILED";
    return { ok: false, repairedMigrations: [], missingAfter: [], errorCode: code };
  } finally {
    client.release();
    await pool.end();
  }
}

export { EXPECTED_MIGRATIONS };
