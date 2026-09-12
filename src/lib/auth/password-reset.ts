import { createHash, randomBytes } from "node:crypto";
import { getPool, query } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

const TOKEN_TTL_MINUTES = 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000);

  // Um novo pedido invalida links anteriores ainda abertos. O CTE executa invalidação + criação como
  // uma única operação no banco, evitando manter vários links válidos para a mesma conta ao mesmo tempo.
  await query(
    `WITH invalidated AS (
       UPDATE password_reset_tokens
       SET used_at = now()
       WHERE user_id = $1::uuid AND used_at IS NULL
       RETURNING id
     )
     INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1::uuid, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
  return token;
}

export async function consumePasswordResetToken(token: string, newPassword: string) {
  const tokenHash = hashToken(token);
  // Faz o Argon2 fora da transação para não segurar conexão/lock durante uma operação propositalmente cara.
  const newHash = await hashPassword(newPassword);
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    // Reivindica o token de forma atômica. Duas requisições simultâneas não conseguem usar o mesmo link:
    // a primeira trava/consome a linha; a segunda deixa de satisfazer `used_at IS NULL` depois do commit.
    const claimed = await client.query<{ user_id: string }>(
      `UPDATE password_reset_tokens
       SET used_at = now()
       WHERE id = (
         SELECT id
         FROM password_reset_tokens
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE
       )
       RETURNING user_id::text`,
      [tokenHash],
    );
    const userId = claimed.rows[0]?.user_id;
    if (!userId) throw new Error("Link de redefinição inválido ou expirado. Peça um novo.");

    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2::uuid", [newHash, userId]);
    await client.query("UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1::uuid AND revoked_at IS NULL", [userId]);
    // Qualquer outro link criado em corrida ou ainda válido perde utilidade após a troca de senha.
    await client.query(
      "UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1::uuid AND used_at IS NULL",
      [userId],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
