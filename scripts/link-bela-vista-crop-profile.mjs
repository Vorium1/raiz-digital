import pg from "pg";

/**
 * Correção de dado ÚNICA: vincula a safra do Talhão 3 / Fazenda Bela Vista (`current_crop = 'Soja'`, já
 * uma cultura conhecida e com perfil técnico correspondente cadastrado) ao `crop_profile` SOJA -- estava
 * NULL, por isso `interpretOne` (agronomic-engine.ts) devolvia "A safra não tem uma cultura vinculada a um
 * perfil cadastrado." pra QUALQUER resultado desta safra, mesmo com o perfil certo existindo no catálogo.
 * Update cirúrgico (só a coluna crop_profile_id) -- não toca em nenhum outro campo da safra.
 */

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined });
await client.connect();

const TENANT_ID = "dc3854e1-8721-4041-ba9c-1e8c1657202f"; // Raiz Digital Demo
const CURATOR_ID = "049d3717-84f9-42fc-97d7-aacc22304f5b"; // admin@raiz.local

async function main() {
  await client.query("BEGIN");

  const season = await client.query(
    `SELECT cs.id::text, cs.current_crop, cs.crop_profile_id::text, f.name AS field_name, p.name AS property_name
     FROM crop_seasons cs JOIN fields f ON f.id = cs.field_id JOIN properties p ON p.id = f.property_id
     WHERE p.name = 'Sede Bela Vista' AND f.name = 'Talhão 3'`,
  );
  const row = season.rows[0];
  if (!row) throw new Error("Safra do Talhão 3 / Bela Vista não encontrada.");
  if (row.crop_profile_id) { console.log(`Já vinculada (crop_profile_id=${row.crop_profile_id}) -- nada a fazer.`); await client.query("ROLLBACK"); return; }
  if (row.current_crop !== "Soja") throw new Error(`current_crop inesperado: "${row.current_crop}" (esperava "Soja") -- não vinculando automaticamente, verifique manualmente.`);

  const profile = await client.query(`SELECT id::text FROM crop_profiles WHERE code = 'SOJA'`);
  const cropProfileId = profile.rows[0]?.id;
  if (!cropProfileId) throw new Error("crop_profile SOJA não encontrado.");

  const updated = await client.query(
    `UPDATE crop_seasons SET crop_profile_id = $2::uuid WHERE id = $1::uuid
     RETURNING id::text, season_label AS "seasonLabel"`,
    [row.id, cropProfileId],
  );

  await client.query(
    `INSERT INTO audit_events (tenant_id, actor_user_id, actor_type, action, entity_type, entity_id, metadata)
     VALUES ($1::uuid, $2::uuid, 'USER', 'CROP_SEASON_UPDATED', 'crop_season', $3::uuid, $4::jsonb)`,
    [TENANT_ID, CURATOR_ID, row.id, JSON.stringify({ reason: "Auditoria RAIZ_2.0/Cabeda 2026-09-11 -- vinculação de crop_profile_id ausente pra current_crop='Soja' já conhecido.", cropProfileId })],
  );

  await client.query("COMMIT");
  console.log(`OK -- safra "${row.property_name} / ${row.field_name}" (${updated.rows[0].seasonLabel}) vinculada ao crop_profile SOJA (${cropProfileId}).`);
}

main()
  .catch(async (e) => { await client.query("ROLLBACK"); console.error(e); process.exitCode = 1; })
  .finally(() => client.end());
