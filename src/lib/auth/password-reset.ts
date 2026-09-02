import { createHash, randomBytes } from "node:crypto";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

const TOKEN_TTL_MINUTES = 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000);
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1::uuid, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
  return token;
}

export async function consumePasswordResetToken(token: string, newPassword: string) {
  const tokenHash = hashToken(token);
  const result = await query<{ id: string; user_id: string }>(
    `SELECT id::text, user_id::text FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     LIMIT 1`,
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Link de redefinição inválido ou expirado. Peça um novo.");

  const newHash = await hashPassword(newPassword);
  await query("UPDATE users SET password_hash = $1 WHERE id = $2::uuid", [newHash, row.user_id]);
  await query("UPDATE password_reset_tokens SET used_at = now() WHERE id = $1::uuid", [row.id]);
  await query("UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1::uuid AND revoked_at IS NULL", [row.user_id]);
}
