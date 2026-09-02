import { randomBytes, createHash } from "node:crypto";
import { query } from "@/lib/db";
import { generateBackupCodes, generateTotpSecret, hashBackupCode, totpAuthUri, verifyTotpCode } from "@/lib/auth/totp";

const PENDING_LOGIN_TTL_MINUTES = 10;

export class TwoFactorError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "TwoFactorError";
  }
}

function hashPendingToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function startTwoFactorSetup(input: { userId: string; email: string }) {
  const secret = generateTotpSecret();
  await query("UPDATE users SET totp_secret = $1, two_factor_enabled = false WHERE id = $2::uuid", [secret, input.userId]);
  return { secret, otpauthUri: totpAuthUri({ secret, accountLabel: input.email }) };
}

export async function confirmTwoFactorSetup(input: { userId: string; code: string }) {
  const result = await query<{ totp_secret: string | null }>("SELECT totp_secret FROM users WHERE id = $1::uuid", [input.userId]);
  const secret = result.rows[0]?.totp_secret;
  if (!secret) throw new TwoFactorError("Nenhuma configuração de 2FA em andamento. Inicie novamente.", 409);
  if (!verifyTotpCode(secret, input.code)) throw new TwoFactorError("Código inválido. Confira o horário do dispositivo e tente novamente.", 422);

  const codes = generateBackupCodes();
  await query("UPDATE users SET two_factor_enabled = true WHERE id = $1::uuid", [input.userId]);
  await query("DELETE FROM totp_backup_codes WHERE user_id = $1::uuid", [input.userId]);
  for (const code of codes) {
    await query("INSERT INTO totp_backup_codes (user_id, code_hash) VALUES ($1::uuid, $2)", [input.userId, hashBackupCode(code)]);
  }
  return { backupCodes: codes };
}

export async function disableTwoFactor(userId: string) {
  await query("UPDATE users SET two_factor_enabled = false, totp_secret = NULL WHERE id = $1::uuid", [userId]);
  await query("DELETE FROM totp_backup_codes WHERE user_id = $1::uuid", [userId]);
}

export async function getTwoFactorStatus(userId: string) {
  const result = await query<{ two_factor_enabled: boolean }>("SELECT two_factor_enabled FROM users WHERE id = $1::uuid", [userId]);
  return { enabled: result.rows[0]?.two_factor_enabled ?? false };
}

export async function verifyTwoFactorCode(userId: string, code: string) {
  const result = await query<{ totp_secret: string | null }>("SELECT totp_secret FROM users WHERE id = $1::uuid AND two_factor_enabled = true", [userId]);
  const secret = result.rows[0]?.totp_secret;
  if (!secret) return false;
  if (verifyTotpCode(secret, code)) return true;

  const backupHash = hashBackupCode(code);
  const backup = await query<{ id: string }>(
    "SELECT id::text FROM totp_backup_codes WHERE user_id = $1::uuid AND code_hash = $2 AND used_at IS NULL LIMIT 1",
    [userId, backupHash],
  );
  const row = backup.rows[0];
  if (!row) return false;
  await query("UPDATE totp_backup_codes SET used_at = now() WHERE id = $1::uuid", [row.id]);
  return true;
}

export async function createPendingTwoFactorLogin(input: { userId: string; tenantId: string; userAgent?: string | null; ipHash?: string | null }) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashPendingToken(token);
  const expiresAt = new Date(Date.now() + PENDING_LOGIN_TTL_MINUTES * 60_000);
  await query(
    `INSERT INTO pending_two_factor_logins (user_id, tenant_id, token_hash, expires_at, user_agent, ip_hash)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
    [input.userId, input.tenantId, tokenHash, expiresAt, input.userAgent ?? null, input.ipHash ?? null],
  );
  return token;
}

export async function getPendingTwoFactorLogin(token: string) {
  const tokenHash = hashPendingToken(token);
  const result = await query<{ id: string; user_id: string; tenant_id: string; email: string }>(
    `SELECT p.id::text, p.user_id::text, p.tenant_id::text, u.email::text
     FROM pending_two_factor_logins p
     JOIN users u ON u.id = p.user_id
     WHERE p.token_hash = $1 AND p.expires_at > now()
     LIMIT 1`,
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row) throw new TwoFactorError("Sessão de login expirada. Faça login novamente.", 401);
  return { id: row.id, userId: row.user_id, tenantId: row.tenant_id, email: row.email };
}

export async function deletePendingTwoFactorLogin(id: string) {
  await query("DELETE FROM pending_two_factor_logins WHERE id = $1::uuid", [id]);
}
