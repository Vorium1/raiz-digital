import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { assertUniqueMigrationNumbers, buildAtomicMigrationSql } from "./migration-transaction.mjs";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL obrigatória para executar migrations.");

const here = dirname(fileURLToPath(import.meta.url));
const migrationDir = join(here, "..", "db", "migrations");
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});
const client = await pool.connect();
let migrationLockHeld = false;

try {
  await client.query("SELECT pg_advisory_lock(hashtext('raiz-digital'), hashtext('schema-migrations'))");
  migrationLockHeld = true;

  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const appliedRows = await client.query("SELECT name FROM schema_migrations");
  const applied = new Set(appliedRows.rows.map((row) => row.name));
  const files = (await readdir(migrationDir)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  assertUniqueMigrationNumbers(files);

  for (const name of files) {
    if (applied.has(name)) {
      console.log(`skip ${name}`);
      continue;
    }
    const sql = await readFile(join(migrationDir, name), "utf8");
    console.log(`apply ${name}`);
    await client.query(buildAtomicMigrationSql(sql, name));
  }
  console.log("migrations: banco atualizado");
} finally {
  if (migrationLockHeld) {
    await client.query("SELECT pg_advisory_unlock(hashtext('raiz-digital'), hashtext('schema-migrations'))").catch(() => {});
  }
  client.release();
  await pool.end();
}
