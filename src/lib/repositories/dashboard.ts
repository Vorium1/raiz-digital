import { withTenant } from "@/lib/db";

export type DashboardSnapshot = {
  activeAnalyses: number;
  awaitingReview: number;
  inconsistent: number;
  collectedPoints: number;
  clients: number;
};

export async function getDashboardSnapshot(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<DashboardSnapshot>(
      `SELECT
        (SELECT count(*)::int FROM analyses WHERE status NOT IN ('ARCHIVED','REPORT_SENT')) AS "activeAnalyses",
        (SELECT count(*)::int FROM analyses WHERE status = 'AWAITING_REVIEW') AS "awaitingReview",
        (SELECT count(*)::int FROM analyses WHERE status = 'INCONSISTENT') AS inconsistent,
        (SELECT count(*)::int FROM sample_points WHERE collected_at IS NOT NULL) AS "collectedPoints",
        (SELECT count(*)::int FROM clients) AS clients`,
    );
    return result.rows[0];
  });
}
