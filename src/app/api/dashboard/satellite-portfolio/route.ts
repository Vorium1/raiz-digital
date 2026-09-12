import { getPlatformSession } from "@/lib/auth/session";
import { listPortfolioSatelliteSignals } from "@/lib/repositories/portfolio-satellite";

/**
 * Camada Sentinel-2 da carteira. Retorna somente sinais derivados de leituras já persistidas do tenant;
 * não chama o Copernicus e não consome quota externa ao abrir o dashboard.
 */
export async function GET() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const signals = await listPortfolioSatelliteSignals(session.tenantId, session.userId);
  return Response.json({ signals });
}
