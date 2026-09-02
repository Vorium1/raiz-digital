import pg from "pg";
import { hash } from "@node-rs/argon2";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const password = process.env.SEED_ADMIN_PASSWORD;
if (!databaseUrl) throw new Error("DATABASE_URL obrigatória.");
if (!password || password.length < 10) throw new Error("SEED_ADMIN_PASSWORD deve ter ao menos 10 caracteres.");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const tenantName = process.env.SEED_TENANT_NAME || "Raiz Digital Demo";
  const adminName = process.env.SEED_ADMIN_NAME || "Administrador Raiz";
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "admin@raiz.local").toLowerCase();
  const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 });

  let tenantId = (await client.query("SELECT id FROM tenants WHERE trade_name = $1 ORDER BY created_at LIMIT 1", [tenantName])).rows[0]?.id;
  if (!tenantId) {
    tenantId = (await client.query(
      "INSERT INTO tenants (legal_name, trade_name) VALUES ($1, $1) RETURNING id",
      [tenantName],
    )).rows[0].id;
  }

  const user = await client.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2::citext, $3)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [adminName, adminEmail, passwordHash],
  );
  const userId = user.rows[0].id;
  await client.query(
    `INSERT INTO tenant_members (tenant_id, user_id, role, active)
     VALUES ($1::uuid, $2::uuid, 'TENANT_ADMIN', true)
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'TENANT_ADMIN', active = true`,
    [tenantId, userId],
  );
  await client.query("COMMIT");
  console.log(`seed: ${adminEmail} vinculado a ${tenantName}`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
