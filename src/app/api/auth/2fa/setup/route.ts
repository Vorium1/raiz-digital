import QRCode from "qrcode";
import { getPlatformSession } from "@/lib/auth/session";
import { startTwoFactorSetup } from "@/lib/auth/two-factor";

export async function POST() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const { secret, otpauthUri } = await startTwoFactorSetup({ userId: session.userId, email: session.email });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 220 });
  return Response.json({ secret, qrCodeDataUrl });
}
