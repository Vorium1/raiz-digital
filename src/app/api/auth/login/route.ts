import { createHash } from "node:crypto";
import { createSession, findUserByEmail, membershipsForUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { isLoginLocked, recordFailedLogin } from "@/lib/auth/rate-limit";
import { createPendingTwoFactorLogin } from "@/lib/auth/two-factor";

function ipHash(request: Request) {
  const raw = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  if (!raw) return null;
  const salt = process.env.AUTH_SECRET ?? "";
  return createHash("sha256").update(`${salt}:${raw}`).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; password?: string; tenantId?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";

    if (!email || !password) {
      return Response.json({ error: "Informe e-mail e senha." }, { status: 400 });
    }

    const lock = await isLoginLocked(email);
    if (lock.locked) {
      const minutes = Math.ceil(lock.retryAfterSeconds / 60);
      return Response.json(
        { error: `Muitas tentativas de login para este e-mail. Tente novamente em ${minutes} minuto(s).` },
        { status: 429, headers: { "Retry-After": String(lock.retryAfterSeconds) } },
      );
    }

    const user = await findUserByEmail(email);
    if (!user?.password_hash || !(await verifyPassword(user.password_hash, password))) {
      await recordFailedLogin(email, ipHash(request));
      return Response.json({ error: "Credenciais inválidas." }, { status: 401 });
    }

    const memberships = await membershipsForUser(user.id);
    if (!memberships.length) {
      return Response.json({ error: "Usuário sem empresa ativa vinculada." }, { status: 403 });
    }

    if (memberships.length > 1 && !body.tenantId) {
      return Response.json({
        error: "Selecione a empresa que deseja acessar.",
        code: "TENANT_REQUIRED",
        tenants: memberships.map((membership) => ({ id: membership.tenant_id, name: membership.trade_name, role: membership.role })),
      }, { status: 409 });
    }

    const selected = body.tenantId
      ? memberships.find((membership) => membership.tenant_id === body.tenantId)
      : memberships[0];

    if (!selected) {
      return Response.json({ error: "Empresa não autorizada para este usuário." }, { status: 403 });
    }

    if (user.two_factor_enabled) {
      const pendingToken = await createPendingTwoFactorLogin({
        userId: user.id,
        tenantId: selected.tenant_id,
        userAgent: request.headers.get("user-agent"),
        ipHash: ipHash(request),
      });
      return Response.json({ code: "TOTP_REQUIRED", pendingToken }, { status: 401 });
    }

    await createSession({
      userId: user.id,
      tenantId: selected.tenant_id,
      userAgent: request.headers.get("user-agent"),
      ipHash: ipHash(request),
    });

    return Response.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email },
      tenant: { id: selected.tenant_id, name: selected.trade_name, role: selected.role },
    });
  } catch (error) {
    console.error("login_failed", error);
    return Response.json({ error: "Não foi possível iniciar a sessão." }, { status: 500 });
  }
}
