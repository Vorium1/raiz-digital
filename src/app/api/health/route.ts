import { isDatabaseMode } from "@/lib/data-mode";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const HEALTH_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

/**
 * Health check público deliberadamente mínimo.
 *
 * Em DATA_MODE=database confirma que a instância consegue consultar o mesmo pool usado pelo runtime.
 * Não expõe host, tenant, versão de banco, modo operacional, timestamp nem mensagem de exceção. O
 * preflight de produção é responsável por impedir publicação comercial em modo demo.
 */
export async function GET() {
  if (!isDatabaseMode()) {
    return Response.json({ status: "ok" }, { status: 200, headers: HEALTH_HEADERS });
  }

  try {
    const result = await query<{ ok: number }>("SELECT 1::int AS ok");
    if (result.rows[0]?.ok !== 1) throw new Error("health_query_unexpected_result");
    return Response.json({ status: "ok" }, { status: 200, headers: HEALTH_HEADERS });
  } catch (error) {
    console.error("health_database_unavailable", error);
    return Response.json({ status: "unavailable" }, { status: 503, headers: HEALTH_HEADERS });
  }
}
