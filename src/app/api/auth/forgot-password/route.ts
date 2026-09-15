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
        // null = pedido repetido dentro do cooldown. Mantém exatamente a mesma resposta HTTP para não
        // revelar se a conta existe e simplesmente não dispara outro e-mail.
        if (token) {
          const appUrl = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
          const link = `${appUrl}/redefinir-senha?token=${encodeURIComponent(token)}`;
          await sendEmail({
            to: email,
            subject: "Redefinição de senha · RAIZ Digital",
            text: `Use este link para redefinir sua senha (válido por 30 minutos):\n\n${link}\n\nSe você não pediu isso, ignore este e-mail.`,
          });
        }
      }
    } catch (error) {
      console.error("forgot_password_failed", error instanceof Error ? error.message : error);
    }
  }

  // Resposta genérica sempre, para não revelar se o e-mail existe, se houve cooldown ou se o provedor
  // externo está temporariamente indisponível.
  return Response.json({ ok: true, message: "Se esse e-mail estiver cadastrado, as instruções foram enviadas." });
}
