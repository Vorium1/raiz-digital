import { requirePlatformSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
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

async function inspectSchema() {
  const requiredColumns = [
    ["analyses", "requested_analysis_depth"],
    ["analyses", "analysis_context"],
    ["field_ndvi_snapshots", "raster_object_key"],
  ] as const;

  const columns = await query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) IN (
          ('analyses', 'requested_analysis_depth'),
          ('analyses', 'analysis_context'),
          ('field_ndvi_snapshots', 'raster_object_key')
        )`,
  );
  const presentColumns = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));

  const migrationsTable = await query<{ exists: boolean }>(
    `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists`,
  );

  let appliedMigrations: string[] = [];
  if (migrationsTable.rows[0]?.exists) {
    const migrations = await query<{ name: string }>(
      `SELECT name FROM schema_migrations WHERE name = ANY($1::text[]) ORDER BY name`,
      [[
        "035_analysis_depth_context.sql",
        "036_technical_source_transferability.sql",
        "037_ndvi_raster_custody.sql",
      ]],
    );
    appliedMigrations = migrations.rows.map((row) => row.name);
  }

  return {
    missingColumns: requiredColumns
      .map(([table, column]) => `${table}.${column}`)
      .filter((name) => !presentColumns.has(name)),
    appliedMigrations,
    expectedMigrations: [
      "035_analysis_depth_context.sql",
      "036_technical_source_transferability.sql",
      "037_ndvi_raster_custody.sql",
    ],
  };
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

  const schema = await inspectSchema();

  return Response.json(
    {
      status: checks.every((item) => item.ok) && schema.missingColumns.length === 0 ? "ok" : "failed",
      checks,
      schema,
      note: "sanitized-dashboard-diagnostic-no-operational-data",
    },
    { status: 200, headers: HEADERS },
  );
}
