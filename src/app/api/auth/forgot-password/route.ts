import { findUserByEmail } from "@/lib/auth/session";
import { createPasswordResetToken } from "@/lib/auth/password-reset";
import { sendEmail } from "@/lib/email";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { email?: string };
  const email = body.email?.trim().toLowerCase() ?? "";

  if (email) {
    try {
      const user = await findUserByEmail(email);
      if (user) {
        const token = await createPasswordResetToken(user.id);
        const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
        const link = `${appUrl}/redefinir-senha?token=${token}`;
        await sendEmail({
          to: email,
          subject: "Redefinição de senha · RAIZ Digital",
          text: `Use este link para redefinir sua senha (válido por 30 minutos):\n\n${link}\n\nSe você não pediu isso, ignore este e-mail.`,
        });
      }
    } catch (error) {
      console.error("forgot_password_failed", error);
    }
  }

  // Resposta genérica sempre, para não revelar se o e-mail existe ou não.
  return Response.json({ ok: true, message: "Se esse e-mail estiver cadastrado, as instruções foram enviadas." });
}
