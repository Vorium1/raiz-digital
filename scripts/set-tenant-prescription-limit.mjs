import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const tenantName = process.env.TENANT_NAME;
const limit = process.env.PRESCRIPTION_LIMIT;
if (!databaseUrl) throw new Error("DATABASE_URL obrigatória.");
if (!tenantName) throw new Error("TENANT_NAME obrigatória (nome comercial exato da empresa, como cadastrado em tenants.trade_name).");
if (!limit || !/^\d+$/.test(limit)) throw new Error("PRESCRIPTION_LIMIT deve ser um número inteiro (0 ou mais).");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

try {
  const result = await pool.query(
    "UPDATE tenants SET monthly_prescription_limit = $1 WHERE trade_name = $2 RETURNING trade_name, monthly_prescription_limit",
    [Number(limit), tenantName],
  );
  const updated = result.rows[0];
  if (!updated) throw new Error(`Nenhuma empresa encontrada com o nome "${tenantName}".`);
  console.log(`${updated.trade_name}: limite mensal de prescrições = ${updated.monthly_prescription_limit}`);
} finally {
  await pool.end();
}
