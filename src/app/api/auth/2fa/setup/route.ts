import QRCode from "qrcode";
import { getPlatformSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { getTwoFactorStatus, startTwoFactorSetup } from "@/lib/auth/two-factor";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  // Se o 2FA já está ativo, gerar um novo segredo derruba a proteção atual (fica desativado até a
  // confirmação do novo código) — por isso exige a senha, igual ao fluxo de desativar. Na primeira
  // configuração não há nada para proteger ainda, então não pede senha.
  const status = await getTwoFactorStatus(session.userId);
  if (status.enabled) {
    const body = await request.json().catch(() => ({})) as { password?: string };
    const password = body.password ?? "";
    if (!password) return Response.json({ error: "Informe sua senha atual para gerar um novo código." }, { status: 400 });
    const result = await query<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = $1::uuid", [session.userId]);
    const hash = result.rows[0]?.password_hash;
    if (!hash || !(await verifyPassword(hash, password))) {
      return Response.json({ error: "Senha incorreta." }, { status: 401 });
    }
  }

  const { secret, otpauthUri } = await startTwoFactorSetup({ userId: session.userId, email: session.email });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 220 });
  return Response.json({ secret, qrCodeDataUrl });
}
