import { query } from "@/lib/db";

const WINDOW_MINUTES = 15;
const MAX_FAILED_ATTEMPTS = 5;

export async function isLoginLocked(email: string): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  const result = await query<{ failed: number; oldest: string | null }>(
    `SELECT count(*)::int AS failed, min(created_at)::text AS oldest
     FROM login_attempts
     WHERE email = $1::citext AND created_at > now() - ($2::int * interval '1 minute')`,
    [email, WINDOW_MINUTES],
  );
  const row = result.rows[0];
  const failed = row?.failed ?? 0;
  if (failed < MAX_FAILED_ATTEMPTS) return { locked: false, retryAfterSeconds: 0 };
  const oldestMs = row?.oldest ? new Date(row.oldest).getTime() : Date.now();
  const retryAfterMs = oldestMs + WINDOW_MINUTES * 60_000 - Date.now();
  return { locked: true, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
}

export async function recordFailedLogin(email: string, ipHash: string | null) {
  await query(`INSERT INTO login_attempts (email, ip_hash) VALUES ($1::citext, $2)`, [email, ipHash]);
}
