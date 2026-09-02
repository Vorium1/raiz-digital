import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const password = process.env.APP_DB_ROLE_PASSWORD;
if (!databaseUrl) throw new Error("DATABASE_URL (papel administrativo) obrigatória.");
if (!password || password.length < 20) throw new Error("APP_DB_ROLE_PASSWORD deve ter ao menos 20 caracteres.");
if (!/^[A-Za-z0-9]+$/.test(password)) throw new Error("APP_DB_ROLE_PASSWORD deve conter apenas letras e números.");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

try {
  await pool.query(`ALTER ROLE raiz_app WITH PASSWORD '${password}'`);
  console.log("raiz_app: senha definida.");
} finally {
  await pool.end();
}
