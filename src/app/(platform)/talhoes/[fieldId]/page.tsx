import { notFound } from "next/navigation";
import { requirePlatformSession } from "@/lib/auth/session";
import { getFieldOverviewCore } from "@/lib/repositories/field-overview";
import { getAnalysisEvidenceState } from "@/lib/repositories/analysis-evidence";
import { getDecisionDeliveryStatuses } from "@/lib/repositories/decision-delivery-status";
import { SimpleFieldOverview } from "@/components/simple-field-overview";

export const metadata = { title: "Talhão" };

const AUTO_REFRESH_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

export default async function FieldOverviewPage({ params }: { params: Promise<{ fieldId: string }> }) {
  const { fieldId } = await params;
  const session = await requirePlatformSession();
  const overview = await getFieldOverviewCore(session.tenantId, fieldId, session.userId);
  if (!overview) notFound();

  const currentSeason = overview.seasons[0] ?? null;
  const latestAnalysis = overview.analyses.find((analysis) => !currentSeason || analysis.cropSeasonId === currentSeason.id) ?? null;
  const [analysisEvidence, deliveryRows] = await Promise.all([
    latestAnalysis
      ? getAnalysisEvidenceState({
          tenantId: session.tenantId,
          userId: session.userId,
          analysisId: latestAnalysis.id,
        })
      : Promise.resolve(null),
    latestAnalysis
      ? getDecisionDeliveryStatuses(session.tenantId, [latestAnalysis.id], session.userId)
      : Promise.resolve([]),
  ]);

  return (
    <div className="simple-field-shell">
      <SimpleFieldOverview
        overview={overview}
        analysisFreshness={analysisEvidence?.freshness ?? null}
        deliveryStatus={deliveryRows[0] ?? null}
        canRefreshAnalysis={AUTO_REFRESH_ROLES.has(session.role)}
      />
    </div>
  );
}
