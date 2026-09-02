import { changeOwnPassword, getPlatformSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  try {
    const body = await request.json() as { currentPassword?: string; newPassword?: string };
    const currentPassword = body.currentPassword ?? "";
    const newPassword = body.newPassword ?? "";
    if (!currentPassword || !newPassword) {
      return Response.json({ error: "Informe a senha atual e a nova senha." }, { status: 400 });
    }
    if (newPassword.length < 10) {
      return Response.json({ error: "A nova senha precisa ter ao menos 10 caracteres." }, { status: 400 });
    }
    if (newPassword === currentPassword) {
      return Response.json({ error: "A nova senha precisa ser diferente da atual." }, { status: 400 });
    }

    await changeOwnPassword({ userId: session.userId, currentPassword, newPassword });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível alterar a senha.";
    return Response.json({ error: message }, { status: 422 });
  }
}
