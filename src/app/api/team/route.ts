import { randomBytes } from "node:crypto";
import { getPlatformSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { inviteTeamMember, TeamError } from "@/lib/repositories/team";

const invitableRoles = new Set(["TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH", "COMMERCIAL", "VIEWER"]);

function temporaryPassword() {
  return randomBytes(9).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).padEnd(12, "7");
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

    const password = temporaryPassword();
    const temporaryPasswordHash = await hashPassword(password);

    const result = await inviteTeamMember({
      tenantId: session.tenantId,
      userId: session.userId,
      name,
      email,
      role,
      temporaryPasswordHash,
    });

    return Response.json({
      userId: result.userId,
      createdNewUser: result.createdNewUser,
      temporaryPassword: result.createdNewUser ? password : null,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof TeamError) return Response.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : "Não foi possível convidar o membro.";
    return Response.json({ error: message }, { status: 422 });
  }
}
