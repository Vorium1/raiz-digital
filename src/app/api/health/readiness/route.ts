import { evaluateProductionReadiness } from "@/domain/production-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const READINESS_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export async function GET() {
  const readiness = evaluateProductionReadiness(process.env);
  return Response.json(
    { status: readiness.ok ? "ready" : "not_ready" },
    { status: readiness.ok ? 200 : 503, headers: READINESS_HEADERS },
  );
}
