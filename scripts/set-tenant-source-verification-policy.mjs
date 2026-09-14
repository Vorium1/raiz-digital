import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const tenantName = process.env.TENANT_NAME;
const required = process.env.SOURCE_VERIFICATION_REQUIRED;
if (!databaseUrl) throw new Error("DATABASE_URL obrigatória.");
if (!tenantName) throw new Error("TENANT_NAME obrigatória (nome comercial exato da empresa em tenants.trade_name).");
if (!required || !["true", "false"].includes(required.toLowerCase())) {
  throw new Error("SOURCE_VERIFICATION_REQUIRED deve ser true ou false.");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

try {
  const result = await pool.query(
    `UPDATE tenants
     SET require_source_human_verification = $1
     WHERE trade_name = $2
     RETURNING trade_name, require_source_human_verification`,
    [required.toLowerCase() === "true", tenantName],
  );
  const updated = result.rows[0];
  if (!updated) throw new Error(`Nenhuma empresa encontrada com o nome "${tenantName}".`);
  console.log(`${updated.trade_name}: exigir conferência humana da fonte = ${updated.require_source_human_verification}`);
} finally {
  await pool.end();
}
