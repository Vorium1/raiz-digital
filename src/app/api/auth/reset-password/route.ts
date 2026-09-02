import { consumePasswordResetToken } from "@/lib/auth/password-reset";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { token?: string; newPassword?: string };
    const token = body.token ?? "";
    const newPassword = body.newPassword ?? "";
    if (!token || !newPassword) {
      return Response.json({ error: "Link e nova senha são obrigatórios." }, { status: 400 });
    }
    if (newPassword.length < 10) {
      return Response.json({ error: "A nova senha precisa ter ao menos 10 caracteres." }, { status: 400 });
    }
    await consumePasswordResetToken(token, newPassword);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível redefinir a senha.";
    return Response.json({ error: message }, { status: 422 });
  }
}
