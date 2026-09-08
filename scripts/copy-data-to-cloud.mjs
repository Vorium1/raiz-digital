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

/**
 * ATENÇÃO: esta ordem não é só a ordem de criação das tabelas (`CREATE TABLE` nas migrations) --
 * várias colunas de chave estrangeira são adicionadas DEPOIS, via `ALTER TABLE ... ADD COLUMN ...
 * REFERENCES`, numa migration posterior (ex.: `crop_seasons.crop_profile_id` só existe a partir da
 * migration 012, mesmo `crop_seasons` tendo sido criada na 001) -- por isso as tabelas de catálogo/
 * referência (technical_regions, crop_profiles, crop_profile_parameters, rule_sets) vêm ANTES de
 * qualquer tabela operacional que passou a referenciá-las depois. Descoberto na prática: a primeira
 * tentativa de cópia real (pra Neon) quebrou exatamente nisso -- `crop_seasons` antes de
 * `crop_profiles` na lista, violando a foreign key `crop_seasons_crop_profile_id_fkey`.
 */
const TABLES_IN_DEPENDENCY_ORDER = [
  "tenants", "users", "tenant_members", "clients", "properties", "technical_regions", "rule_sets",
  "crop_profiles", "crop_profile_parameters", "fields", "crop_seasons",
  "collection_orders", "sample_points", "laboratories", "analyses", "lab_samples", "lab_results",
  "interpretations", "reports", "subscriptions", "referral_commissions", "invoices",
  "payment_events", "business_calendar", "audit_events", "analysis_imports", "analysis_import_rows",
  "user_sessions", "login_attempts", "password_reset_tokens", "totp_backup_codes",
  "pending_two_factor_logins",
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

  // `crop_profiles` é criada com linhas "esqueleto" já embutidas nas próprias migrations (012/013 --
  // ex.: SOJA/MILHO/TRIGO com status DRAFT e zero parâmetro), cada uma com um id novo aleatório gerado
  // ali mesmo -- diferente do id real da origem, que é o que `crop_profile_parameters`/`crop_seasons`
  // já referenciam. Sem isso, a linha real da origem colide no `UNIQUE (code, semantic_version)` e é
  // silenciosamente ignorada pelo `ON CONFLICT DO NOTHING`, deixando o id real órfão. Apaga a linha
  // esqueleto ANTES de inserir a real (seguro: essa tabela é só copiada uma vez, no início, antes de
  // qualquer parâmetro ser inserido referenciando ela).
  if (table === "crop_profiles") {
    for (const row of rowsResult.rows) {
      await target.query(`DELETE FROM crop_profiles WHERE code = $1 AND semantic_version = $2 AND id <> $3`, [row.code, row.semantic_version, row.id]);
    }
  }

  const columnNames = columns.map((c) => c.column_name);
  const placeholders = columns.map((c, i) => (needsJsonCast(c.data_type) ? `$${i + 1}::${c.data_type}` : `$${i + 1}`)).join(", ");
  const insertSql = `INSERT INTO ${table} (${columnNames.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

  let inserted = 0;
  let skipped = 0;
  for (const row of rowsResult.rows) {
    const values = columns.map((c) => {
      const value = row[c.column_name];
      if (value !== null && needsJsonCast(c.data_type)) return JSON.stringify(value);
      return value;
    });
    const result = await target.query(insertSql, values);
    if (result.rowCount > 0) inserted += 1; else skipped += 1;
  }
  console.log(`${table}: ${inserted} linha(s) copiada(s)${skipped > 0 ? `, ${skipped} já existia(m) (ignorada(s))` : ""}`);
}

await source.end();
await target.end();
console.log("cópia concluída");
