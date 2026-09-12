import { randomBytes } from "node:crypto";
import { getPlatformSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { createPasswordResetToken } from "@/lib/auth/password-reset";
import { sendEmail } from "@/lib/email";
import { inviteTeamMember, TeamError } from "@/lib/repositories/team";

const invitableRoles = new Set(["TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH", "COMMERCIAL", "VIEWER"]);

function bootstrapPassword() {
  // A pessoa nunca recebe esta senha. Ela existe apenas para que uma conta recém-criada não tenha
  // credencial vazia antes de concluir o link de ativação; 32 bytes aleatórios tornam login por acaso
  // impraticável. O primeiro acesso é definido pelo token de redefinição enviado por e-mail.
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

    const baseUrl = (process.env.APP_URL?.trim() || new URL(request.url).origin).replace(/\/$/, "");
    let emailDelivery: "sent" | "logged" | "failed" = "failed";

    try {
      if (result.createdNewUser) {
        const token = await createPasswordResetToken(result.userId);
        const activationLink = `${baseUrl}/redefinir-senha?token=${encodeURIComponent(token)}`;
        const delivery = await sendEmail({
          to: email,
          subject: `Convite para ${session.tenantName} · RAIZ Digital`,
          text: `${session.name} adicionou você à empresa ${session.tenantName} na RAIZ Digital.\n\nDefina sua senha de acesso neste link (válido por 30 minutos):\n${activationLink}\n\nSe você não reconhece este convite, não use o link.`,
        });
        emailDelivery = delivery.delivered ? "sent" : delivery.logged ? "logged" : "failed";
      } else {
        const delivery = await sendEmail({
          to: email,
          subject: `Novo acesso a ${session.tenantName} · RAIZ Digital`,
          text: `${session.name} adicionou sua conta à empresa ${session.tenantName} na RAIZ Digital.\n\nVocê pode entrar com a senha que já utiliza:\n${baseUrl}/login\n\nSe você não reconhece este acesso, entre em contato com o administrador da empresa.`,
        });
        emailDelivery = delivery.delivered ? "sent" : delivery.logged ? "logged" : "failed";
      }
    } catch (emailError) {
      // O vínculo foi criado dentro de transação antes do envio. Falha do provedor não pode transformar a
      // resposta em "convite não criado" e induzir o administrador a duplicar operações. A UI informa a
      // pendência de entrega; o erro técnico fica no log, sem expor chave ou token ao navegador.
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
