import QRCode from "qrcode";
import { getPlatformSession } from "@/lib/auth/session";
import { startTwoFactorSetup, TwoFactorError } from "@/lib/auth/two-factor";

export async function POST(_request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  try {
    // Se já estiver ativo, o domínio responde 409 e preserva o segredo/proteção existentes. Para trocar de
    // autenticador é necessário usar primeiro o fluxo explícito de desativação, que exige a senha atual.
    const { secret, otpauthUri } = await startTwoFactorSetup({ userId: session.userId, email: session.email });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 220 });
    return Response.json({ secret, qrCodeDataUrl });
  } catch (error) {
    if (error instanceof TwoFactorError) return Response.json({ error: error.message }, { status: error.status });
    console.error("two_factor_setup_failed", error);
    return Response.json({ error: "Não foi possível iniciar a configuração da verificação em duas etapas." }, { status: 500 });
  }
}
