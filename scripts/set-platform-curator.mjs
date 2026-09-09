import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const email = process.env.CURATOR_EMAIL;
const value = process.env.CURATOR_VALUE;
if (!databaseUrl) throw new Error("DATABASE_URL obrigatória.");
if (!email) throw new Error("CURATOR_EMAIL obrigatória (e-mail de um usuário já cadastrado).");
if (value !== "true" && value !== "false") throw new Error("CURATOR_VALUE deve ser 'true' ou 'false'.");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

try {
  const result = await pool.query(
    "UPDATE users SET is_platform_curator = $1 WHERE email = $2::citext RETURNING name, email::text",
    [value === "true", email],
  );
  const updated = result.rows[0];
  if (!updated) throw new Error(`Nenhum usuário encontrado com o e-mail ${email}.`);
  console.log(`${updated.name} <${updated.email}>: is_platform_curator = ${value}`);
} finally {
  await pool.end();
}
