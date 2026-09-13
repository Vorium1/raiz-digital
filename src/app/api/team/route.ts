import { randomBytes } from "node:crypto";
import { getPlatformSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { createPasswordResetToken } from "@/lib/auth/password-reset";
import { sendEmail } from "@/lib/email";
import { inviteTeamMember, TeamError } from "@/lib/repositories/team";

const invitableRoles = new Set(["TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH", "COMMERCIAL", "VIEWER"]);

type InviteDelivery = "sent" | "logged" | "failed";

function bootstrapPassword() {
  // A senha inicial nunca é exibida nem enviada. Ela só impede acesso até a pessoa definir a própria senha
  // pelo link seguro de convite. O hash continua compatível com o modelo atual de usuários.
  return randomBytes(24).toString("base64url");
}

function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

async function deliverInvite(input: {
  email: string;
  name: string;
  tenantName: string;
  invitedBy: string;
  userId: string;
  createdNewUser: boolean;
}): Promise<InviteDelivery> {
  try {
    if (input.createdNewUser) {
      const token = await createPasswordResetToken(input.userId);
      if (!token) return "failed";
      const link = `${appUrl()}/redefinir-senha?token=${token}`;
      const delivery = await sendEmail({
        to: input.email,
        subject: `Convite para ${input.tenantName} · RAIZ Digital`,
        text: [
          `Olá, ${input.name}.`,
          "",
          `${input.invitedBy} convidou você para acessar ${input.tenantName} na RAIZ Digital.`,
          "",
          "Defina sua senha pelo link abaixo. Ele é individual e válido por 30 minutos:",
          link,
          "",
          "Se o link expirar, use a opção “Esqueci minha senha” na tela de login para gerar um novo.",
        ].join("\n"),
      });
      return delivery.delivered ? "sent" : delivery.logged ? "logged" : "failed";
    }

    const delivery = await sendEmail({
      to: input.email,
      subject: `Novo acesso a ${input.tenantName} · RAIZ Digital`,
      text: [
        `Olá, ${input.name}.`,
        "",
        `${input.invitedBy} liberou seu acesso a ${input.tenantName} na RAIZ Digital.`,
        "",
        `Entre em ${appUrl()}/login usando seu e-mail e a senha que você já utiliza na plataforma.`,
      ].join("\n"),
    });
    return delivery.delivered ? "sent" : delivery.logged ? "logged" : "failed";
  } catch (error) {
    console.error("team_invite_email_failed", { email: input.email, error });
    return "failed";
  }
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

    // Mantemos um hash de bootstrap apenas para respeitar o schema atual. A credencial em texto puro
    // nunca sai deste request e nunca é retornada ao administrador.
    const temporaryPasswordHash = await hashPassword(bootstrapPassword());
    const result = await inviteTeamMember({
      tenantId: session.tenantId,
      userId: session.userId,
      name,
      email,
      role,
      temporaryPasswordHash,
    });

    // O vínculo da equipe não é desfeito se o provedor de e-mail estiver indisponível. Isso evita o pior
    // cenário anterior, em que um erro de entrega faria a interface dizer “falhou” embora a conta já tivesse
    // sido criada. A resposta distingue claramente criação de acesso e entrega da mensagem.
    const emailDelivery = await deliverInvite({
      email,
      name,
      tenantName: session.tenantName,
      invitedBy: session.name,
      userId: result.userId,
      createdNewUser: result.createdNewUser,
    });

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
