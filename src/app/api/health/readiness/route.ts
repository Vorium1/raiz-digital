import { getProductionRuntimeReadiness } from "../../../../domain/production-runtime-readiness.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const READINESS_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

/**
 * Readiness público deliberadamente mínimo.
 *
 * O runtime avalia as variáveis reais do deployment, mas a resposta NÃO expõe checks,
 * nomes de variáveis, warnings, URLs, hosts ou valores. A lista detalhada permanece
 * somente no processo local/CI que executa a avaliação diretamente.
 */
export async function GET() {
  const result = getProductionRuntimeReadiness();
  if (!result.evaluation.ok) {
    console.error("production_runtime_not_ready", {
      failureCount: result.evaluation.failures.length,
      warningCount: result.evaluation.warnings.length,
    });
  }
  return Response.json(result.payload, {
    status: result.httpStatus,
    headers: READINESS_HEADERS,
  });
}
