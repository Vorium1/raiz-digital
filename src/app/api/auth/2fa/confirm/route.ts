import { getPlatformSession } from "@/lib/auth/session";
import { confirmTwoFactorSetup, TwoFactorError } from "@/lib/auth/two-factor";

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  try {
    const body = await request.json() as { code?: string };
    const code = body.code?.trim() ?? "";
    if (!code) return Response.json({ error: "Informe o código de 6 dígitos do aplicativo autenticador." }, { status: 400 });

    const { backupCodes } = await confirmTwoFactorSetup({ userId: session.userId, code });
    return Response.json({ ok: true, backupCodes });
  } catch (error) {
    if (error instanceof TwoFactorError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível confirmar o 2FA." }, { status: 422 });
  }
}
