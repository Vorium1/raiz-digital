import { getPlatformSession } from "@/lib/auth/session";
import { revokeOwnOtherSessions } from "@/lib/auth/session-security";

export async function POST() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  try {
    const revoked = await revokeOwnOtherSessions(session.userId, session.sessionId);
    return Response.json({ ok: true, revoked });
  } catch (error) {
    console.error("revoke_other_sessions_failed", error);
    return Response.json({ error: "Não foi possível encerrar as outras sessões." }, { status: 500 });
  }
}
