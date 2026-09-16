import { requirePlatformSession } from "@/lib/auth/session";
import {
  getDashboardSnapshot,
  getExecutiveDashboard,
  getDashboardFilterOptions,
  getPortfolioFieldSummaries,
} from "@/lib/repositories/dashboard";
import { getActivationSnapshot } from "@/lib/repositories/activation";
import { listAnalyses } from "@/lib/repositories/analyses";
import { listOperationalAlerts } from "@/lib/repositories/alerts";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" };

type CheckResult = {
  name: string;
  ok: boolean;
  elapsedMs: number;
  errorCode?: string;
  errorName?: string;
};

function safeError(error: unknown) {
  if (!error || typeof error !== "object") return { errorName: "UnknownError" };
  const value = error as { code?: unknown; name?: unknown };
  return {
    errorCode: typeof value.code === "string" ? value.code : undefined,
    errorName: typeof value.name === "string" ? value.name : "Error",
  };
}

async function check(name: string, work: () => Promise<unknown>): Promise<CheckResult> {
  const started = Date.now();
  try {
    await work();
    return { name, ok: true, elapsedMs: Date.now() - started };
  } catch (error) {
    return { name, ok: false, elapsedMs: Date.now() - started, ...safeError(error) };
  }
}

export async function GET() {
  const session = await requirePlatformSession();
  const tenantId = session.tenantId;
  const userId = session.userId;

  // Intencionalmente sequencial: o objetivo é distinguir erro de schema/query
  // de saturação do pool por concorrência. Nenhum dado operacional é retornado.
  const checks: CheckResult[] = [];
  checks.push(await check("dashboardSnapshot", () => getDashboardSnapshot(tenantId, userId, null)));
  checks.push(await check("analyses", () => listAnalyses(tenantId, userId, null)));
  checks.push(await check("executiveDashboard", () => getExecutiveDashboard(tenantId, {}, userId)));
  checks.push(await check("filterOptions", () => getDashboardFilterOptions(tenantId, userId)));
  checks.push(await check("operationalAlerts", () => listOperationalAlerts(tenantId, userId)));
  checks.push(await check("portfolioFields", () => getPortfolioFieldSummaries(tenantId, {}, userId)));
  checks.push(await check("activation", () => getActivationSnapshot(tenantId, userId)));

  return Response.json(
    {
      status: checks.every((item) => item.ok) ? "ok" : "failed",
      checks,
      note: "sanitized-dashboard-diagnostic-no-operational-data",
    },
    { status: 200, headers: HEADERS },
  );
}
