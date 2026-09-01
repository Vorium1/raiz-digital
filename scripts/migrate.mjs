import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL obrigatória para executar migrations.");

const here = dirname(fileURLToPath(import.meta.url));
const migrationDir = join(here, "..", "db", "migrations");
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const appliedRows = await pool.query("SELECT name FROM schema_migrations");
  const applied = new Set(appliedRows.rows.map((row) => row.name));
  const files = (await readdir(migrationDir)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();

  for (const name of files) {
    if (applied.has(name)) {
      console.log(`skip ${name}`);
      continue;
    }
    const sql = await readFile(join(migrationDir, name), "utf8");
    console.log(`apply ${name}`);
    await pool.query(sql);
    await pool.query("INSERT INTO schema_migrations(name) VALUES ($1)", [name]);
  }
  console.log("migrations: banco atualizado");
} finally {
  await pool.end();
}
