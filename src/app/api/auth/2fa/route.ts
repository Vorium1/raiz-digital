import { getPlatformSession } from "@/lib/auth/session";
import { getTwoFactorStatus, disableTwoFactor } from "@/lib/auth/two-factor";
import { verifyPassword } from "@/lib/auth/password";
import { query } from "@/lib/db";

export async function GET() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const status = await getTwoFactorStatus(session.userId);
  return Response.json(status);
}

export async function DELETE(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  try {
    const body = await request.json() as { password?: string };
    const password = body.password ?? "";
    if (!password) return Response.json({ error: "Informe sua senha atual para desativar o 2FA." }, { status: 400 });

    const result = await query<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = $1::uuid", [session.userId]);
    const hash = result.rows[0]?.password_hash;
    if (!hash || !(await verifyPassword(hash, password))) {
      return Response.json({ error: "Senha incorreta." }, { status: 401 });
    }

    await disableTwoFactor(session.userId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível desativar o 2FA." }, { status: 422 });
  }
}
