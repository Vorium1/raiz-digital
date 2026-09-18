import { notFound } from "next/navigation";
import { requirePlatformSession } from "@/lib/auth/session";
import { getFieldOverview } from "@/lib/repositories/field-overview";
import { listOperationalAlerts } from "@/lib/repositories/alerts";
import { getAnalysisEvidenceState } from "@/lib/repositories/analysis-evidence";
import { SimpleFieldOverview } from "@/components/simple-field-overview";

export const metadata = { title: "Talhão" };

const AUTO_REFRESH_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

export default async function FieldOverviewPage({ params }: { params: Promise<{ fieldId: string }> }) {
  const { fieldId } = await params;
  const session = await requirePlatformSession();
  const overview = await getFieldOverview(session.tenantId, fieldId, session.userId);
  if (!overview) notFound();

  const currentSeason = overview.seasons[0] ?? null;
  const latestAnalysis = overview.analyses.find((analysis) => !currentSeason || analysis.cropSeasonId === currentSeason.id) ?? null;
  const [alerts, analysisEvidence] = await Promise.all([
    listOperationalAlerts(session.tenantId, session.userId),
    latestAnalysis
      ? getAnalysisEvidenceState({
          tenantId: session.tenantId,
          userId: session.userId,
          analysisId: latestAnalysis.id,
        })
      : Promise.resolve(null),
  ]);

  return (
    <div className="simple-field-shell">
      <SimpleFieldOverview
        overview={overview}
        alerts={alerts.filter((alert) => alert.fieldId === fieldId)}
        analysisFreshness={analysisEvidence?.freshness ?? null}
        canRefreshAnalysis={AUTO_REFRESH_ROLES.has(session.role)}
      />
    </div>
  );
}
