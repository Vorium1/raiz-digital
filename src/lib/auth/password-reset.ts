import { createHash, randomBytes } from "node:crypto";
import { getPool } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

const TOKEN_TTL_MINUTES = 30;
const REQUEST_COOLDOWN_SECONDS = 60;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Retorna null quando já houve pedido recente para a mesma conta. */
export async function createPasswordResetToken(userId: string): Promise<string | null> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000);
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    // O lock na própria conta serializa dois pedidos simultâneos. Sem isso, duas requisições que chegassem
    // no mesmo instante poderiam ambas observar "nenhum token recente" e criar dois links válidos.
    const user = await client.query<{ id: string }>(
      "SELECT id::text FROM users WHERE id = $1::uuid FOR UPDATE",
      [userId],
    );
    if (!user.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    const recent = await client.query(
      `SELECT 1 FROM password_reset_tokens
       WHERE user_id = $1::uuid
         AND created_at > now() - ($2::int * interval '1 second')
       LIMIT 1`,
      [userId, REQUEST_COOLDOWN_SECONDS],
    );
    if (recent.rows[0]) {
      await client.query("COMMIT");
      return null;
    }

    // Um novo pedido válido invalida links anteriores ainda abertos antes de criar o próximo.
    await client.query(
      "UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1::uuid AND used_at IS NULL",
      [userId],
    );
    await client.query(
      "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1::uuid, $2, $3)",
      [userId, tokenHash, expiresAt],
    );
    await client.query("COMMIT");
    return token;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
    const claimedUserId = claimed.rows[0]?.user_id;
    if (!claimedUserId) throw new Error("Link de redefinição inválido ou expirado. Peça um novo.");

    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2::uuid", [newHash, claimedUserId]);
    await client.query("UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1::uuid AND revoked_at IS NULL", [claimedUserId]);
    // Qualquer outro link criado antes da troca perde utilidade no mesmo commit da nova senha.
    await client.query(
      "UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1::uuid AND used_at IS NULL",
      [claimedUserId],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
