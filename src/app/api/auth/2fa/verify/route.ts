import { createHash } from "node:crypto";
import { createSession, membershipsForUser } from "@/lib/auth/session";
import { deletePendingTwoFactorLogin, getPendingTwoFactorLogin, TwoFactorError, verifyTwoFactorCode } from "@/lib/auth/two-factor";
import { isLoginLocked, recordFailedLogin } from "@/lib/auth/rate-limit";
import { query } from "@/lib/db";

function ipHash(request: Request) {
  const raw = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  if (!raw) return null;
  const salt = process.env.AUTH_SECRET ?? "";
  return createHash("sha256").update(`${salt}:${raw}`).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { pendingToken?: string; code?: string };
    const pendingToken = body.pendingToken?.trim() ?? "";
    const code = body.code?.trim() ?? "";
    if (!pendingToken || !code) return Response.json({ error: "Informe o código do aplicativo autenticador." }, { status: 400 });

    const pending = await getPendingTwoFactorLogin(pendingToken);

    const lock = await isLoginLocked(pending.email);
    if (lock.locked) {
      const minutes = Math.ceil(lock.retryAfterSeconds / 60);
      return Response.json({ error: `Muitas tentativas. Tente novamente em ${minutes} minuto(s).` }, { status: 429, headers: { "Retry-After": String(lock.retryAfterSeconds) } });
    }

    const valid = await verifyTwoFactorCode(pending.userId, code);
    if (!valid) {
      await recordFailedLogin(pending.email, ipHash(request));
      return Response.json({ error: "Código inválido. Tente novamente." }, { status: 422 });
    }

    await deletePendingTwoFactorLogin(pending.id);
    const { userId, tenantId } = pending;
    await createSession({ userId, tenantId, userAgent: request.headers.get("user-agent"), ipHash: ipHash(request) });

    const [userResult, memberships] = await Promise.all([
      query<{ id: string; name: string; email: string }>("SELECT id::text, name, email::text FROM users WHERE id = $1::uuid", [userId]),
      membershipsForUser(userId),
    ]);
    const user = userResult.rows[0];
    const membership = memberships.find((item) => item.tenant_id === tenantId);
    if (!user || !membership) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });

    return Response.json({ ok: true, user: { id: user.id, name: user.name, email: user.email }, tenant: { id: tenantId, name: membership.trade_name, role: membership.role } });
  } catch (error) {
    if (error instanceof TwoFactorError) return Response.json({ error: error.message }, { status: error.status });
    console.error("two_factor_verify_failed", error);
    return Response.json({ error: "Não foi possível validar o código." }, { status: 500 });
  }
}
