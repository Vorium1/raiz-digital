import { randomBytes } from "node:crypto";
import { getPlatformSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { createPasswordResetToken } from "@/lib/auth/password-reset";
import { sendEmail } from "@/lib/email";
import { inviteTeamMember, TeamError } from "@/lib/repositories/team";

const invitableRoles = new Set(["TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH", "COMMERCIAL", "VIEWER"]);

type EmailDelivery = "sent" | "logged" | "failed";

function bootstrapPassword() {
  // Credencial interna aleatória para a conta existir antes da ativação. Nunca é retornada ao navegador,
  // mostrada ao administrador ou enviada por e-mail. O novo usuário define a própria senha pelo link de
  // ativação de uso único.
  return randomBytes(32).toString("base64url");
}

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!new Set(["SUPER_ADMIN", "TENANT_ADMIN"]).has(session.role)) {
    return Response.json({ error: "Seu perfil não pode convidar membros." }, { status: 403 });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = typeof body.role === "string" ? body.role : "";

    if (!name || !email || !invitableRoles.has(role)) {
      return Response.json({ error: "Nome, e-mail e perfil válidos são obrigatórios." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "E-mail inválido." }, { status: 400 });
    }

    const temporaryPasswordHash = await hashPassword(bootstrapPassword());
    const result = await inviteTeamMember({
      tenantId: session.tenantId,
      userId: session.userId,
      name,
      email,
      role,
      temporaryPasswordHash,
    });

    const appUrl = (process.env.APP_URL?.trim() || new URL(request.url).origin).replace(/\/$/, "");
    let emailDelivery: EmailDelivery = "failed";

    try {
      if (result.createdNewUser) {
        const token = await createPasswordResetToken(result.userId);
        if (!token) throw new Error("Não foi possível gerar o link de ativação agora.");
        const link = `${appUrl}/redefinir-senha?token=${encodeURIComponent(token)}`;
        const delivery = await sendEmail({
          to: email,
          subject: `Convite para ${session.tenantName} · RAIZ Digital`,
          text: `${session.name} convidou você para acessar ${session.tenantName} na RAIZ Digital.\n\nDefina sua senha neste link (válido por 30 minutos):\n${link}\n\nSe você não reconhece este convite, ignore esta mensagem.`,
        });
        emailDelivery = delivery.delivered ? "sent" : delivery.logged ? "logged" : "failed";
      } else {
        const delivery = await sendEmail({
          to: email,
          subject: `Novo acesso a ${session.tenantName} · RAIZ Digital`,
          text: `${session.name} adicionou sua conta à empresa ${session.tenantName} na RAIZ Digital.\n\nEntre com a senha que você já utiliza:\n${appUrl}/login\n\nSe você não reconhece este acesso, entre em contato com o administrador da empresa.`,
        });
        emailDelivery = delivery.delivered ? "sent" : delivery.logged ? "logged" : "failed";
      }
    } catch (emailError) {
      // O vínculo já foi criado e auditado. Falha do provedor não pode virar uma falsa resposta de
      // "convite não criado", pois isso levaria o administrador a repetir a operação. A UI mostra a
      // pendência e oferece reenvio separado, sem expor token nem credencial.
      console.error("team_invite_email_failed", emailError instanceof Error ? emailError.message : emailError);
    }

    return Response.json({
      userId: result.userId,
      createdNewUser: result.createdNewUser,
      emailDelivery,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof TeamError) return Response.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : "Não foi possível convidar o membro.";
    return Response.json({ error: message }, { status: 422 });
  }
}
