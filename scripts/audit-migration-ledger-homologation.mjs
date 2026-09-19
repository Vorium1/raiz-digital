import pg from "pg";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { Pool } = pg;
const databaseUrl = (process.env.HOMOLOGATION_DATABASE_URL ?? process.env.DATABASE_URL ?? "").trim();
if (!databaseUrl) throw new Error("HOMOLOGATION_DATABASE_URL/DATABASE_URL ausente.");

const here = dirname(fileURLToPath(import.meta.url));
const migrationDir = join(here, "..", "db", "migrations");
const migrationFiles = (await readdir(migrationDir))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

const client = await pool.connect();
let txOpen = false;
try {
  await client.query("BEGIN READ ONLY");
  txOpen = true;

  const guard = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema='public' AND table_name='homologation_write_guard'
     ) AS has_guard_table`,
  );
  if (guard.rows[0]?.has_guard_table !== true) {
    throw new Error("Ambiente não possui sentinela de homologação esperada.");
  }

  const sentinel = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM homologation_write_guard
       WHERE guard_key='PR88_CABEDA_OFFICIAL_RESULT'
     ) AS authorized`,
  );
  if (sentinel.rows[0]?.authorized !== true) {
    throw new Error("Sentinela PR88_CABEDA_OFFICIAL_RESULT ausente.");
  }

  const ledger = await client.query("SELECT name FROM schema_migrations ORDER BY name");
  const applied = new Set(ledger.rows.map((row) => String(row.name)));
  const missingFromLedger = migrationFiles.filter((name) => !applied.has(name));
  const unknownInLedger = [...applied].filter((name) => !migrationFiles.includes(name)).sort();

  const schema = await client.query(
    `SELECT
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='reports'
           AND column_name='prescription_generation_id'
       ) AS has_prescription_link,
       EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname='reports_prescription_generation_fk'
       ) AS has_prescription_fk,
       EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname='public' AND tablename='reports'
           AND indexname='reports_decision_lookup_idx'
       ) AS has_decision_lookup,
       EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname='public' AND tablename='reports'
           AND indexname='reports_decision_unique_idx'
       ) AS has_legacy_decision_unique`,
  );
  const row = schema.rows[0] ?? {};
  const reportRepublicationContract = Boolean(
    row.has_prescription_link
      && row.has_prescription_fk
      && row.has_decision_lookup
      && !row.has_legacy_decision_unique,
  );

  const missingReportMigrations = missingFromLedger.filter((name) => /^03[89]_/.test(name));
  const schemaAheadOfLedger = reportRepublicationContract && missingReportMigrations.length > 0;

  await client.query("ROLLBACK");
  txOpen = false;

  console.log(JSON.stringify({
    environment: "isolated-homologation-read-only",
    mode: "BEGIN READ ONLY + ROLLBACK",
    migrationFileCount: migrationFiles.length,
    ledgerAppliedCount: applied.size,
    lastRecordedMigration: ledger.rows.at(-1)?.name ?? null,
    missingFromLedger,
    unknownInLedger,
    reportRepublicationContract,
    schemaAheadOfLedger,
    requiresLedgerReconciliation: schemaAheadOfLedger || unknownInLedger.length > 0,
    note: schemaAheadOfLedger
      ? "O schema físico já contém o contrato de republicação, mas o ledger ainda não registra todas as migrations correspondentes. Não reaplicar/promover sem reconciliar o ledger de forma controlada."
      : "Schema e ledger não apresentaram o drift conhecido de republicação.",
  }, null, 2));
} finally {
  if (txOpen) await client.query("ROLLBACK").catch(() => {});
  client.release();
  await pool.end().catch(() => {});
}
