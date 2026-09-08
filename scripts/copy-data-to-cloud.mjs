import pg from "pg";

/**
 * Copia todo o dado real do Postgres local (SOURCE_DATABASE_URL) pro banco na nuvem recém-migrado
 * (TARGET_DATABASE_URL, ex.: Neon) -- pra publicação online nascer com os dados reais (Cabeda, Fazenda
 * Bela Vista) em vez de vazia. Não usa pg_dump/pg_restore (indisponíveis neste ambiente) -- lê tabela
 * por tabela, na mesma ordem de dependência das migrations, e reinsere linha por linha usando os tipos
 * reais de cada coluna (jsonb precisa de cast explícito, geometry/array passam direto). Usa sempre o
 * papel administrativo (bypassa RLS) nos dois lados -- é cópia de infraestrutura, não uma operação de
 * aplicação sujeita a isolamento de tenant.
 */

const { Pool } = pg;
const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL;
if (!sourceUrl || !targetUrl) throw new Error("SOURCE_DATABASE_URL e TARGET_DATABASE_URL são obrigatórias.");

const TABLES_IN_DEPENDENCY_ORDER = [
  "tenants", "users", "tenant_members", "clients", "properties", "fields", "crop_seasons",
  "collection_orders", "sample_points", "laboratories", "analyses", "lab_samples", "lab_results",
  "rule_sets", "interpretations", "reports", "subscriptions", "referral_commissions", "invoices",
  "payment_events", "business_calendar", "audit_events", "analysis_imports", "analysis_import_rows",
  "user_sessions", "login_attempts", "password_reset_tokens", "totp_backup_codes",
  "pending_two_factor_logins", "technical_regions", "crop_profiles", "crop_profile_parameters",
  "ai_generations", "technical_sources", "field_yield_history", "input_recommendations",
  "input_applications", "field_ndvi_snapshots",
];

const source = new Pool({ connectionString: sourceUrl, ssl: process.env.SOURCE_SSL === "require" ? { rejectUnauthorized: false } : undefined });
const target = new Pool({ connectionString: targetUrl, ssl: process.env.TARGET_SSL === "require" ? { rejectUnauthorized: false } : undefined });

function needsJsonCast(dataType) {
  return dataType === "jsonb" || dataType === "json";
}

for (const table of TABLES_IN_DEPENDENCY_ORDER) {
  const columnsResult = await target.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [table],
  );
  const columns = columnsResult.rows;
  if (columns.length === 0) {
    console.log(`skip ${table} (tabela não existe no destino)`);
    continue;
  }

  const rowsResult = await source.query(`SELECT * FROM ${table}`);
  if (rowsResult.rowCount === 0) {
    console.log(`${table}: 0 linhas na origem`);
    continue;
  }

  const columnNames = columns.map((c) => c.column_name);
  const placeholders = columns.map((c, i) => (needsJsonCast(c.data_type) ? `$${i + 1}::${c.data_type}` : `$${i + 1}`)).join(", ");
  const insertSql = `INSERT INTO ${table} (${columnNames.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

  let inserted = 0;
  for (const row of rowsResult.rows) {
    const values = columns.map((c) => {
      const value = row[c.column_name];
      if (value !== null && needsJsonCast(c.data_type)) return JSON.stringify(value);
      return value;
    });
    await target.query(insertSql, values);
    inserted += 1;
  }
  console.log(`${table}: ${inserted} linha(s) copiada(s)`);
}

await source.end();
await target.end();
console.log("cópia concluída");
