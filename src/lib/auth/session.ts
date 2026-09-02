import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { createOpaqueSessionToken, hashSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/token";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export type PlatformSession = {
  sessionId: string;
  userId: string;
  name: string;
  email: string;
  tenantId: string;
  tenantName: string;
  role: string;
  expiresAt: string;
};

type LoginUser = {
  id: string;
  name: string;
  email: string;
  password_hash: string | null;
};

type Membership = { tenant_id: string; trade_name: string; role: string };

export async function findUserByEmail(email: string) {
  const result = await query<LoginUser>(
    "SELECT id, name, email::text, password_hash FROM users WHERE email = $1::citext LIMIT 1",
    [email.trim().toLowerCase()],
  );
  return result.rows[0] ?? null;
}

export async function membershipsForUser(userId: string) {
  const result = await query<Membership>("SELECT * FROM app.user_memberships($1::uuid)", [userId]);
  return result.rows;
}

export async function createSession(input: {
  userId: string;
  tenantId: string;
  userAgent?: string | null;
  ipHash?: string | null;
}) {
  const token = createOpaqueSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await query(
    `INSERT INTO user_sessions (user_id, tenant_id, token_hash, expires_at, user_agent, ip_hash)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
    [input.userId, input.tenantId, tokenHash, expiresAt, input.userAgent ?? null, input.ipHash ?? null],
  );

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function revokeCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await query("UPDATE user_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [hashSessionToken(token)]);
  }
  store.delete(SESSION_COOKIE);
}

export async function getPlatformSession(): Promise<PlatformSession | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const result = await query<PlatformSession>(
    `SELECT
       s.id::text AS "sessionId",
       u.id::text AS "userId",
       u.name,
       u.email::text AS email,
       t.id::text AS "tenantId",
       t.trade_name AS "tenantName",
       membership.role::text AS role,
       s.expires_at::text AS "expiresAt"
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     JOIN tenants t ON t.id = s.tenant_id
     JOIN LATERAL app.user_memberships(s.user_id) membership ON membership.tenant_id = s.tenant_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND t.status = 'ACTIVE'
     LIMIT 1`,
    [hashSessionToken(token)],
  );

  const session = result.rows[0] ?? null;
  if (!session) {
    store.delete(SESSION_COOKIE);
    return null;
  }
  return session;
}

export async function changeOwnPassword(input: { userId: string; currentPassword: string; newPassword: string }) {
  const result = await query<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = $1::uuid", [input.userId]);
  const currentHash = result.rows[0]?.password_hash;
  if (!currentHash || !(await verifyPassword(currentHash, input.currentPassword))) {
    throw new Error("Senha atual incorreta.");
  }
  const newHash = await hashPassword(input.newPassword);
  await query("UPDATE users SET password_hash = $1 WHERE id = $2::uuid", [newHash, input.userId]);
}

export async function requirePlatformSession() {
  const session = await getPlatformSession();
  if (!session) redirect("/login");
  return session;
}
