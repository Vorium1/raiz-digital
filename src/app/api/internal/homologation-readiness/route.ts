import { getHomologationReadinessHttpResult } from "@/domain/homologation-readiness";
import { getPlatformSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const READINESS_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

/**
 * Readiness operacional interno do ambiente em execução.
 *
 * - exige sessão ativa;
 * - exige privilégio global de curadoria da plataforma;
 * - retorna somente estados derivados/sanitizados;
 * - nunca retorna valores de variáveis de ambiente, URLs de banco ou mensagens de exceção;
 * - nunca emite GO de produção: releaseReady permanece false por contrato.
 */
export async function GET() {
  try {
    const session = await getPlatformSession();
    const result = getHomologationReadinessHttpResult(session, process.env);
    return Response.json(result.body, { status: result.httpStatus, headers: READINESS_HEADERS });
  } catch {
    console.error("internal_homologation_readiness_unavailable");
    return Response.json(
      { status: "unavailable", releaseReady: false },
      { status: 503, headers: READINESS_HEADERS },
    );
  }
}
