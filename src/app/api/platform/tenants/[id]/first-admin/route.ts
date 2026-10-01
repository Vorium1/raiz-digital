import { randomBytes } from "node:crypto";
import { getPlatformSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { createPasswordResetToken } from "@/lib/auth/password-reset";
import { sendEmail } from "@/lib/email";
import { createFirstTenantAdmin, PlatformAdminError } from "@/lib/repositories/platform-admin";

function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!session.isPlatformAdmin) return Response.json({ error: "Acesso restrito à administração da plataforma." }, { status: 403 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Nome e e-mail válidos são obrigatórios." }, { status: 400 });
    }

    const { id } = await context.params;
    const bootstrapPasswordHash = await hashPassword(randomBytes(24).toString("base64url"));
    const result = await createFirstTenantAdmin({
      actorUserId: session.userId,
      tenantId: id,
      name,
      email,
      bootstrapPasswordHash,
    });

    let emailDelivery: "sent" | "logged" | "failed" = "failed";
    // O cadastro já foi confirmado. Uma indisponibilidade do provedor não deve
    // apresentar uma falsa falha de criação e incentivar um segundo cadastro.
    try {
      if (result.createdNewUser) {
        const token = await createPasswordResetToken(result.userId);
        if (token) {
          const link = `${appUrl()}/redefinir-senha?token=${token}`;
          const delivery = await sendEmail({
            to: email,
            subject: `Convite para ${result.tenantName} · RAIZ Digital`,
            text: [
              `Olá, ${name}.`,
              "",
              `Seu acesso administrativo a ${result.tenantName} foi criado na RAIZ Digital.`,
              "Defina sua senha pelo link individual abaixo:",
              link,
              "",
              "O link expira conforme a política de segurança da plataforma.",
            ].join("\n"),
          });
          emailDelivery = delivery.delivered ? "sent" : delivery.logged ? "logged" : "failed";
        }
      } else {
        const delivery = await sendEmail({
          to: email,
          subject: `Acesso administrativo a ${result.tenantName} · RAIZ Digital`,
          text: [
            `Olá, ${name}.`,
            "",
            `Seu usuário existente recebeu acesso administrativo a ${result.tenantName}.`,
            `Entre em ${appUrl()}/login com suas credenciais atuais.`,
          ].join("\n"),
        });
        emailDelivery = delivery.delivered ? "sent" : delivery.logged ? "logged" : "failed";
      }
    } catch (error) {
      console.error("first_tenant_admin_email_failed", { errorName: error instanceof Error ? error.name : "unknown" });
    }

    return Response.json({ ok: true, emailDelivery }, { status: 201 });
  } catch (error) {
    if (error instanceof PlatformAdminError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível criar o primeiro administrador." }, { status: 422 });
  }
}
